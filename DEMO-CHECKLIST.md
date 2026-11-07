# Demo-Day Checklist: Salesforce MCP Voice Agent

> Owners: **H** = Hemanth (data, Salesforce, MCP server) · **C** = colleague (voice layer) · **B** = both
> Demo date: `____-__-__` · Demo time (local): `__:__` · Venue/network: `__________`
> Tick items as they're done. Commands are in section H.

## A. Build items (finish before T-3 days)

- [ ] **A1 (H)** Give C access to the MCP key (IAM on `mcp-api-key`, or a password manager)
- [ ] **A2 (H)** Test `SELECT AVG(Wait_Minutes__c) FROM Visit__c`; if it fails, update HANDOFF section 4 with the fallback
- [ ] **A3 (H)** Set the integration user's **time zone to Europe/London**
      (Setup → Users → MCP Integration → Edit → Time Zone → "(GMT+00:00) Greenwich Mean Time (Europe/London)").
      SOQL `TODAY` uses this user's time zone.
- [ ] **A4 (H)** Build the reseed script: wipe the demo records, shift all dates to the demo day (same clock times), re-import
- [ ] **A5 (H)** Add tool-call logging to the MCP server (tool, query, rows, milliseconds) in Cloud Run logs
- [ ] **A6 (H)** Optional: a `get_patient_summary` tool, if C's latency tests show multi-call questions are slow
- [ ] **A7 (C)** Phase 4 flag: a spoken "How many patients breached the four-hour standard today?" gets a correct spoken answer
- [ ] **A8 (C)** Phase 5: persona prompt (UK hospital, A&E vocabulary), schema cheat-sheet from HANDOFF section 3,
      filler line while tools run, a graceful "I don't have that information" fallback
- [ ] **A9 (B)** Lock the final 5–7 scripted questions and expected answers (start from HANDOFF section 4)
- [ ] **A10 (C)** Branded UI shell with the client's name and colours; a visible session reset button
- [ ] **A11 (B)** Opening slide: "All patient data in this demo is synthetic"
- [ ] **A12 (B)** Agree roles: who drives the laptop, who speaks to the agent, who narrates

## B. Rehearsal (T-3 to T-2 days)

- [ ] **B1 (B)** Full dry run #1 on the **demo laptop** with the **demo mic or headset**; note every hiccup
- [ ] **B2 (B)** Fix list from B1: wording of questions, prompt tweaks, data tweaks, latency
- [ ] **B3 (B)** Time the script; target a few minutes, leaving room for questions
- [ ] **B4 (B)** Record a backup video of a clean run (screen + audio). Save it **locally on the demo laptop** and in the cloud
- [ ] **B5 (B)** Rehearse the fallback lines: "Let me show you a recording of this flow" (voice fails),
      "Let me check that in Salesforce directly" (tool fails)

## C. Day before (T-1)

- [ ] **C1 (H)** Run the reseed script for the demo date; verify counts and the breach query (section H)
- [ ] **C2 (H)** Check the Salesforce org works: admin login, `sf org display --target-org demo-org`, Client Credentials token test
- [ ] **C3 (H)** Check Cloud Run: min instances 1, latest revision serving, 401 without the key, data with the key
- [ ] **C4 (B)** Dry runs #2 and #3 on the **actual demo network**, or a phone hotspot if the venue Wi-Fi is unknown
- [ ] **C5 (B)** Final backup video saved locally; open it once to make sure it plays offline
- [ ] **C6 (H)** Check status.salesforce.com and the Google Cloud status page for maintenance on the demo date
- [ ] **C7 (B)** Laptop charged, charger packed, OS updates postponed, adapters (HDMI/USB-C) packed

## D. Demo morning (T-2 hours)

