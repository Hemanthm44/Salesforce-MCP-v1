# Salesforce MCP Voice Agent: Project Checkpoints

> Living handoff doc. Any agent or person picking up this project: read this first.
> Update the "Current status" and "Log" sections at the end of every working session.

## Goal
A voice agent (Gemini Live) that answers spoken questions using live Salesforce data,
through an MCP server hosted on Google Cloud Run. Built as a personalised demo for a
client in the **medical industry**.

## Milestones

| # | Milestone | Flag (done when…) | Status |
|---|-----------|-------------------|--------|
| 0 | Basecamp | Hello-world deploys on Cloud Run; dev org has realistic client-flavoured records | 🟡 In progress (demo data pending) |
| 1 | Key to the Vault (SF auth) | `curl` to the token endpoint returns a token; a SOQL query returns rows | ⬜ |
| 2 | Forge the Tools (MCP local) | MCP Inspector calls `describe_object("Opportunity")` and `run_soql` locally with clean JSON | ⬜ |
| 3 | Into the Cloud | Remote Inspector passes against the Cloud Run URL; unauthenticated requests rejected | ⬜ |
| 4 | Give It a Voice (Gemini Live) | Spoken "top 3 open opportunities" returns a correct spoken answer | ⬜ |
| 5 | Wear Their Colours | 5–7 scripted demo questions work end-to-end, agent stays in persona | ⬜ |
| 6 | Capture the Flag | 3 clean dry runs on the demo machine; backup video saved | ⬜ |

## Environment

### Code
- **Repo:** https://github.com/Hemanthm44/Salesforce-MCP-v1 (branch `main`)
- **Local path:** `/Users/reactair/Documents/Salesforce-MCP-v1`
- **Stack:** TypeScript, Node 22, Express 5, TypeScript 7 (native compiler), tsx for dev
- **MCP (from Phase 2):** official TS SDK `@modelcontextprotocol/sdk`, Streamable HTTP transport, mounted in the same Express app

### Google Cloud
- **Project ID:** `heymello-production` (project number 441317184491)
- **Region:** `europe-west1` (deliberate choice; keep it)
- **Cloud Run service:** `salesforc-mcp-demov1`
- **URL:** https://salesforc-mcp-demov1-441317184491.europe-west1.run.app
- **Deploys:** Cloud Build continuous deployment; every push to `main` builds `/Dockerfile` and deploys
- **Current service settings (Phase 0 only):** public access, ingress all, min instances 0
  - Phase 3 must: add auth on the MCP endpoint, set min instances to 1, raise the request timeout
- **APIs enabled:** Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Generative Language
- **Secrets (Secret Manager):**
  - `gemini-api-key`: version 1 holds a PLACEHOLDER, not a real key. Add the real key in Phase 4.

### Salesforce
- **Org:** Developer Edition
- **My Domain:** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com
- **Token endpoint (Phase 1):** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com/services/oauth2/token
- Use the My Domain URL for auth, never login.salesforce.com

## Repo layout (as of Phase 0)
```
Salesforce-MCP-v1/
├── CHECKPOINTS.md     this file
├── Dockerfile         multi-stage: tsc build → node:22-slim runtime, runs as user "node"
├── .dockerignore
├── .gitignore         ignores node_modules, dist, .env, keys
├── .env.example       placeholders only; real secrets live in Secret Manager
├── package.json       "type": "module"; scripts: dev / build / start
├── package-lock.json  must be committed (Dockerfile uses npm ci)
├── tsconfig.json      NodeNext, strict, src → dist
└── src/index.ts       Express app: GET / and GET /health, listens on $PORT (default 8080)
```

## Commands
```bash
npm run dev                      # local dev with hot reload
npm run build && npm start       # production build, same as Cloud Run runs
curl localhost:8080/             # → {"service":"salesforce-mcp","status":"ok","phase":0}
git push origin main             # deploys to Cloud Run via Cloud Build
```

## Working conventions (user preferences)
- The user wants maximum control: give **bash commands** to run in the VS Code terminal,
  and write files with `cat > file <<'EOF'` heredocs rather than editing silently.
- **No gcloud or Homebrew on the Mac.** Run all gcloud commands in **Cloud Shell**
  (the `>_` icon in the GCP console), or use the console UI.
- Don't put `#` comments inside command blocks meant for the Mac terminal (see gotchas).
- Work phase by phase; confirm each flag before moving on.

## Gotchas learned so far
- Cloud Run reserves URL paths ending in `z`, so the health route is `/health`, not `/healthz`.
- macOS zsh does not treat `#` as a comment in pasted commands by default.
  Fix with `setopt interactivecomments`, or just avoid inline comments.
- Multi-line pastes sometimes merge lines (`.gitignorenpm run build`). Run commands one at a time if output looks odd.
- VS Code: confirm files are saved (`cat file`) before testing; an empty `src/index.ts` means nothing listens on port 8080.
- `npm ci` in the Dockerfile requires `package-lock.json` to be in the repo.
- When storing secrets, use `read -s VAR` then `printf "%s" "$VAR" | gcloud secrets versions add ...`
  so the key never lands in shell history (and never paste the literal placeholder).

## Current status
- **Phase 0:** Cloud Run hello-world ✅ · repo skeleton ✅ · APIs ✅ · Gemini key ⏳ (deferred to Phase 4)
- **Next:** design a medical-industry data model, create its custom objects in the dev org, and seed demo data.
- **Then:** Phase 1 (Salesforce app with Client Credentials Flow, integration user, read-only permission set).

## Log
- **2026-11-04:** Repo scaffolded in TypeScript. Hello-world deployed to Cloud Run (europe-west1)
  via Cloud Build. APIs enabled, `gemini-api-key` secret created (placeholder value).
  Salesforce Developer Edition org created. Client confirmed as medical industry.
