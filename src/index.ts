import { timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./mcp.js";

try {
  process.loadEnvFile();
} catch {
  console.log("No .env file found; using environment variables.");
}

const app = express();
app.use(express.json());

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.MCP_API_KEY;
  if (!expected) {
    res.status(503).json({ jsonrpc: "2.0", error: { code: -32002, message: "MCP endpoint is not configured." }, id: null });
    return;
  }
  const header = req.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res
      .status(401)
      .set("WWW-Authenticate", 'Bearer realm="mcp"')
      .json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    return;
  }
  next();
}

app.get("/", (_req: Request, res: Response) => {
  res.json({ service: "salesforce-mcp", status: "ok", phase: 3 });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/mcp", requireApiKey);

app.post("/mcp", async (req: Request, res: Response) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

const methodNotAllowed = (_req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`salesforce-mcp listening on port ${port}`);
});