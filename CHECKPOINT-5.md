# Salesforce MCP Voice Agent: Project Checkpoints (v5)

> Living handoff doc. Any agent or person picking up this project: read this first.
> Supersedes CHECKPOINT 1–4. For the voice-integration side, see **HANDOFF.md**.
> Update "Current status" and "Log" at the end of every working session.

## Goal
A voice agent that answers spoken questions using live Salesforce data, through an MCP server hosted on
Google Cloud Run. Built as a personalised demo for a client in the **medical industry** (UK setting, NHS-style A&E).

**Split of work (from 2026-11-07):** Hemanth owns the data, Salesforce and MCP server (Phases 0–3, plus schema and data
support). A colleague owns the voice layer, plugging this MCP server into his existing voice infrastructure (Phase 4 onward).

## Milestones (capture-the-flag)

| # | Milestone | Flag (done when…) | Owner | Status |
|---|-----------|-------------------|-------|--------|
| 0 | Basecamp | Hello-world on Cloud Run; schema deployed; org holds the demo story | Hemanth | ✅ 2026-11-07 |
| 1 | Key to the Vault | Client Credentials token via curl; `SELECT Name FROM Patient__c` returns 3 patients | Hemanth | ✅ 2026-11-07 |
| 2 | Forge the Tools | Inspector locally: `describe_object("Visit__c")` + `run_soql` return clean JSON | Hemanth | ✅ 2026-11-07 |
| 3 | Into the Cloud | Through Cloud Run with the key: same results; without the key: 401 | Hemanth | ✅ 2026-11-07 |
| 4 | Give It a Voice | Spoken "How many patients breached the four-hour standard today?" gets a correct spoken answer | Colleague | 🔄 Handed off |
| 5 | Wear Their Colours | 5–7 scripted questions end-to-end, no SOQL errors, agent stays in persona | Colleague (Hemanth: schema/data) | ⬜ |
| 6 | Capture the Flag | 3 clean dry runs on the demo machine and network; backup video saved | Both | ⬜ |

## Environment

### Code
- **Repo:** https://github.com/Hemanthm44/Salesforce-MCP-v1 (branch `main`)
- **Local path:** `/Users/reactair/Documents/Salesforce-MCP-v1`
- **Stack:** TypeScript, Node 22 (Dockerfile), Express 5, TypeScript 7 (native compiler), tsx for dev
- **Local Node is v26.8.1**, not 22.
- **Dependencies:** `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7 (single deduped copy; npm audit clean)

### Google Cloud
- **Project ID:** `heymello-production` (project number 441317184491)
- **Region:** `europe-west1` (deliberate; keep it)
- **Cloud Run service:** `salesforc-mcp-demov1`, live revision `salesforc-mcp-demov1-00012-8w8` (as of 2026-11-07)
- **URL:** https://salesforc-mcp-demov1-441317184491.europe-west1.run.app (MCP endpoint: `/mcp`)
- **Service settings:** public ingress (protected by bearer token on `/mcp`), **min instances 1**, **request timeout 300 s**
- **Env on Cloud Run:**
  - Secrets: `SF_CLIENT_ID` ← `sf-client-id:latest`, `SF_CLIENT_SECRET` ← `sf-client-secret:latest`,
    `MCP_API_KEY` ← `mcp-api-key:latest`
  - Plain: `SF_INSTANCE_URL=https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com`
- **Service account:** default compute account `441317184491-compute@developer.gserviceaccount.com`, with
  `roles/secretmanager.secretAccessor` on `sf-client-id`, `sf-client-secret` and `mcp-api-key` only (per-secret, not project-wide)
- **Deploys:** Cloud Build continuous deployment on every push to `main` (image swap; env and secrets persist,
  so re-check after the first push following config changes).
- **Secrets (Secret Manager):** `gemini-api-key` (PLACEHOLDER, unused now that the voice layer is handed off),
  `sf-client-id`, `sf-client-secret`, `mcp-api-key`
- **APIs enabled:** Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Generative Language

### Salesforce
- **Org:** Developer Edition, org ID `00DjV000007iKJxUAM`, API version 68.0
- **Admin user:** hemanthuk44.0fe34a909724@agentforce.com
- **My Domain:** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com
- **Token endpoint:** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com/services/oauth2/token
- **Salesforce CLI:** `sf` v2 via npm. Org alias: **`demo-org`**
- **External Client App:** `MCP Voice Agent`. Local distribution, OAuth on, scope `api`, callback https://localhost,
  Client Credentials Flow enabled, Run As = integration user, IP restrictions relaxed. The key and secret are on the
  Settings tab under OAuth Settings (email verification).
- **Integration user:** `mcp-integration@orgfarm-e8c2b27448.demo`: licence Salesforce Integration, profile
  Minimum Access - API Only Integrations, permission set licence Salesforce API Integration,
  permission set `Medical_Demo_Integration_ReadOnly`

## Data model (schema v2)

Metadata API format in `salesforce/metadata/`, deployed with `--metadata-dir`. Full field reference: HANDOFF.md section 3.

- **Account** = hospital · **Doctor__c** · **Condition__c** · **Treatment__c**
- **Patient__c**: MRN (unique), DOB, Age formula, roll-ups (visits, last/next visit, active treatments)
- **Visit__c** (master-detail to Patient): A&E timings, department, triage, arrival mode, handoff, disposition, satisfaction,
  BP, summary; formulas `Wait_Minutes__c`, `Hours_In_Department__c`, `Breached_4hr__c`
- **Lab_Result__c** (master-detail to Visit) · **Patient_Treatment__c** (master-detail to Patient)
- **Case** = complaints: Type values, `Patient__c`, `Visit__c`, `Feedback_Category__c`
- Permission sets: `Medical_Demo_Admin` (admin, full) · `Medical_Demo_Integration_ReadOnly` (integration user, read + View All)

## Demo story (seeded, verified)

St Aldric Hospital, Bristol (fictional). Dr Oliver Bennett (Emergency Medicine), Dr Aisha Rahman (Acute Medicine).
All visits dated **7 Nov 2026**, UK time (= UTC in November). **Synthetic data.**

| Patient | Summary | Wait / hours / 4-hr |
|---|---|---|
| Daniel Hughes, 58 | Ambulance 08:12, cardiac arrest, Resus, seen immediately; CPR, angioplasty; admitted CCU 10:40 | 0 min / 2.5 h / met |
| Megan Clarke, 34 | Walk-in 10:05, vitamin D toxicity; nursing-team handoff; repeat calcium 17:40; discharged 18:20; **complaint** | 35 min / 8.3 h / breached |
| Margaret Ellis, 82 | GP referral 09:30; low Hb and ferritin back 11:20, seen 13:30; admitted AMU 14:15 | 240 min / 4.8 h / breached |

Counts: Account 1, Doctor 2, Condition 3, Treatment 4, Patient 3, Visit 3, Lab_Result 7, Patient_Treatment 4, Case 1.
Six demo questions with example SOQL and expected answers: HANDOFF.md section 4.

## MCP server

- `src/salesforce.ts`: Client Credentials token (cached; on 401 gets a new one and retries once); `sfGet(path)` against
  `/services/data/v68.0`; errors become `SalesforceError`.
- `src/mcp.ts`: tools `list_objects`, `describe_object`, `run_soql` (SELECT only, LIMIT capped at 50, aggregates exempt,
  cleaned output `{totalSize, returned, records}`), `get_record`. Friendly errors with `isError`.
- `src/index.ts`: Express 5. `GET /` → `{"phase":3}`, `GET /health`; `/mcp` protected by `requireApiKey`
  (Bearer token, constant-time compare; 503 if no key configured, 401 if wrong or missing); stateless Streamable HTTP
  on `POST /mcp`; `GET`/`DELETE /mcp` return 405. Loads `.env` via `process.loadEnvFile()` when present.
- **Local `.env`** (gitignored, chmod 600): `SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `MCP_API_KEY`
  (the local key differs from the Cloud Run key). `.env.example` lists the names with blank values.

