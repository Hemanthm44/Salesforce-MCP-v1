# Salesforce MCP Server: Handoff for Voice Integration

**From:** Hemanth · **Date:** 7 Nov 2026
**What this is:** A hosted MCP server that gives a voice agent read-only access to a demo hospital's Salesforce data.
Your job: connect it to your voice infrastructure. Phases 0–3 (data, Salesforce auth, MCP server, cloud hosting) are done and tested.

## 1. Endpoint and authentication

| | |
|---|---|
| URL | `https://salesforc-mcp-demov1-441317184491.europe-west1.run.app/mcp` |
| Transport | MCP **Streamable HTTP**, **stateless** (no session ID; each POST stands alone) |
| Method | `POST` only (`GET` and `DELETE` return 405) |
| Required headers | `Content-Type: application/json`, `Accept: application/json, text/event-stream`, `Authorization: Bearer <MCP key>` |
| Responses | Server-sent-event framing: `event: message` then `data: {json-rpc response}` |
| Errors | `401` = missing or wrong key · `503` = server has no key configured · tool errors come back as normal results with `isError: true` |
| Health | `GET /` → `{"service":"salesforce-mcp","status":"ok","phase":3}` (no auth) |

**Getting the key:** it's stored in Google Secret Manager as `mcp-api-key` in project `heymello-production`.
Hemanth grants you read access to that one secret; then run, in Cloud Shell or any working gcloud:

```bash
gcloud secrets versions access latest --secret=mcp-api-key --project=heymello-production
```

Store it in your own secret store. Please don't put it in code, chat or tickets.

**Smoke test:**

