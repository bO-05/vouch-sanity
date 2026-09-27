# STATUS: resume point

A brand-new session should be able to continue from this file alone. It's rewritten at every wrap-up.

**Last updated:** Sun Sep 27, 2026, Day 4 done three days early. The lifecycle runs on Sanity Workflows, the verifier desk and the send-back loop work, and a payment-flag miss was caught and fixed. Verified on production.

## Where we are

- Days 1, 2 and 4 are verified on production (evidence: the last `handoff/BUILD_LOG.md` entry). Day 3 stays unticked in PLAN until the user confirms dictation works in Chrome.
- **Lifecycle = Sanity Workflows** (`@sanity/workflow-engine` 0.35.0, pinned):
  - Definition: `web/src/workflows/need-lifecycle.ts`, deployed as `prod.need-lifecycle.v1` with `web/scripts/workflow-deploy.ts`.
  - Stages: triage → (review) → publishing → open → proof_check → (proof_review) → certifying → fulfilled, plus sent_back and rejected.
  - Server runtime: `web/src/lib/lifecycle/`.
    - `engine.ts`: the engine, start / drain / fire / read.
    - `effects.ts`: the handler registry.
    - `triage-step.ts`: the `jev-triage` effect.
    - `publish-step.ts`: publish and record review.
    - `advance.ts`: `after()` background drain.
  - One private instance per request: `prod.wf-instance.<request id without "need-" and dashes>`.