## Repo layout
```
Salesforce-MCP-v1/
├── CHECKPOINT-5.md        this file
├── HANDOFF.md             for the voice-integration colleague: endpoint, auth, tools, schema, demo Q&A, ops
├── Dockerfile             multi-stage: tsc build → node:22-slim runtime, user "node"
├── .gitignore             node_modules, dist, .env, keys, .sf, .sfdx
├── .env / .env.example
├── package.json / package-lock.json / tsconfig.json
├── src/                   index.ts · mcp.ts · salesforce.ts
└── salesforce/
    ├── metadata/          objects, tabs, permissionsets, standardValueSets, package.xml
    └── data/              seed JSON + plan.json (sf data import tree)
```

## Commands

Local (Mac, zsh):
```bash
npm run dev
npm run build
npx @modelcontextprotocol/inspector
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://salesforc-mcp-demov1-441317184491.europe-west1.run.app/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
The last one should print `401`. Inspector: Streamable HTTP, URL `/mcp`, header `Authorization: Bearer <key>`.

Cloud Shell (bash):
```bash
MCP_KEY=$(gcloud secrets versions access latest --secret=mcp-api-key --project=heymello-production)
curl -s -X POST https://salesforc-mcp-demov1-441317184491.europe-west1.run.app/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer $MCP_KEY" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_soql","arguments":{"query":"SELECT Patient__r.Name, Wait_Minutes__c, Hours_In_Department__c FROM Visit__c WHERE Breached_4hr__c = true"}}}'
unset MCP_KEY
gcloud run services describe salesforc-mcp-demov1 --region=europe-west1 --project=heymello-production
gcloud secrets add-iam-policy-binding mcp-api-key --member="user:COLLEAGUE_EMAIL" --role=roles/secretmanager.secretAccessor --project=heymello-production
```

Salesforce:
```bash
sf project deploy start --metadata-dir salesforce/metadata --target-org demo-org --dry-run --wait 10
sf project deploy start --metadata-dir salesforce/metadata --target-org demo-org --wait 10
sf data query --query "SELECT Patient__r.Name, Wait_Minutes__c, Hours_In_Department__c, Breached_4hr__c FROM Visit__c" --target-org demo-org
```

## Working conventions (user preferences)
- Give **bash commands** for the VS Code terminal, one per block. No `#` comments in command blocks.
- **Multi-line pastes into the terminal are unreliable.** For file contents: `touch`, paste in the editor, save. Small files via single-line `printf`.
- **Always verify a paste was saved** (`wc -c`) before building or deploying. Files have silently stayed empty several times. Auto Save recommended.
- **Mac = zsh; Cloud Shell = bash.** `read -p` works only in Cloud Shell; on the Mac use `read "VAR?prompt"`.
- **All gcloud commands run in Cloud Shell.** The Mac's gcloud is broken (Python 3.9) and not to be used.
- Work phase by phase, confirm each flag, always dry-run Salesforce deploys.
- Never paste secrets into chat; read them with `read -s` and verify with output that doesn't print them.
- Tables for Google Docs: tab-separated text into Google Sheets first, then copy into Docs.

