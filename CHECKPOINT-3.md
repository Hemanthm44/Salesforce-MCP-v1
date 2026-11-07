# Salesforce MCP Voice Agent: Project Checkpoints (v3)

> Living handoff doc. Any agent or person picking up this project: read this first.
> Supersedes CHECKPOINT 1 and CHECKPOINT-2. Update "Current status" and "Log" at the end of every working session.

## Goal
A voice agent (Gemini Live) that answers spoken questions using live Salesforce data,
through an MCP server hosted on Google Cloud Run. Built as a personalised demo for a
client in the **medical industry** (UK setting, NHS-style A&E).

## Milestones (capture-the-flag)

| # | Milestone | What you build | Flag (done when…) | Status |
|---|-----------|----------------|-------------------|--------|
| 0 | Basecamp | GCP project + APIs, TS repo, sf CLI + org auth, medical schema, synthetic seed data | Hello-world live on Cloud Run; schema deployed; org holds the demo story | ✅ Done (2026-11-07) |
| 1 | Key to the Vault (SF auth) | External Client App with Client Credentials Flow; integration user with read-only permission set | `curl` to the My Domain token endpoint returns a token; `SELECT Name FROM Patient__c` returns the 3 patients | ⬜ Next |
| 2 | Forge the Tools (MCP local) | MCP server (TS SDK, Streamable HTTP, in the Express app): list_objects, describe_object, run_soql (+ optional get_record, search); token caching, refresh on 401 | MCP Inspector locally calls `describe_object("Visit__c")` and a `run_soql` that returns clean JSON | ⬜ |
| 3 | Into the Cloud | Cloud Run deploy; SF client secret in Secret Manager; min instances 1; longer request timeout; auth on the MCP endpoint | Remote Inspector passes the Phase 2 test against the Cloud Run URL; unauthenticated request rejected | ⬜ |
| 4 | Give It a Voice | Gemini Live agent wired to the MCP server; minimal web client (mic in, audio out); real Gemini key | Spoken "How many patients breached the four-hour standard today?" returns a correct spoken answer from live data | ⬜ |
| 5 | Wear Their Colours | Persona, UK medical vocabulary, schema cheat-sheet in the prompt, chosen voice, branded UI, 5–7 scripted questions | All scripted questions work end-to-end, no SOQL errors, agent stays in persona | ⬜ |
| 6 | Capture the Flag | Latency pass, fallback answers, session reset, logging, backup video | 3 consecutive clean dry runs on the demo machine and network; backup video saved | ⬜ |

Phase-specific gotchas:
- **Phase 1:** Client Credentials needs an explicit Run As user under Edit Policies; use the My Domain token endpoint, never login.salesforce.com; a placeholder callback like https://localhost is fine.
- **Phase 2:** run_soql allows SELECT only, caps LIMIT at 50, trims response fields; return friendly errors the model can recover from.
- **Phase 3:** don't leave the MCP URL open; keep europe-west1.
- **Phase 4:** the GenAI SDK doesn't run MCP tool calls automatically in Live sessions (use ADK McpToolset or bridge them yourself); googleSearch can't be combined with function calling.
- **Phase 5:** pre-load the schema in the prompt; use a filler line while tools run; mention the data is synthetic.
- **Phase 6:** test on the real network and mic; pre-warm the token and Cloud Run.

## Environment

### Code
- **Repo:** https://github.com/Hemanthm44/Salesforce-MCP-v1 (branch `main`)
- **Local path:** `/Users/reactair/Documents/Salesforce-MCP-v1`
- **Stack:** TypeScript, Node 22 (Dockerfile), Express 5, TypeScript 7 (native compiler), tsx for dev
- **Local Node is v26.8.1**, not 22. Local and Cloud Run builds can differ.
- **MCP (from Phase 2):** official TS SDK `@modelcontextprotocol/sdk`, Streamable HTTP transport, mounted in the same Express app

### Google Cloud
- **Project ID:** `heymello-production` (project number 441317184491)
- **Region:** `europe-west1` (deliberate; keep it)
- **Cloud Run service:** `salesforc-mcp-demov1`
- **URL:** https://salesforc-mcp-demov1-441317184491.europe-west1.run.app
- **Deploys:** Cloud Build continuous deployment; every push to `main` builds `/Dockerfile` and deploys. Pushes that only touch `salesforce/` or docs still trigger a build; that's harmless.
- **Current service settings (Phase 0 only):** public access, ingress all, min instances 0
  - Phase 3 must: add auth on the MCP endpoint, set min instances to 1, raise the request timeout
