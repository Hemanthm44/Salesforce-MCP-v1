# Salesforce MCP Voice Agent: Project Checkpoints (v2)

> Living handoff doc. Any agent or person picking up this project: read this first.
> Supersedes CHECKPOINT 1. Update "Current status" and "Log" at the end of every working session.

## Goal
A voice agent (Gemini Live) that answers spoken questions using live Salesforce data,
through an MCP server hosted on Google Cloud Run. Built as a personalised demo for a
client in the **medical industry**.

## Milestones

| # | Milestone | Flag (done when…) | Status |
|---|-----------|-------------------|--------|
| 0 | Basecamp | Hello-world deploys on Cloud Run; dev org has realistic client-flavoured records | 🟡 Schema done, demo data pending |
| 1 | Key to the Vault (SF auth) | `curl` to the token endpoint returns a token; a SOQL query returns rows | ⬜ |
| 2 | Forge the Tools (MCP local) | MCP Inspector calls `describe_object("Patient_Treatment__c")` and `run_soql` locally with clean JSON | ⬜ |
| 3 | Into the Cloud | Remote Inspector passes against the Cloud Run URL; unauthenticated requests rejected | ⬜ |
| 4 | Give It a Voice (Gemini Live) | Spoken "Which treatment worked better for diabetes?" returns a correct spoken answer | ⬜ |
| 5 | Wear Their Colours | 5–7 scripted demo questions work end-to-end, agent stays in persona | ⬜ |
| 6 | Capture the Flag | 3 clean dry runs on the demo machine; backup video saved | ⬜ |

Phase 2 and 4 flags were changed from the generic Opportunity examples to fit the medical data model.

## Environment

### Code
- **Repo:** https://github.com/Hemanthm44/Salesforce-MCP-v1 (branch `main`)
- **Local path:** `/Users/reactair/Documents/Salesforce-MCP-v1`
- **Stack:** TypeScript, Node 22 (Dockerfile), Express 5, TypeScript 7 (native compiler), tsx for dev
- **Local Node is v26.8.1**, not 22. Local and Cloud Run builds can differ; align if something behaves differently.
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
- **Org:** Developer Edition, org ID `00DjV000007iKJxUAM`, API version 68.0
- **Admin user:** hemanthuk44.0fe34a909724@agentforce.com
- **My Domain:** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com
- **Token endpoint (Phase 1):** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com/services/oauth2/token
- Use the My Domain URL for auth, never login.salesforce.com
- **Salesforce CLI:** `sf` v2 (`@salesforce/cli`, installed via npm). Org alias: **`demo-org`**

## Data model (deployed 2026-11-07)

| Object | Purpose | Key fields |
|--------|---------|-----------|
| `Account` (standard) | Hospital / clinic | Name, BillingCity |
| `Doctor__c` | Doctors | Name, `Specialty__c` (Endocrinology, Cardiology, General Medicine, Nephrology), `Hospital__c` → Account |
| `Patient__c` | Patients | Name, `MRN__c` (unique, external ID), `Date_of_Birth__c`, `Age__c` (formula), `Gender__c`, `City__c`, `Primary_Doctor__c` → Doctor; roll-ups: `Total_Visits__c` (completed), `Last_Visit__c`, `Next_Visit__c` (scheduled), `Active_Treatments__c` |
| `Visit__c` | Visits (auto-number V-00001) | `Patient__c` (master-detail), `Doctor__c`, `Condition__c`, `Visit_Date__c`, `Visit_Type__c` (New consultation, Follow-up, Review), `Status__c` (Completed, Scheduled, Cancelled), `Systolic_BP__c`, `Diastolic_BP__c`, `HbA1c__c`, `Summary__c` |
| `Condition__c` | Disease catalog | Name, `ICD10_Code__c`, `Category__c` (Endocrine, Cardiovascular, Respiratory, Renal) |
| `Treatment__c` | Treatment catalog | Name, `Type__c` (Medication, Lifestyle, Procedure, Therapy), `Description__c` |
| `Patient_Treatment__c` | Junction holding outcomes (auto-number PT-00001) | `Patient__c` (master-detail), `Condition__c`, `Treatment__c`, `Prescribing_Doctor__c`, `Start_Date__c`, `End_Date__c`, `Status__c` (Active, Completed, Discontinued), `Outcome__c` (Improved, Stable, Worsened, Resolved, Too early to tell), `Outcome_Measure__c` (HbA1c, Systolic BP), `Baseline_Value__c`, `Latest_Value__c`, `Change__c` (formula), `Outcome_Notes__c` |

Relationship names for SOQL: `Doctor__c.Primary_Patients`, `Doctor__c.Visits`, `Doctor__c.Patient_Treatments`,
`Patient__c.Visits`, `Patient__c.Patient_Treatments`, `Condition__c.Visits`, `Condition__c.Patient_Treatments`,
`Treatment__c.Patient_Treatments`, `Account.Doctors`.

**Permission set `Medical_Demo_Admin`:** full access to all six objects, assigned to the admin user.
Phase 1 needs a separate **read-only** permission set for the integration user, built the same way.
Master-detail fields can't be listed in permission sets; formula and roll-up fields must be `editable=false`.

All demo data is **synthetic**. Say so on the first demo slide.

## Demo story (draft, pending client details)