## Gotchas learned so far
- Cloud Run reserves paths ending in `z`: use `/health`.
- zsh: `#` isn't a comment in pasted commands; an unmatched glob aborts the command.
- `npm ci` needs `package-lock.json` committed.
- sf CLI: the old installer copies of sf v1/sfdx in `/usr/local` had to be removed before the npm install.
- Deploys: `--metadata-dir` without `--single-package`. Wrong-file pastes show "Element … invalid at this location";
  check root elements with:
  `for f in salesforce/metadata/package.xml salesforce/metadata/objects/* salesforce/metadata/permissionsets/* salesforce/metadata/standardValueSets/*; do echo "$f -> $(sed -n 2p "$f" | cut -c1-40)"; done`
- XML: `<?xml` first; `&` as `&amp;`. New fields are invisible until a permission set grants access; master-detail fields
  can't be in permission sets; formula and roll-up fields must be read-only.
- Picklist values use plain hyphens; avoid apostrophes in queried names.
- `sf data import tree` isn't re-runnable (duplicate rule, unique MRN): delete before re-seeding.
- External Client App: the secret is visible only in the UI after an email code; changes can take minutes.
  `invalid_client` = wait or wrong key; `no client credentials user enabled` = Run As not set.
- zod 3 advisory: use zod 4. Never `npm audit fix --force`.
- With empty source files `tsc` can still pass; "has no exported member" usually means an unsaved file.
- **Order matters on Cloud Run:** deploy the auth code first (check `GET /` shows `phase: 3`), *then* attach the
  Salesforce secrets. Otherwise `/mcp` would briefly be an open door to org data.
- Shell variables don't survive skipped lines: the IAM loop failed with `Invalid service account ()` because `SA=` wasn't set first.
- Secrets mounted as env vars with `:latest` are read when an instance starts. After rotating a secret, deploy a new revision.
- MCP Streamable HTTP responses come in server-sent-event framing (`event: message` / `data: {...}`); clients must send
  `Accept: application/json, text/event-stream`.
- Not yet tested: `AVG()` on the `Wait_Minutes__c` formula field (Salesforce may refuse to aggregate formulas). HANDOFF gives a fallback.

## Current status
- **Phases 0–3 complete.** Through Cloud Run with the key, run_soql returned Megan (35 min, 8.3 h) and Margaret (240 min, 4.8 h);
  without the key, `401`.
- **Phase 4 onward handed off** to the voice colleague via HANDOFF.md. He needs: read access to `mcp-api-key`
  (grant with the IAM command above, using his email) or the key via a password manager.
- **Hemanth's open items:**
  1. Date-shift and reset script, so "today" questions work on the demo day and the data can be re-seeded.
  2. Test `SELECT AVG(Wait_Minutes__c) FROM Visit__c` and update HANDOFF if it fails.
  3. Support the colleague: schema or data changes, optional new tools (e.g. `get_patient_summary`) if latency needs it.
  4. After the demo: set Cloud Run min instances back to 0 to save cost.

## Log
- **2026-11-04:** Repo scaffolded; hello-world on Cloud Run; APIs enabled; `gemini-api-key` placeholder; DE org created.
- **2026-11-07:** sf CLI v2; schema v1 (commit 1307ac8); A&E story from the user; schema v2 (commit d1d8a08); seed data
  imported and verified. **Phase 0 captured.**
- **2026-11-07:** Integration user + read-only permission set; External Client App `MCP Voice Agent` with Client Credentials;
  token and query verified via curl; local `.env`. **Phase 1 captured.**
- **2026-11-07:** MCP server (SDK 1.32.2, zod 4.6.7) with four tools and guardrails; Inspector test passed locally. **Phase 2 captured.**
- **2026-11-07:** Bearer-token auth on `/mcp` (deployed first, verified `phase: 3`); secrets `sf-client-id`, `sf-client-secret`,
  `mcp-api-key` created in Cloud Shell; per-secret access for the default compute account; Cloud Run revision 00012 with
  secrets, `SF_INSTANCE_URL`, min instances 1, timeout 300 s. Cloud Shell curl with the key returned the breach data;
  the Mac without the key got 401. **Phase 3 captured.** Voice layer handed off to a colleague; HANDOFF.md written.