- **APIs enabled:** Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Generative Language
- **Secrets:** `gemini-api-key` version 1 is a PLACEHOLDER. Add the real key in Phase 4.

### Salesforce
- **Org:** Developer Edition, org ID `00DjV000007iKJxUAM`, API version 68.0
- **Admin user:** hemanthuk44.0fe34a909724@agentforce.com
- **My Domain:** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com
- **Token endpoint (Phase 1):** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com/services/oauth2/token
- **Salesforce CLI:** `sf` v2 (`@salesforce/cli`, installed via npm). Org alias: **`demo-org`**
- The org had no sample data (no sample Accounts or Cases), so the demo records are the only records.

## Data model (schema v2, deployed 2026-11-07)

Format: Metadata API (`salesforce/metadata/`), deployed with `--metadata-dir`. One `.object` file per object holds all its fields.

### Objects and fields

**Account** (standard) = hospital. Uses Name, Industry, BillingCity, BillingCountry.

**Doctor__c** (Name = doctor name)
- `Specialty__c` picklist: Emergency Medicine, Acute Medicine, Geriatric Medicine, Cardiology, Endocrinology, General Medicine, Nephrology
- `Hospital__c` lookup → Account (relationship `Doctors`)

**Patient__c** (Name = patient name)
- `MRN__c` text(20), unique, external ID (hospital number, e.g. SAH-100231)
- `Date_of_Birth__c` date · `Age__c` formula `FLOOR((TODAY() - Date_of_Birth__c) / 365.2425)`
- `Gender__c` picklist: Female, Male, Other · `City__c` text
- `Primary_Doctor__c` lookup → Doctor__c (relationship `Primary_Patients`)
- Roll-ups: `Total_Visits__c` (count of Visits where Status = Completed), `Last_Visit__c` (max Visit_Date, Completed),
  `Next_Visit__c` (min Visit_Date, Scheduled), `Active_Treatments__c` (count of Patient_Treatments where Status = Active)

**Visit__c** (auto-number V-00001; master-detail to Patient, relationship `Visits`)
- `Doctor__c` lookup → Doctor__c (relationship `Visits`) · `Condition__c` lookup → Condition__c (relationship `Visits`)
- `Visit_Date__c` date · `Visit_Type__c` picklist: New consultation, Follow-up, Review · `Status__c` picklist: Completed, Scheduled, Cancelled
- `Department__c` picklist: Resus, A&E, Outpatients, Acute Medical Unit
- `Arrival_Mode__c` picklist: Ambulance, Walk-in, GP referral
- `Triage_Category__c` picklist (Manchester Triage, **plain hyphens**): 1 - Immediate, 2 - Very urgent, 3 - Urgent, 4 - Standard, 5 - Non-urgent
- `Arrival_Time__c`, `Seen_Time__c`, `Handoff_Time__c`, `Discharge_Time__c` (discharge or admission) date/time
- `Handoff_To__c` picklist: Nursing team, Specialist team, Ward team
- `Disposition__c` picklist: Discharged with advice, Admitted, Transferred, Left before seen
- `Satisfaction_Score__c` number (1–5)
- `Systolic_BP__c`, `Diastolic_BP__c` numbers · `HbA1c__c` (unused, left over from schema v1) · `Summary__c` long text
- Formulas:
  - `Wait_Minutes__c` = `ROUND((Seen_Time__c - Arrival_Time__c) * 1440, 0)`
  - `Hours_In_Department__c` = `ROUND((Discharge_Time__c - Arrival_Time__c) * 24, 1)`
  - `Breached_4hr__c` (checkbox) = arrival-to-discharge over 4 hours (NHS 4-hour A&E standard)

**Lab_Result__c** (auto-number LR-00001; master-detail to Visit, relationship `Lab_Results`)
- `Test_Name__c` text · `Value__c` number(8,2) · `Unit__c` text · `Reference_Range__c` text
- `Flag__c` picklist: High, Low, Normal, Critical · `Result_Time__c` date/time

**Condition__c** (Name = condition) · `ICD10_Code__c` text · `Category__c` picklist: Cardiovascular, Endocrine, Haematological, Respiratory, Renal