- [ ] **D1 (H)** If the data isn't already dated today, rerun the reseed script for today
- [ ] **D2 (H)** Health checks (section H): `GET /` shows phase 3; `/mcp` without the key → 401; breach query with the key returns Megan and Margaret
- [ ] **D3 (C)** Voice layer up; one warm-up question off-screen, to warm the Salesforce token and the voice session
- [ ] **D4 (B)** Browser tabs ready, in this order: voice UI · Salesforce Patients tab (visual backup) · backup video · Cloud Run logs
- [ ] **D5 (B)** Do Not Disturb on; close Slack, email and other notifications; hide bookmarks with client or internal names
- [ ] **D6 (B)** Audio: mic input level, speaker volume, no echo when screen-sharing (headset preferred)
- [ ] **D7 (B)** Network test on the venue network; hotspot ready as a fallback

## E. Last 5 minutes (T-5)

- [ ] **E1 (C)** Reset the voice session so the demo starts clean
- [ ] **E2 (B)** One silent check question ("How many patients came in today?") → expect 3
- [ ] **E3 (B)** Synthetic-data slide on screen; script within reach

## F. During the demo

- Ask the scripted questions in order; don't improvise questions about data that isn't in the org.
- **Slow answer:** let the filler line play; narrate what's happening ("it's querying Salesforce live").
- **Tool error:** the agent should say it can't find that. Move to the next question; show the record in the Salesforce tab.
- **Voice or network failure:** switch to the backup video within about 15 seconds; don't debug live.
- **Someone asks "is this real patient data?":** "No. It's synthetic data in a Salesforce sandbox, built to mirror an A&E day."

## G. After the demo

- [ ] **G1 (H)** Set Cloud Run min instances back to 0 (section H) to stop paying for the idle instance
- [ ] **G2 (H)** If the key was shared widely, rotate `mcp-api-key` and deploy a new revision (section H)
- [ ] **G3 (H)** Remove C's access to the secret if it's no longer needed
- [ ] **G4 (B)** Write down client feedback and questions they asked that the agent couldn't answer
- [ ] **G5 (H)** Update the checkpoint file with the outcome and next steps

## H. Commands

**Mac (zsh):**
```bash
curl -s https://salesforc-mcp-demov1-441317184491.europe-west1.run.app/
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://salesforc-mcp-demov1-441317184491.europe-west1.run.app/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
sf org display --target-org demo-org
for o in Account Doctor__c Condition__c Treatment__c Patient__c Visit__c Lab_Result__c Patient_Treatment__c Case; do echo "== $o"; sf data query --query "SELECT COUNT() FROM $o" --target-org demo-org; done
sf data query --query "SELECT Patient__r.Name, Visit_Date__c, Wait_Minutes__c, Hours_In_Department__c, Breached_4hr__c FROM Visit__c ORDER BY Arrival_Time__c" --target-org demo-org
```
Expected counts: Account 1, Doctor 2, Condition 3, Treatment 4, Patient 3, Visit 3, Lab_Result 7, Patient_Treatment 4, Case 1.
Expected visits: Daniel 0 min / 2.5 h / false · Margaret 240 / 4.8 / true · Megan 35 / 8.3 / true, all dated the demo day.

**Cloud Shell (bash):**
```bash
MCP_KEY=$(gcloud secrets versions access latest --secret=mcp-api-key --project=heymello-production)
curl -s -X POST https://salesforc-mcp-demov1-441317184491.europe-west1.run.app/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer $MCP_KEY" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_soql","arguments":{"query":"SELECT Patient__r.Name, Wait_Minutes__c, Hours_In_Department__c FROM Visit__c WHERE Breached_4hr__c = true AND Visit_Date__c = TODAY"}}}'
unset MCP_KEY
gcloud run services describe salesforc-mcp-demov1 --region=europe-west1 --project=heymello-production --format="value(spec.template.metadata.annotations)"
```

After the demo (Cloud Shell):
```bash
gcloud run services update salesforc-mcp-demov1 --region=europe-west1 --project=heymello-production --min-instances=0
```

Rotate the MCP key (Cloud Shell). The second command forces a new revision so the new key is picked up:
```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add mcp-api-key --data-file=- --project=heymello-production
gcloud run services update salesforc-mcp-demov1 --region=europe-west1 --project=heymello-production --update-env-vars=KEY_ROTATED_AT=$(date +%s)
```

Reseed (once A4 is built): `npm run reseed -- YYYY-MM-DD`