- **Web app** (https://vouch-sanity.vercel.app, functions in **cdg1 Paris**, next to the Content Lake shard in GCP europe-west1):
  - `/ask`: submit creates the draft. The lifecycle runs in `after()` while the requester watches the stages on the returned private link.
  - `/status#token`: live stages, reasons, the verifier's note, and edit + resubmit when sent back.
  - `/desk`: the verifier desk (passcode + display name → signed httpOnly cookie). Approve / send back / reject; retry stuck automatic steps; start a missing lifecycle.
  - `/requests/[id]`: the trail with Jev decisions, reviews (send-back/reject notes stay private) and lifecycle stages.
- **Timings on production:**
  - Clean submit: triage 5.1 s + publishing 4.0 s ≈ 9 s to live (Day 3 without the engine: 1.4 s).
  - Approve: published 4.2 s after the click.
  - Reject: 3 s.
  - The engine commits with sync visibility at about 0.8 s each; this is the documented trade-off.
- **Policy:** the `payment_redirect` question was reworded on Day 4 ("money in any form…"; PayPal 0.30 → 0.98). Calibration is 37/37 (`handoff/calibration/`).
- **Dataset:**
  - 15 published requests, all `isDemo`.
  - 6 drafts: 3 waiting at the desk ("Leaving tonight" and "Baby is very sick", both emergencies; "Anything helps", unclear/not material) and 3 rejected.
  - 21 lifecycle instances, 7 reviews (private path), 31 decisions. The pledge invariant holds.

## Exact next action

Day 5 in `handoff/PLAN.md`: the proof flow and the certificate.

1. Ask the user whether "Dictate instead" on /ask worked in Chrome. If it did, tick Day 3 in PLAN and note it in BUILD_LOG.
2. Read RESEARCH §4 (Tesseract.js) and the proof stages in `need-lifecycle.ts` (`open` → `submit-proof` → `proof_check` with effect `jev-proof` → `certifying` with effect `issue-certificate`, or `proof_review` with accept/decline).
   - Changing the definition deploys v2. Instances already running stay on v1, so either keep v1's shape or plan a migration (abort, then start and adopt).
3. **Proof page** (`/requests/[id]/proof`, public, donor or requester):
   - Upload an image, run Tesseract.js OCR in the browser, show editable lines, then submit.
   - Create a `proof` doc (image asset, ocrText, lines), then fire `submit-proof` with `proofId`, then drain.
4. **Handlers** to register in `web/src/lib/lifecycle/effects.ts`:
   - `jev-proof`: one Noul per (receipt line × checklist line) plus "is this a store receipt". Code assigns matches greedily and computes coverage against the policy (`proofMinMatchProbability`, `proofMinCoverage`, `receiptMinProbability`). Outputs `verdict` (`auto_verified` | `needs_review`).
   - `issue-certificate`: canonical payload + SHA-256 → a `certificate` doc; set `fulfilledAt` / `stage: fulfilled` on the need.
   - `record-proof-accepted` / `record-proof-declined`: extend the `record` handler for `target: 'proof'`.
5. **Desk:** add proof reviews (instances at `proof_review`). **Certificate page** with an in-browser SHA-256 check (Web Crypto).
6. Sample receipts for judges (`web/public/`).
7. **Done-check on production:**
   - A matching receipt → auto-verified → certificate → fulfilled.
   - A non-matching receipt → proof review at the desk → decline → back to open.
   - The certificate hash recomputes in the browser.

## Accounts and setup state

| Thing | State |
|---|---|
| GitHub | `gh` as `bO-05`. Private repo https://github.com/bO-05/vouch-sanity (public only at submission, with the user's OK) |
| Vercel | `bo-05`, team `bo05s-projects`, project `vouch-sanity` (`prj_1URHcrG1AU3k4lPHiBSY57hzF2Il`), Root Directory `web`, Node 22.x. **Function region `cdg1`** (project `resourceConfig.functionDefaultRegions`, set by REST PATCH on Day 4; `vercel.json` `regions` was ignored). Not git-connected: `npx -y vercel@latest deploy --prod --yes` from the repo root. Last prod deploy: `dpl_BbJ12bns8WqPk5FKXuDciiJKC3Ts` (Day 4 final). `vercel curl` created a Deployment Protection bypass token for previews |
| Sanity | CLI logged in (Google). Org `oosvo2181`. Project `o8hcpsct` (Content Lake shard `gcp-eu-w1`, Belgium). Token "Vouch web server (Next.js)" (editor). CORS: `http://localhost:3333`, `http://localhost:3000`, `https://vouch-sanity.vercel.app`. Workflows: definition `prod.need-lifecycle.v1`, tag `prod` |
| TypeSafe | Key in `web/.env.local` and Vercel env. `jev-latest` → `jev-1.13.0`: about 240-340 ms per call from cdg1 (129-191 ms from iad1; TypeSafe is likely in the US) |
| Tooling | Node 22.22.0, npm 10.5.1, Windows PowerShell 5.1. Next 16.3.6, React 19.3.0, Studio 6.16.0, next-sanity 13.3.4, @sanity/workflow-engine 0.35.0 (web; the root copy 0.32.0 belongs to @sanity/cli), @typesafe-ai/sdk 0.6.0. `npx -y agent-browser` 0.38.1 |

## IDs and URLs

- Sanity project ID: `o8hcpsct` · dataset `production` (public read; drafts, reviews and workflow docs are private) · org `oosvo2181`
- Public query endpoint: `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...`
- Studio: https://vouch-aid.sanity.studio (appId `h4u1z9yazx543zhzvdop7hjd`)
- Web app: https://vouch-sanity.vercel.app
  - Ask: /ask
  - My requests: /status
  - Verifier desk: /desk
  - An approved request (review + lifecycle in the trail): /requests/need-a7c6a0aa-bea3-49cb-bf73-0b0a0cd31d84
  - A sent-back → resubmitted → published request: /requests/need-fb636847-f795-4dbd-abb3-9ac2fc1e0391
- GitHub repo: https://github.com/bO-05/vouch-sanity
- Verifier demo passcode: only in `web/.env.local` and Vercel env (`VERIFIER_PASSCODE`). Share it in the DEV post at submission.

## Secrets: locations only, never values

- `web/.env.local` (git-ignored): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `TYPESAFE_API_KEY`, `SANITY_API_WRITE_TOKEN`, `VERIFIER_PASSCODE`. Template: `web/.env.example`.
- The same 5 variables are in the Vercel project env (production, preview, development). The 3 secrets are encrypted.
- Derived keys (no new secrets):
  - The intake ticket HMAC key is derived from `SANITY_API_WRITE_TOKEN`.
  - The verifier session HMAC key is derived from `VERIFIER_PASSCODE`; rotating the passcode signs everyone out.
- Scripts in `web/scripts/` read `web/.env.local` via `node --env-file=.env.local`.
- Never type the passcode into a command: read it into a PowerShell variable from `.env.local`.

## Blockers / open questions

- **Waiting on the user:** try "Dictate instead" on /ask in Chrome (allow the microphone).
- **Latency trade-off (for the post):** the engine does 13-31 sequential requests per verb, each commit with sync visibility. A clean request goes live in about 9 s (1.4 s on Day 3), and the UI shows the real stages meanwhile.
- **Day 7 reset script** must also delete the workflow instances (`*[_type == "sanity.workflow.instance" && tag == "prod"]`) and re-run `web/scripts/workflow-migrate.ts`. Re-seeding resets the seeded drafts (`need-demo-09/10`) to `intake` while their instances would say otherwise.
- **Abuse (Day 6):** no rate limit yet on `/ask` (2 Jev calls + a draft + a lifecycle each), pledges, or desk sign-in attempts.
- **Stuck lifecycles:** if an `after()` drain dies, the desk shows the item as stuck after 45 s with "Retry automatic steps". Nothing retries automatically.
- **Definition changes:** a changed definition deploys as v2. Running instances stay pinned to v1.
- Idea (Day 6): a trail "state check" that recomputes each decision's `stateDigest` from the published text.