**Treatment__c** (Name = treatment) · `Type__c` picklist: Medication, Lifestyle, Procedure, Therapy · `Description__c` text area

**Patient_Treatment__c** (auto-number PT-00001; master-detail to Patient, relationship `Patient_Treatments`)
- `Condition__c`, `Treatment__c`, `Prescribing_Doctor__c` lookups (relationship `Patient_Treatments` on each parent)
- `Start_Date__c`, `End_Date__c` · `Status__c` picklist: Active, Completed, Discontinued
- `Outcome__c` picklist: Improved, Stable, Worsened, Resolved, Too early to tell
- `Outcome_Measure__c` picklist (HbA1c, Systolic BP; unused by the A&E story) · `Baseline_Value__c`, `Latest_Value__c`
- `Change__c` formula = Latest − Baseline · `Outcome_Notes__c` long text

**Case** (standard) = complaints and feedback
- `Type` standard picklist (StandardValueSet `CaseType`): Complaint, Compliment, Enquiry, plus the defaults (Mechanical, Electrical, Electronic, Structural, Other), kept to avoid deploy failures
- Custom: `Patient__c` lookup → Patient__c (relationship `Cases`), `Visit__c` lookup → Visit__c (relationship `Cases`),
  `Feedback_Category__c` picklist: Wait time, Communication, Clinical care, Facilities

### SOQL relationship cheat-sheet
- Child to parent: `Visit__c.Patient__r.Name`, `Visit__c.Doctor__r.Name`, `Visit__c.Condition__r.Name`,
  `Lab_Result__c.Visit__r.Patient__r.Name`, `Case.Patient__r.Name`, `Doctor__c.Hospital__r.Name`
- Parent to child: `Patient__c` → `Visits__r`, `Patient_Treatments__r`, `Cases__r`; `Visit__c` → `Lab_Results__r`, `Cases__r`;
  `Doctor__c` → `Visits__r`, `Primary_Patients__r`, `Patient_Treatments__r`; `Account` → `Doctors__r`

### Permission sets
- **`Medical_Demo_Admin`**: full access to all custom objects, all custom fields (including the Case fields) and all tabs. Assigned to the admin user.
- Rules learned: master-detail fields can't be listed in permission sets (access is automatic); formula and roll-up fields must be `editable=false`.
- Phase 1 needs a separate **read-only** permission set for the integration user, built the same way.

## Demo story (seeded 2026-11-07)

