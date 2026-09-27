# STATUS: resume point

A brand-new session should be able to continue from this file alone. It's rewritten at every wrap-up.

**Last updated:** Sun Sep 27, 2026, Day 5 done four days early. Receipts close the loop: OCR in the browser, Jev plus a gate in code, the verifier's receipt decisions, and certificates with an in-browser SHA-256 check. Verified on production.

## Where we are

- Days 1, 2, 4 and 5 are verified on production (evidence: the last `handoff/BUILD_LOG.md` entry). Day 3 stays unticked in PLAN until the user confirms dictation works in Chrome.
- **Lifecycle = Sanity Workflows** (`@sanity/workflow-engine` 0.35.0, pinned), definition `prod.need-lifecycle.v1`. Day 5 needed no definition change: every effect of v1 now has a handler.
  - Stages: triage → (review) → publishing → open → proof_check → (proof_review) → certifying → fulfilled, plus sent_back and rejected.
  - Server runtime in `web/src/lib/lifecycle/`:
    - `engine.ts`: start, drain, fire, read.
    - `effects.ts`: the registry.
    - `triage-step.ts`, `publish-step.ts`, `proof-step.ts`: the effects.
    - `advance.ts`: the `after()` drain.
- **Receipts** (new):
  - `/requests/[id]/proof`: Tesseract.js 7 in the browser, then editable lines, then submit.
  - `web/src/lib/proofs.ts`: one revision-guarded transaction creates the public `proof`, the private `receipt-scan.<id>` (photo as a JPEG data URL + raw OCR), and moves the request to `proof_check`. Then `submit-proof` is fired and the lifecycle drains.
  - `jev-proof`: one choice per receipt line (checklist item / another product / not a product) plus "is this a receipt". Code assigns matches, computes coverage and checks every matched line against the OCR text (`proofMinOcrSimilarity` 0.6).
  - `issue-certificate`: canonical JSON + SHA-256 → `certificate-<request id without "need-">`, and the request becomes `fulfilled`.
  - Desk: a receipts section with the private photo, Accept / Decline (a note is required to decline).
  - `/certificates/[id]`: Web Crypto recomputes the hash. Edit the payload and it shows a mismatch.
- **Timings on production:**
  - Receipt read in the browser: 8.1 s the first time.
  - Clean receipt → certificate: 10.4 s after submit.
  - Decline: 8.9 s. Accept → certificate: 13.7 s.
  - Clean request (Day 4): about 9 s to live.
- **Policy:** proof thresholds are match 0.7, coverage 0.8, receipt 0.6 and OCR similarity 0.6 (new, patched into the live policy and the seed). Calibration: proof 11/11, triage 37/37 (`handoff/calibration/`).
- **Dataset:** need-demo-01, 06 and 08 are now `fulfilled` (Day 5 tests: 3 certificates, 4 proofs, 4 `proof_match` decisions, 2 receipt reviews). Anonymous reads see 0 receipt scans, 0 reviews and 0 drafts. The pledge invariant holds.

## Exact next action

Day 6 in `handoff/PLAN.md`: polish and abuse limits.

1. Ask the user whether "Dictate instead" on /ask worked in Chrome. If it did, tick Day 3 in PLAN and note it in BUILD_LOG.
2. **Rate limits** (simple, per IP, in code):
   - `/ask` submissions: 2 Jev calls + a draft + a lifecycle each.
   - Catalog matches.
   - Pledges.
   - Receipt uploads: a Jev call + about 0.5 MB in Sanity each.
   - Desk sign-in attempts.
   - An in-memory limiter per function instance is honest only if the post says so. Otherwise use a Sanity-backed counter document.
3. **Empty and error states** on the feed, request, receipt and desk pages. Also check mobile layouts (the receipt page on a phone camera).
4. **Policy-as-content check:** change a threshold in the Studio and watch the next decision use it. No redeploy.
5. **Optional idea:** a trail "state check" that recomputes each decision's `stateDigest` from the published text.
6. Then Day 7: the reset script (see Blockers) and a full production run of every DoD step, then Day 8: the DEV post.

## Accounts and setup state

