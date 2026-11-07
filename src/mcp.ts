import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sfGet, SalesforceError } from "./salesforce.js";

const MAX_ROWS = 50;
const STANDARD_OBJECTS = new Set(["Account", "Case"]);
const HIDDEN_FIELDS = new Set([
  "IsDeleted",
  "SystemModstamp",
  "LastViewedDate",
  "LastReferencedDate",
  "LastActivityDate",
  "CreatedById",
  "LastModifiedById",
  "LastModifiedDate",
  "MasterRecordId",
  "PhotoUrl",
  "Jigsaw",
  "JigsawCompanyId",
  "CleanStatus",
]);
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const ID_PATTERN = /^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

function errorMessage(err: unknown): string {
  if (err instanceof SalesforceError) {
    return `Salesforce said: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function clean(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clean);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.records) && "totalSize" in obj) {
      return clean(obj.records);
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === "attributes" || val === null || HIDDEN_FIELDS.has(key)) {
        continue;
      }
      out[key] = clean(val);
    }
    return out;
  }
  return value;
}

export function guardSoql(raw: string): { query: string } | { error: string } {
  let query = raw.trim().replace(/;+\s*$/, "");
  if (!/^select\s/i.test(query)) {
    return { error: "Only SELECT queries are allowed. Rewrite the request as a SOQL SELECT." };
  }
  const isAggregate = /\b(count|sum|avg|min|max)\s*\(|\bgroup\s+by\b/i.test(query);
  const limitMatch = query.match(/\blimit\s+(\d+)\s*$/i);
  if (limitMatch) {
    if (Number(limitMatch[1]) > MAX_ROWS) {
      query = query.replace(/\blimit\s+\d+\s*$/i, `LIMIT ${MAX_ROWS}`);
    }
  } else if (!isAggregate) {
    query = `${query} LIMIT ${MAX_ROWS}`;
  }
  return { query };
}

type GlobalDescribe = {
  sobjects: { name: string; label: string; custom: boolean; queryable: boolean }[];
};

type ObjectDescribe = {
  name: string;
  label: string;
  fields: {
    name: string;
    label: string;
    type: string;
    referenceTo: string[];
    relationshipName: string | null;
    calculated: boolean;
    picklistValues: { value: string; active: boolean }[];
  }[];
  childRelationships: { childSObject: string; relationshipName: string | null; field: string }[];
};

type QueryResult = { totalSize: number; done: boolean; records: unknown[] };

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "salesforce-mcp", version: "0.2.0" });

  server.registerTool(
    "list_objects",
    {
      title: "List objects",
      description:
        "List the Salesforce objects available for hospital questions (patients, visits, doctors, lab results, treatments, complaints). Returns API names and labels.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await sfGet<GlobalDescribe>("/sobjects");
        const objects = data.sobjects
          .filter((o) => o.queryable && ((o.custom && o.name.endsWith("__c")) || STANDARD_OBJECTS.has(o.name)))
          .map((o) => ({ name: o.name, label: o.label }));
        return ok(objects);
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  server.registerTool(
    "describe_object",
    {
      title: "Describe object",
      description:
        "Get the fields of one Salesforce object: API names, types, picklist values, lookups and child relationships. Use before writing SOQL if unsure of a field name.",
      inputSchema: { object_name: z.string().describe("Object API name, e.g. Visit__c") },
    },
    async ({ object_name }) => {
      if (!NAME_PATTERN.test(object_name)) {
        return fail("That is not a valid object API name. Use list_objects to see the available names.");
      }
      try {
        const d = await sfGet<ObjectDescribe>(`/sobjects/${object_name}/describe`);
        const fields = d.fields
          .filter((f) => !HIDDEN_FIELDS.has(f.name))
          .map((f) => {
            const field: Record<string, unknown> = { name: f.name, label: f.label, type: f.type };
            if (f.referenceTo.length > 0) field.references = f.referenceTo.join(", ");
            if (f.relationshipName) field.relationship = f.relationshipName;
            const values = f.picklistValues.filter((p) => p.active).map((p) => p.value);
            if (values.length > 0) field.values = values;
            if (f.calculated) field.calculated = true;
            return field;
          });
        const children = d.childRelationships
          .filter((c) => c.relationshipName && (c.childSObject.endsWith("__c") || STANDARD_OBJECTS.has(c.childSObject)))
          .map((c) => ({ object: c.childSObject, relationship: c.relationshipName, field: c.field }));
        return ok({ name: d.name, label: d.label, fields, childRelationships: children });
      } catch (err) {
        return fail(`${errorMessage(err)} Use list_objects to check the object name.`);
      }
    },
  );

  server.registerTool(
    "run_soql",
    {
      title: "Run SOQL query",
      description:
        "Run a read-only SOQL SELECT query against the hospital's Salesforce data. At most 50 rows are returned. Use API names (e.g. Visit__c, Patient__r.Name, Breached_4hr__c). Aggregates like COUNT() and AVG() are allowed.",
      inputSchema: { query: z.string().describe("A SOQL SELECT statement") },
    },
    async ({ query }) => {
      const guarded = guardSoql(query);
      if ("error" in guarded) {
        return fail(guarded.error);
      }
      try {
        const data = await sfGet<QueryResult>(`/query?q=${encodeURIComponent(guarded.query)}`);
        const records = (data.records ?? []).slice(0, MAX_ROWS);
        return ok({ totalSize: data.totalSize, returned: records.length, records: clean(records) });
      } catch (err) {
        return fail(`${errorMessage(err)} Check object and field API names with describe_object, then try again.`);
      }
    },
  );

  server.registerTool(
    "get_record",
    {
      title: "Get record",
      description: "Fetch every readable field of one Salesforce record by object API name and record ID.",
      inputSchema: {
        object_name: z.string().describe("Object API name, e.g. Patient__c"),
        record_id: z.string().describe("15 or 18 character Salesforce record ID"),
      },
    },
    async ({ object_name, record_id }) => {
      if (!NAME_PATTERN.test(object_name) || !ID_PATTERN.test(record_id)) {
        return fail("Invalid object name or record ID. Find the ID with run_soql first.");
      }
      try {
        const data = await sfGet<unknown>(`/sobjects/${object_name}/${record_id}`);
        return ok(clean(data));
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  return server;
}