**Hospital:** St Aldric Hospital, Bristol (fictional; no apostrophe so SOQL doesn't need escaping).
**Doctors:** Dr Oliver Bennett (Emergency Medicine), Dr Aisha Rahman (Acute Medicine).
All times are 7 Nov 2026, UK time (GMT = UTC in November). **All data is synthetic.**

| | Daniel Hughes, 58 (SAH-100231) | Megan Clarke, 34 (SAH-100232) | Margaret Ellis, 82 (SAH-100233) |
|---|---|---|---|
| Arrival | 08:12, ambulance | 10:05, walk-in | 09:30, GP referral for a blood check |
| Department / triage | Resus / 1 - Immediate | A&E / 4 - Standard | A&E / 3 - Urgent |
| Seen | 08:12 by Dr Bennett (0 min wait) | 10:40 by Dr Bennett (35 min); handed to nursing team 10:55 | 13:30 by Dr Rahman (240 min wait) |
| Condition | Cardiac arrest (I46.9) | Vitamin D toxicity (E67.3) | Anaemia (D64.9) |
| Bloods | Troponin 2,450 ng/L (Critical); potassium 4.1 (Normal) | Adj. calcium 2.95 (High) 11:45; vitamin D 410 nmol/L (High) 12:30; repeat calcium 2.78 (High) 17:40 | Haemoglobin 78 g/L (Low), ferritin 9 ug/L (Low), both back 11:20 |
| Treatments | CPR and defibrillation (Completed, Improved); coronary angioplasty (Active, Too early to tell) | IV fluids and observation (Completed, Improved, 2.95 → 2.78) | Blood transfusion (Active, Too early to tell) |
| Outcome | Admitted to Coronary Care Unit 10:40 | Discharged with advice 18:20 | Admitted to Acute Medical Unit 14:15 |
| Hours in dept / 4-hr | 2.5 / met | 8.3 / **breached** | 4.8 / **breached** |
| Feedback | – | **Complaint case**: 8-hour wait, Feedback category Wait time, satisfaction 1/5, Status New | – |

Record counts (verified): Account 1, Doctor 2, Condition 3, Treatment 4, Patient 3, Visit 3, Lab_Result 7, Patient_Treatment 4, Case 1.

### Candidate demo questions
1. What happened with Daniel Hughes this morning?
2. How many patients breached the four-hour standard today?
3. Why did Megan Clarke wait so long, and has she complained?
4. What were Margaret Ellis's blood results?
5. What's the average wait to see a doctor today?
6. Which patients were admitted?

### Before the demo
- Shift all dates and times to the demo day so "today" questions work (to do: a date-shift/reset script).
- The seed import can't simply be re-run (see gotchas). Re-seeding needs a delete step first.

## Repo layout
```
Salesforce-MCP-v1/
├── CHECKPOINT-3.md        this file (supersedes earlier checkpoints)
├── Dockerfile             multi-stage: tsc build → node:22-slim runtime, runs as user "node"
├── .dockerignore
├── .gitignore             node_modules, dist, .env, keys, .sf, .sfdx
├── .env.example           placeholders only; real secrets live in Secret Manager
├── package.json           "type": "module"; scripts: dev / build / start
├── package-lock.json      must be committed (Dockerfile uses npm ci)
├── tsconfig.json          NodeNext, strict, src → dist
├── src/index.ts           Express app: GET / and GET /health, listens on $PORT (default 8080)
└── salesforce/
    ├── metadata/                      Metadata API format
    │   ├── package.xml                CustomObject, CustomTab, PermissionSet, StandardValueSet
    │   ├── objects/                   Case, Condition__c, Doctor__c, Lab_Result__c, Patient__c,
    │   │                              Patient_Treatment__c, Treatment__c, Visit__c (.object)
    │   ├── tabs/                      7 .tab files (all custom objects)
    │   ├── permissionsets/            Medical_Demo_Admin.permissionset
    │   └── standardValueSets/         CaseType.standardValueSet
    └── data/                          seed data for sf data import tree
        ├── plan.json                  load order: Account → Doctor → Condition → Treatment → Patient
        │                              → Visit → Lab_Result → Patient_Treatment → Case
        └── Account.json … Case.json   one file per object; cross-references via @referenceId
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
sf data import tree --plan salesforce/data/plan.json --target-org demo-org
sf data query --query "SELECT Patient__r.Name, Department__c, Wait_Minutes__c, Hours_In_Department__c, Breached_4hr__c, Disposition__c FROM Visit__c ORDER BY Arrival_Time__c" --target-org demo-org
for o in Account Doctor__c Condition__c Treatment__c Patient__c Visit__c Lab_Result__c Patient_Treatment__c Case; do echo "== $o"; sf data query --query "SELECT COUNT() FROM $o" --target-org demo-org; done
xmllint --noout salesforce/metadata/package.xml salesforce/metadata/objects/* salesforce/metadata/permissionsets/* salesforce/metadata/standardValueSets/* salesforce/metadata/tabs/*
for f in salesforce/data/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "ok $f"; done
```

## Working conventions (user preferences)
- The user wants maximum control: give **bash commands** to run in the VS Code terminal, one per block.
- **Multi-line heredocs don't paste reliably in the VS Code terminal.** For file contents: create the file with
  `touch`, the user pastes content in the editor and saves. Very small files can be written with a single-line `printf`.
- After pasting, always verify (`wc -c`, `xmllint`, the JSON check loop) before deploying or importing.
- Turn on **File → Auto Save** in VS Code; unsaved files caused an empty `Account.json` once.
- **No gcloud or Homebrew on the Mac.** Run gcloud in **Cloud Shell** or use the console UI.
- The terminal is **zsh**. Don't put `#` comments in command blocks.
- Work phase by phase; confirm each flag before moving on. Always dry-run Salesforce deploys first.
- For the user's sheets and docs: provide tab-separated text, pasted into Google Sheets first, then copied into Google Docs as a table.

## Gotchas learned so far
- Cloud Run reserves URL paths ending in `z`, so the health route is `/health`, not `/healthz`.
- zsh: `#` is not a comment in pasted commands; a glob that matches nothing aborts the whole command (`no matches found`).
- Multi-line pastes sometimes merge lines. Run commands one at a time.
- `npm ci` in the Dockerfile requires `package-lock.json` in the repo.
- Secrets: `read -s VAR` then `printf "%s" "$VAR" | gcloud secrets versions add ...` (never in shell history).
- **sf CLI install:** the old installer copies of sf v1 / sfdx in `/usr/local` blocked the npm install and were removed. npm now skips install scripts by default; the skipped `@salesforce/cli` preinstall check is harmless.
- **Deploys:** use `--metadata-dir` **without** `--single-package` (otherwise "No package.xml found").
- **Wrong-file pastes:** "Element deploymentStatus invalid at this location in type Package" means object XML landed in
  package.xml. Check every file's root element with:
  `for f in salesforce/metadata/package.xml salesforce/metadata/objects/* salesforce/metadata/permissionsets/* salesforce/metadata/standardValueSets/*; do echo "$f -> $(sed -n 2p "$f" | cut -c1-40)"; done`
  Also read the deploy table: a field you changed showing "Unchanged" means the file wasn't updated.
- In Metadata API XML, `<?xml` must be the very first characters, and `&` must be written `&amp;` (e.g. `A&amp;E`).
- New custom fields are invisible to everyone, admins included, until a permission set grants field access.
- Picklist API values use plain hyphens, never en dashes, because voice-generated SOQL must match exactly.
- Avoid apostrophes in record names the agent will query (SOQL escaping).
- Formula/roll-up fields often show "Changed" on every deploy; that's Salesforce normalising them and is harmless.
- **`sf data import tree` is not re-runnable:** a second run hits the Account duplicate rule (DUPLICATES_DETECTED)
  and the unique `MRN__c`. It stops at the first error and creates nothing after it. Delete the data before re-seeding.
- `saveRefs`/`resolveRefs` in plan.json may produce deprecation warnings; they're harmless.

## Current status
- **Phase 0: ✅ complete.** Cloud Run hello-world · repo · APIs · sf CLI + auth · schema v1 + v2 · seed data verified
  (formulas give the expected wait, hours and breach results).
- **Next: Phase 1, Key to the Vault.** Plan:
  1. Create an External Client App in Setup: OAuth on, `api` scope (plus `refresh_token` if needed), Client Credentials Flow enabled,
     callback https://localhost. Copy the consumer key and secret (secret only visible in the UI).
  2. Create an integration user (Salesforce Integration licence, API-only profile) and a read-only permission set
     (e.g. `Medical_Demo_Integration_ReadOnly`): read on Account, Case and all custom objects, and their fields. Deploy it via CLI.
  3. In the External Client App policies, set Run As = integration user.
  4. Flag test: `curl` the token endpoint with `grant_type=client_credentials`, then
     `/services/data/v68.0/query?q=SELECT+Name+FROM+Patient__c` returns the 3 patients.
  5. Store the client ID and secret in Secret Manager (from Cloud Shell) for Phase 3.
- **Gemini key:** still a placeholder; due in Phase 4.
- **Open items:** date-shift/reset script before the demo; optional page layouts for browsing records in the UI.

## Log
- **2026-11-04:** Repo scaffolded in TypeScript. Hello-world deployed to Cloud Run (europe-west1) via Cloud Build.
  APIs enabled, `gemini-api-key` secret created (placeholder). Salesforce Developer Edition org created.
  Client confirmed as medical industry.
- **2026-11-07 (morning):** Installed sf CLI v2 via npm (removed old installer sf v1/sfdx); authorised org as `demo-org`.
  Deployed schema v1: 6 custom objects, 39 fields, 6 tabs, permission set `Medical_Demo_Admin` (commit 1307ac8).
  Wrote CHECKPOINT-2.
- **2026-11-07 (afternoon):** The user supplied the demo story (cardiac arrest, vitamin D overdose with a long wait and complaint,
  elderly patient with a 4-hour wait), set in the UK with 3 hero patients. Deployed schema v2: A&E timing, triage, handoff
  and disposition fields on Visit; 3 formulas (wait, hours, 4-hour breach); new `Lab_Result__c`; Case complaint fields and
  Case Type values; new specialty and category values; updated permission set (79 components, commit d1d8a08).
  Seeded the data with `sf data import tree` (10 JSON files in `salesforce/data/`). Verified counts and formula results.
  **Phase 0 flag captured.**