```bash
curl -s -X POST https://salesforc-mcp-demov1-441317184491.europe-west1.run.app/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer $MCP_KEY" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Standard MCP clients (official SDKs, Google ADK `McpToolset` with Streamable HTTP connection params, MCP Inspector) work
as long as they can send the `Authorization` header.

## 2. Tools

All tools are **read-only**. Results are compact JSON in a single text content block.

| Tool | Input | Returns |
|---|---|---|
| `list_objects` | none | `[{name, label}]` for the demo objects (custom `__c` objects plus Account and Case) |
| `describe_object` | `object_name` (e.g. `Visit__c`) | `{name, label, fields:[{name,label,type,values?,references?,relationship?,calculated?}], childRelationships:[...]}` |
| `run_soql` | `query` (SOQL SELECT) | `{totalSize, returned, records:[...]}`, with Salesforce `attributes`, nulls and system fields removed |
| `get_record` | `object_name`, `record_id` | one record's readable fields |

Guardrails in `run_soql`:
- SELECT only.
- LIMIT capped at 50 (added automatically if missing; aggregate queries such as COUNT/AVG/GROUP BY are exempt).
- Errors return friendly text telling the model what to try next.

`SELECT COUNT() FROM …` returns the count in `totalSize`, with an empty `records`.

**Latency tip:** put the schema cheat-sheet below in your agent's system prompt so it writes SOQL directly with
`run_soql`, skipping `list_objects` and `describe_object` round-trips. Most questions need exactly one tool call.

## 3. Schema cheat-sheet (for the agent prompt)

Use API names exactly. Picklist values use plain hyphens.

- **Patient__c**: Name, MRN__c (hospital number, e.g. SAH-100231), Date_of_Birth__c, Age__c, Gender__c, City__c,
  Primary_Doctor__r.Name, Total_Visits__c, Last_Visit__c, Active_Treatments__c
- **Visit__c** (one A&E attendance): Patient__r.Name, Doctor__r.Name, Condition__r.Name, Visit_Date__c,
  Department__c (Resus | A&E | Outpatients | Acute Medical Unit),
  Arrival_Mode__c (Ambulance | Walk-in | GP referral),
  Triage_Category__c (1 - Immediate | 2 - Very urgent | 3 - Urgent | 4 - Standard | 5 - Non-urgent),
  Arrival_Time__c, Seen_Time__c, Handoff_To__c (Nursing team | Specialist team | Ward team), Handoff_Time__c,
  Discharge_Time__c (discharge or admission time),
  Disposition__c (Discharged with advice | Admitted | Transferred | Left before seen),
  Satisfaction_Score__c (1–5), Systolic_BP__c, Diastolic_BP__c, Summary__c (narrative),
  **Wait_Minutes__c** (arrival → seen by doctor), **Hours_In_Department__c** (arrival → left), **Breached_4hr__c**
  (true if over the NHS 4-hour A&E standard)
- **Lab_Result__c** (child of Visit): Visit__r.Patient__r.Name, Test_Name__c, Value__c, Unit__c, Reference_Range__c,
  Flag__c (High | Low | Normal | Critical), Result_Time__c
- **Patient_Treatment__c**: Patient__r.Name, Treatment__r.Name, Condition__r.Name, Prescribing_Doctor__r.Name,
  Start_Date__c, End_Date__c, Status__c (Active | Completed | Discontinued),
  Outcome__c (Improved | Stable | Worsened | Resolved | Too early to tell), Outcome_Notes__c
- **Doctor__c**: Name, Specialty__c, Hospital__r.Name · **Condition__c**: Name, ICD10_Code__c · **Treatment__c**: Name, Type__c
- **Case** (complaints/feedback): CaseNumber, Subject, Description, Type (Complaint | Compliment | Enquiry), Status,
  Priority, Feedback_Category__c (Wait time | Communication | Clinical care | Facilities), Patient__r.Name, Visit__r.Name
- **Account** = the hospital (Name)
- Subqueries: `Visit__c` → `Lab_Results__r`, `Cases__r`; `Patient__c` → `Visits__r`, `Patient_Treatments__r`, `Cases__r`
- Date/times are stored in UTC. The demo is set in the UK in November, so UTC equals UK local time.

## 4. Demo story and expected answers

St Aldric Hospital, Bristol (fictional). Dr Oliver Bennett (Emergency Medicine), Dr Aisha Rahman (Acute Medicine).
All visits are on **7 Nov 2026** (to be shifted to the demo day before the demo). **All data is synthetic.**

| Question | Example SOQL | Expected answer |
|---|---|---|
| What happened with Daniel Hughes this morning? | `SELECT Department__c, Triage_Category__c, Arrival_Time__c, Seen_Time__c, Discharge_Time__c, Disposition__c, Summary__c, Doctor__r.Name, Condition__r.Name FROM Visit__c WHERE Patient__r.Name = 'Daniel Hughes'` | Ambulance 08:12, cardiac arrest, seen immediately in Resus by Dr Bennett; CPR and defibrillation, angioplasty; admitted to the Coronary Care Unit 10:40 |
| How many patients breached the four-hour standard today? | `SELECT COUNT() FROM Visit__c WHERE Breached_4hr__c = true AND Visit_Date__c = TODAY` | 2: Megan Clarke (8.3 h) and Margaret Ellis (4.8 h) |
| Why did Megan Clarke wait so long, and has she complained? | Visit fields for Megan + `SELECT Subject, Status, Description FROM Case WHERE Patient__r.Name = 'Megan Clarke'` | Vitamin D toxicity; handed to the nursing team for bloods and observation; kept for a repeat calcium at 17:40; discharged 18:20. Yes, an open complaint about the wait (satisfaction 1/5) |
| What were Margaret Ellis's blood results? | `SELECT Test_Name__c, Value__c, Unit__c, Reference_Range__c, Flag__c FROM Lab_Result__c WHERE Visit__r.Patient__r.Name = 'Margaret Ellis'` | Haemoglobin 78 g/L (low), ferritin 9 ug/L (low) |
| What's the average wait to see a doctor today? | `SELECT AVG(Wait_Minutes__c) FROM Visit__c WHERE Visit_Date__c = TODAY` (if AVG on the formula field is rejected, fetch the values and average them) | About 92 minutes (0, 35 and 240) |
| Which patients were admitted? | `SELECT Patient__r.Name, Department__c, Discharge_Time__c FROM Visit__c WHERE Disposition__c = 'Admitted'` | Daniel Hughes (Coronary Care Unit) and Margaret Ellis (Acute Medical Unit) |

`Visit_Date__c = TODAY` only matches while the data is dated on the current day. Until the dates are shifted, ask
without "today", or have the prompt treat 7 Nov 2026 as today.

## 5. Notes for the voice layer

- **Gemini Live note:** the GenAI SDK doesn't run MCP tool calls automatically in Live sessions. Use ADK's McpToolset,
  or forward function calls to this server yourself. googleSearch can't be combined with function calling in the same setup.
- Have the agent say a short filler ("Let me check that…") while a tool runs; typical tool latency is under a second
  once the instance is warm.
- Read numbers and times naturally ("eight hours fifteen minutes", "seventy-eight grams per litre").
- On a tool error, retry once with corrected field names, then say the information isn't available rather than guessing.
- Patient names have no apostrophes, so SOQL string matching works as written.

## 6. Operations

- **Hosting:** Cloud Run `salesforc-mcp-demov1`, region `europe-west1`, project `heymello-production`. Min instances 1 (warm),
  request timeout 300 s. Logs: Cloud Run → service → Logs.
- **Deploys:** every push to `main` of https://github.com/Hemanthm44/Salesforce-MCP-v1 rebuilds and redeploys.
- **Salesforce access:** External Client App "MCP Voice Agent" (Client Credentials), running as the read-only user
  `mcp-integration@orgfarm-e8c2b27448.demo`. The server can't change Salesforce data.
- **Key rotation:** add a new version to `mcp-api-key`, then deploy a new Cloud Run revision (the key is read when the service
  starts), and update your copy.
- **Owner/contact:** Hemanth. Ask for schema changes, new fields or new demo data.

## 7. Open items on Hemanth's side
- Shift demo dates and times to the demo day, with a repeatable reset script.
- Optional new tools (e.g. a single `get_patient_summary`) if your latency testing shows multi-call questions are slow.