# STATUS: resume point

A brand-new session should be able to continue from this file alone. It's rewritten at every wrap-up.

**Last updated:** Thu Oct 1, 2026, Day 7 (part 3).
- Part 1: demo reset done (the user approved the dry run), the full production run of DoD 1-7 passed, and 14 screenshots are saved.
- Part 2: the user found "fulfilled while 2 still needed". Code now counts receipt quantities; coverage is units and the policy needs 1.0. Verified on production.
- Part 3: the requested UI refresh is implemented. Full checks passed; the local feed returned 200 with 20 published requests and no Sanity error. Preview: http://localhost:3000. The automated browser bridge was unavailable; details are in BUILD_LOG.
- Left for Day 7: the demo video. Then Day 8: the post.

## Where we are

- UI refresh (Oct 1): warm, editorial community feed, responsive navigation and restrained CSS motion. npm run check passed; the local response showed 20 published requests and no Sanity load error. A preview was queued in Codex, but the browser automation bridge did not connect.

- Days 1-6 are verified and ticked. On Day 7, the reset, the full DoD run, the screenshots and the quantity fix are ticked in PLAN; the video isn't. Evidence is in `handoff/BUILD_LOG.md` ("Day 7 (part 1)" and "(part 2)").
- **Receipts count quantities (Sep 28, part 2):**
  - `web/src/lib/proof-match.ts`: `readQuantity`, `isQuantityLine`, `ocrAnchors`, and a gate by units.
  - Each proof stores `quantities[]` and `matches[].quantity`; the certificate is `fulfilment-certificate/2`.
  - Policy `proofMinCoverage` = 1.
  - Accepting a short receipt on the desk requires a note.
  - Offline checks: `web/scripts/check-quantities.ts` (58/58). Real Jev: `calibrate-proof.ts` (17/17).
  - The 4 receipts fulfilled before the change are labeled "checked before Vouch counted quantities" on their pages.
- **Lifecycle = Sanity Workflows** (`@sanity/workflow-engine` 0.35.0), definition `prod.need-lifecycle.v1`. Runtime in `web/src/lib/lifecycle/`.
- **New scripts (from `web/`):**
  - `scripts/demo-reset.ts`: dry run unless `--yes`. It backs up to the git-ignored `web/.reset-backups/`, deletes everything in one transaction, then seeds, migrates and runs 11 checks.
  - `scripts/label-demo.ts <ids>`: labels test documents as demo.
