import express from "express";

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ service: "salesforce-mcp", status: "ok", phase: 0 });
});

// Not /healthz: Cloud Run reserves paths ending in "z"
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`salesforce-mcp listening on :${port}`);
});