| Thing | State |
|---|---|
| GitHub | `gh` as `bO-05`. Private repo https://github.com/bO-05/vouch-sanity (public only at submission, with the user's OK) |
| Vercel | `bo-05`, team `bo05s-projects`, project `vouch-sanity` (`prj_1URHcrG1AU3k4lPHiBSY57hzF2Il`), Root Directory `web`, Node 22.x. **Function region `cdg1`** (project `resourceConfig.functionDefaultRegions`). Not git-connected: `npx -y vercel@latest deploy --prod --yes` from the repo root. Last prod deploy: `dpl_FfkkSLjqCfxTZ8AbygNwtNHwwiWw` (Day 5 final) |
| Sanity | CLI logged in (Google). Org `oosvo2181`. Project `o8hcpsct` (Content Lake shard `gcp-eu-w1`, Belgium). Token "Vouch web server (Next.js)" (editor). CORS: `http://localhost:3333`, `http://localhost:3000`, `https://vouch-sanity.vercel.app`. Workflows: definition `prod.need-lifecycle.v1`, tag `prod`. Studio redeployed on Day 5 (new `receiptScan` type, proof fields, `proofMinOcrSimilarity`) |
| TypeSafe | Key in `web/.env.local` and Vercel env. `jev-latest` → `jev-1.13.0`: about 240-340 ms per call from cdg1 |
| Tooling | Node 22.22.0, npm 10.5.1, Windows PowerShell 5.1. Next 16.3.6, React 19.3.0, Studio 6.16.0, next-sanity 13.3.4, @sanity/workflow-engine 0.35.0, @typesafe-ai/sdk 0.6.0, **tesseract.js 7.0.0** (exact). `npx -y agent-browser` 0.38.1 |

## IDs and URLs

- Sanity project ID: `o8hcpsct` · dataset `production` (public read; drafts, reviews, receipt scans and workflow docs are private: dotted ids) · org `oosvo2181`
- Public query endpoint: `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...`
- Studio: https://vouch-aid.sanity.studio (appId `h4u1z9yazx543zhzvdop7hjd`)
- Web app: https://vouch-sanity.vercel.app
  - Ask: /ask · My requests: /status · Verifier desk: /desk
  - Receipt upload: /requests/<id>/proof (sample receipts: /samples/receipt-groceries.png, -pharmacy, -household, -electronics)
  - Certificates:
    - /certificates/certificate-demo-08 (automatic)
    - /certificates/certificate-demo-01 (volunteer-verified)
    - /certificates/certificate-demo-06 (after a decline)
  - An approved request: /requests/need-a7c6a0aa-bea3-49cb-bf73-0b0a0cd31d84
  - A sent-back → resubmitted → published request: /requests/need-fb636847-f795-4dbd-abb3-9ac2fc1e0391
- GitHub repo: https://github.com/bO-05/vouch-sanity
- Verifier demo passcode: only in `web/.env.local` and Vercel env (`VERIFIER_PASSCODE`). Share it in the DEV post at submission.

## Secrets: locations only, never values

- `web/.env.local` (git-ignored): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `TYPESAFE_API_KEY`, `SANITY_API_WRITE_TOKEN`, `VERIFIER_PASSCODE`. Template: `web/.env.example`.
- The same 5 variables are in the Vercel project env (production, preview, development). The 3 secrets are encrypted.
- Derived keys (no new secrets):
  - The intake ticket HMAC key is derived from `SANITY_API_WRITE_TOKEN`.
  - The verifier session HMAC key is derived from `VERIFIER_PASSCODE`.
- Scripts in `web/scripts/` read `web/.env.local` via `node --env-file=.env.local`.
- Never type the passcode into a command: read it into a PowerShell variable from `.env.local`.

## Blockers / open questions

- **Waiting on the user:** try "Dictate instead" on /ask in Chrome (allow the microphone).
- **Day 7 reset script** must:
  - Delete the `prod` workflow instances and re-run `web/scripts/workflow-migrate.ts`.
  - Delete the Day 5 test data: proofs, `receipt-scan.*`, `certificate-demo-*`, receipt reviews and `proof_match` decisions for need-demo-01/06/08.
  - Re-seed. The seed resets those requests to `open` and the seeded drafts to `intake`.
- **Abuse (Day 6):** no rate limits yet on `/ask`, catalog match, pledges, receipt uploads or desk sign-in.
- **Receipt limits (documented):** one receipt must cover the checklist (coverage ≥ 80%). Quantities aren't checked. A photo is at most about 1.1 MB after downscaling.
- **Stuck lifecycles:** if an `after()` drain dies, the desk shows the item as stuck after 45 s with "Retry automatic steps". Nothing retries automatically.
- **Latency trade-off (for the post):** each engine commit uses sync visibility (about 0.8 s). A clean request goes live in about 9 s, and a clean receipt gets its certificate in about 10 s. The UI shows the real stages meanwhile.
- Line endings: git warns `LF will be replaced by CRLF` on `package-lock.json` (harmless on Windows; Vercel builds fine).