- **Current public feed count (Oct 1):** 20 published request rows rendered from Sanity. The item-by-item inventory below is the Sep 28 reset snapshot and was not reconciled during this UI-only pass.
- **The dataset snapshot** (after the reset and the DoD run, Sep 28 12:21-13:05 UTC):
  - **11 published requests:** 8 seeded, `need-demo-09` (approved), plus:
    - "Soap and toothpaste for my kids", `need-9e0e529b-…`: published automatically, 2/2 toothpaste pledged by Nadia.
    - "Blankets and gloves before winter", `need-055dbef8-…`: sent back, resubmitted, published.
  - **Fulfilled with certificates:**
    - Before quantities, v1: demo-08 (automatic), demo-06 (declined electronics, then automatic pharmacy), demo-01 (volunteer-accepted), and demo-04 (the user's own test: jon's electronics declined by "dave", then ron's pharmacy automatic).
    - With quantities, v2:
      - demo-07 (automatic, pharmacy).
      - demo-02 (a short receipt, accepted with a note by Bram: blankets 1 of 2).
      - demo-05 (automatic, household).
  - **Still open for receipts:** demo-03 (household sample), demo-09 (groceries sample), and the two Day 7 requests (pharmacy and household samples).
  - **Private drafts:**
    - `need-demo-10` and "Medicine for my son" (the emergency plea) wait on the desk, for judges to try.
    - "Help with groceries this week" is rejected.
  - Every document from this run is labeled `isDemo`.
  - Decisions: the 3 Day 1 health checks plus about 15 from this run.
  - Anonymous reads: 0 drafts, receipt scans, reviews and counters. The pledge invariant is `[]`.
- **Rate-limit use today** (one network): 4 submits (daily cap 12), about 9 receipts (daily cap 15; the user's 2 included), and a few catalog matches. The daily windows reset at 00:00 UTC.

## Exact next action

0. **Submission kit (local only, never commit it):** `submission/` holds the video guide, the narration script and the DEV post draft. It's excluded via `.git/info/exclude` (not `.gitignore`), at the user's request: the remote repo stays about the app. Read `submission/README.md` first; the steps below are covered there too.

1. **Demo video** (Day 7's last item). Use `agent-browser record start <abs path>.webm` / `record stop`, and explore before recording.
   - Suggested 2-3 minute story:
     1. Feed.
     2. Ask with a clean plea → checklist → submit → live within ~9 s.
     3. Pledge in a second view (live update).
     4. A flagged plea → the desk shows why → approve.
     5. Receipt sample → OCR → auto-verified → certificate → tamper test.
   - Videos are git-ignored (`*.webm`, `*.mp4`); save under `handoff/media/`.
   - Each recording uses real submits and receipts: stay within 5 submits and 6 receipts per hour.
   - Label the new documents with `label-demo.ts`.
   - Optionally run `demo-reset.ts` first. Show the user the dry run, and mention that the reset would delete this run's certificates and trails.
2. **Optional polish:** label the times ("UTC" on server-rendered times, or render them in the browser's time zone).
3. **Day 8: the DEV post** from `handoff/BUILD_LOG.md` (Path Two template), using the screenshots in `handoff/media/`:
   - 00 feed · 01 checklist · 02 published · 03 payment flag · 04 emergency · 05 contact refused.
   - 06 desk · 07 sent back · 08 live pledge · 09 auto-verified receipt · 10 certificate match.
   - 11 desk receipt · 12 edited line · 13 fulfilled trail.
   - 14 quantities read live · 15 fulfilled by units · 16 desk short receipt (accept refused without a note) · 17 certificate v2.
   - Note: 09-13 show the old wording (before quantities).
   - The user's bug report is a strong story for the post: "fulfilled, but 2 still needed".
   - Make the repo public and share the verifier passcode only with the user's OK, at submission.

## Accounts and setup state

| Thing | State |
|---|---|
| GitHub | `gh` as `bO-05`. Private repo https://github.com/bO-05/vouch-sanity (public only at submission, with the user's OK) |
| Vercel | `bo-05`, team `bo05s-projects`, project `vouch-sanity` (`prj_1URHcrG1AU3k4lPHiBSY57hzF2Il`), Root Directory `web`, Node 22.x, function region `cdg1`. Not git-connected: `npx -y vercel@latest deploy --prod --yes` from the repo root. Last prod deploy: `dpl_9DBzKHKMgv774T6SHAP8dSYQ7xrT` (receipt quantities). Studio redeployed the same day with the new proof fields |
| Sanity | CLI logged in (Google). Org `oosvo2181`. Project `o8hcpsct` (Content Lake shard `gcp-eu-w1`, Belgium). Token "Vouch web server (Next.js)" (editor). CORS: `http://localhost:3333`, `http://localhost:3000`, `https://vouch-sanity.vercel.app`. Workflows: definition `prod.need-lifecycle.v1`, tag `prod` |
| TypeSafe | Key in `web/.env.local` and Vercel env. `jev-latest` → `jev-1.13.0`: about 250-300 ms per call |
| Tooling | Node 22.22.0, npm 10.5.1, Windows PowerShell 5.1. Next 16.3.6, React 19.3.0, Studio 6.16.0, next-sanity 13.3.4, @sanity/client 8.7.0, @sanity/workflow-engine 0.35.0, @typesafe-ai/sdk 0.6.0, tesseract.js 7.0.0. `npx -y agent-browser` 0.38.1: use **absolute** paths for `screenshot`/`record` |

## IDs and URLs

- Sanity project ID: `o8hcpsct` · dataset `production` (public read; drafts, reviews, receipt scans, rate-limit counters and workflow docs are private: dotted ids) · org `oosvo2181`
- Public query endpoint: `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...`
- Studio: https://vouch-aid.sanity.studio (appId `h4u1z9yazx543zhzvdop7hjd`)
- Web app: https://vouch-sanity.vercel.app
  - Ask: /ask · My requests: /status · Verifier desk: /desk
  - Sample receipts: /samples/receipt-groceries.png, -pharmacy, -household, -electronics
  - Certificates:
    - /certificates/certificate-demo-08 (automatic)
    - /certificates/certificate-demo-06 (after a decline)
    - /certificates/certificate-demo-01 (volunteer-accepted)
  - An automatically published request: /requests/need-9e0e529b-0f19-49cb-96c8-5414ca6435c2
  - A sent-back → resubmitted → published request: /requests/need-055dbef8-fd58-486e-94c6-42c679ed8d17
  - An approved (Spanish) request: /requests/need-demo-09
- GitHub repo: https://github.com/bO-05/vouch-sanity
- Verifier demo passcode: only in `web/.env.local` and Vercel env (`VERIFIER_PASSCODE`). Share it in the DEV post at submission.

## Secrets: locations only, never values

- `web/.env.local` (git-ignored): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `TYPESAFE_API_KEY`, `SANITY_API_WRITE_TOKEN`, `VERIFIER_PASSCODE`. Template: `web/.env.example`.
- The same 5 variables are in the Vercel project env (production, preview, development). The 3 secrets are encrypted.
- Derived keys (no new secrets): the intake ticket HMAC key, the rate-limit network HMAC key and the verifier session HMAC key.
- Scripts in `web/scripts/` read `web/.env.local` via `node --env-file=.env.local`.
- Never type the passcode into a command. Read it into a PowerShell variable from `.env.local`, as on Day 7: `$p = …Substring(…)`, fill, then `Remove-Variable`.
- `web/.reset-backups/` holds full documents, including private receipt scans. It's git-ignored; never commit it.

## Blockers / open questions

- Nothing waits on the user right now.
- **Before any further reset:** show the user the dry run. A reset deletes this run's trails and certificates, which the post may link to.
- **Documented limits (for the post):**
  - Rate limits: fixed windows, per network, code constants.
  - Receipts:
    - One receipt must show the whole checklist, in full, for an automatic "fulfilled".
    - Only printed quantities count ("3 @ 18.99", "3 x 18.99", "QTY 3", "x3"); a line without one counts as 1. So receipts that don't print quantities go to a volunteer, who must write a public note to accept a short one.
    - A photo is at most about 1.1 MB after downscaling.
  - OCR: the browser's Tesseract reads differently from Node's; always test samples in the browser.
  - Stuck lifecycles show "Retry automatic steps" after 45 s; nothing retries on its own.
  - Latency: a clean request goes live in about 9 s, and a clean receipt gets its certificate in about 10 s. Each engine commit waits for sync visibility.
- **Urgency confidence** is Jev's own Score confidence (distance from a level, e.g. 2.18 → 0.18). It's shown verbatim in trails and never gates. Explain it in the post, or the trail looks buggy.
- Times: server-rendered times (desk, trails) are UTC; the status page uses local time. Neither is labeled.