| Patient | Doctor | Condition | Treatment | Measure | Baseline → latest | Outcome |
|---|---|---|---|---|---|---|
| X | A (Endocrinology) | D1 Type 2 diabetes (E11.9) | T1 Metformin | HbA1c % | 8.4 → 6.9 | Improved |
| Y | A (Endocrinology) | D1 Type 2 diabetes | T2 Lifestyle programme | HbA1c % | 7.6 → 7.4 | Stable |
| Y | B (Cardiology) | D2 Hypertension (I10) | T2 Lifestyle programme | Systolic BP | 152 → 136 | Improved |
| Z | B (Cardiology) | D2 Hypertension | T2 Lifestyle programme | Systolic BP | 158 → 161 | Worsened (follow-up booked) |

Candidate demo questions: "How is X doing?" · "Which treatment worked better for diabetes?" ·
"Which of Dr B's patients aren't responding?" · "Who sees both doctors?" · "Who's due for a follow-up this week?"

Visit dates should be seeded relative to the demo date so "this week" questions work.

**Open decisions before seeding (user to provide):**
1. Conditions/treatments: diabetes + hypertension, or the client's own specialty?
2. Client name and region (hospital name, patient/doctor names, units)
3. 3 hero patients only, or heroes + ~15 background patients?

Seeding plan: JSON files for `sf data import tree` with a plan file, so lookups are wired automatically.

## Repo layout
```
Salesforce-MCP-v1/
├── CHECKPOINT-2.md    this file
├── Dockerfile         multi-stage: tsc build → node:22-slim runtime, runs as user "node"
├── .dockerignore
├── .gitignore         ignores node_modules, dist, .env, keys, .sf, .sfdx
├── .env.example       placeholders only; real secrets live in Secret Manager
├── package.json       "type": "module"; scripts: dev / build / start
├── package-lock.json  must be committed (Dockerfile uses npm ci)
├── tsconfig.json      NodeNext, strict, src → dist
├── src/index.ts       Express app: GET / and GET /health, listens on $PORT (default 8080)
└── salesforce/
    └── metadata/      Metadata API format (deployed with --metadata-dir)
        ├── package.xml
        ├── objects/          6 .object files, each with all its fields
        ├── tabs/             6 .tab files
        └── permissionsets/   Medical_Demo_Admin.permissionset
```

## Commands
```bash
npm run dev
npm run build && npm start
curl localhost:8080/
git push origin main
```
```bash
sf org display --target-org demo-org
sf project deploy start --metadata-dir salesforce/metadata --target-org demo-org --dry-run --wait 10
sf project deploy start --metadata-dir salesforce/metadata --target-org demo-org --wait 10
sf org assign permset --name Medical_Demo_Admin --target-org demo-org
sf sobject list --sobject custom --target-org demo-org
sf data query --query "SELECT Name, Outcome__c, Change__c FROM Patient_Treatment__c" --target-org demo-org
```

## Working conventions (user preferences)
- The user wants maximum control: give **bash commands** to run in the VS Code terminal.
- **Multi-line heredocs don't paste reliably in the VS Code terminal.** For file contents: create the
  file with `touch`, then the user pastes the content in the editor. Keep terminal commands single-line.
- **No gcloud or Homebrew on the Mac.** Run all gcloud commands in **Cloud Shell**
  (the `>_` icon in the GCP console), or use the console UI.
- The terminal is **zsh**. Don't put `#` comments inside command blocks.
- Work phase by phase; confirm each flag before moving on. Always dry-run Salesforce deploys first.

## Gotchas learned so far
- Cloud Run reserves URL paths ending in `z`, so the health route is `/health`, not `/healthz`.
- macOS zsh does not treat `#` as a comment in pasted commands by default.
- zsh aborts a whole command if a glob matches nothing (`no matches found`), e.g. `wc -l folder/*` on an empty folder.
- Multi-line pastes sometimes merge lines (`.gitignorenpm run build`). Run commands one at a time.
- VS Code: confirm files are saved (`cat file`) before testing.
- `npm ci` in the Dockerfile requires `package-lock.json` to be in the repo.
- When storing secrets, use `read -s VAR` then `printf "%s" "$VAR" | gcloud secrets versions add ...`
  so the key never lands in shell history.
- Salesforce CLI: the old installer copies of sf v1 / sfdx in `/usr/local` blocked the npm install;
  they were removed. Login data in `~/.sfdx` and `~/.sf` was kept.
- npm now blocks install scripts by default; the skipped `@salesforce/cli` preinstall script is harmless.
- `sf project deploy start --metadata-dir` must **not** use `--single-package` ("No package.xml found").
- In Metadata API files, `<?xml` must be the very first characters. Check pastes with
  `xmllint --noout <files>` (silent means valid).
- New custom fields are invisible to everyone, admins included, until a permission set grants field access.

## Current status
- **Phase 0:** Cloud Run hello-world ✅ · repo skeleton ✅ · APIs ✅ · sf CLI + org auth ✅ ·
  schema deployed ✅ · demo data ⏳ · Gemini key ⏳ (deferred to Phase 4)
- **Next:** user provides client details → seed demo data with `sf data import tree`.
- **Then:** Phase 1 (External Client App with Client Credentials Flow, integration user, read-only permission set).

## Log
- **2026-11-04:** Repo scaffolded in TypeScript. Hello-world deployed to Cloud Run (europe-west1)
  via Cloud Build. APIs enabled, `gemini-api-key` secret created (placeholder value).
  Salesforce Developer Edition org created. Client confirmed as medical industry.
- **2026-11-07:** Installed sf CLI v2 via npm (removed old installer sf v1/sfdx), authorised org as `demo-org`.
  Designed the medical data model and deployed it in one metadata deploy: 6 custom objects,
  39 fields (incl. roll-ups and formulas), 6 tabs, permission set `Medical_Demo_Admin` (assigned to admin).
  Verified with a cross-object SOQL query. Committed under `salesforce/metadata/` (commit 1307ac8).