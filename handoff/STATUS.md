# STATUS: resume point

A brand-new session should be able to continue from this file alone. It's rewritten at every wrap-up.

**Last updated:** Mon Sep 28, 2026. Days 1-6 all done and ticked. Dictation was confirmed on the user's Android phone after the doubled-words fix. Next: Day 7.

## Where we are

- Days 1-6 are verified on production and ticked in PLAN (evidence: `handoff/BUILD_LOG.md`). Day 3's last check, dictation on a real phone, passed on Sep 28 after the fix in `web/src/app/ask/transcript.ts`.
- **Lifecycle = Sanity Workflows** (`@sanity/workflow-engine` 0.35.0, pinned), definition `prod.need-lifecycle.v1`, every effect implemented.
  - Stages: triage → (review) → publishing → open → proof_check → (proof_review) → certifying → fulfilled, plus sent_back and rejected.
  - Runtime in `web/src/lib/lifecycle/`.
- **Rate limits** (new, `web/src/lib/rate-limit.ts`):
  - Per network, counted in private `ratelimit.<limit>-<seconds>.<window>.<hash>` documents (atomic `createIfNotExists` + `inc`).
  - The limits:
    - Catalog matches: 20 per hour.
    - Submits: 5 per hour and 12 per day.
    - Pledges: 30 per hour.
    - Receipts: 6 per hour and 15 per day.
    - Passcode attempts: 10 per 15 min (desk sign-in + Jev health).
  - No IP is stored (HMAC of the network). Expired counters are deleted in `after()`. If Sanity can't count, the action is refused.
- **Error states:** site-wide `error.tsx` / `global-error.tsx` / `not-found.tsx`. Every page says what failed when Sanity is down. The trail reports failed reads of reviews or the lifecycle.
- **Phones:** all 7 pages fit at 390 px and 320 px. The receipt input no longer forces the camera.
- **Policy as content:** proven live. `catalogMinProbability` 0.5 → 0.95 changed the next match from 3 items to 2 with no redeploy, then was restored to 0.5.
- **Dataset:**
  - need-demo-01, 06 and 08 are `fulfilled` (Day 5 tests).
  - The Day 6 checks added 3 `catalog_match` decisions (05:00-05:01 UTC; nothing submitted) and about 10 `ratelimit.*` counters. They expire on their own; the daily ones last until 00:00 UTC.
  - Anonymous reads see 0 counters, 0 receipt scans, 0 reviews and 0 drafts.

## Exact next action

Day 7 in `handoff/PLAN.md`.

1. **Write the demo reset script** (`web/scripts/demo-reset.ts`, with a `--dry-run` flag). It must:
   - Delete the non-demo pledges, proofs, `receipt-scan.*`, `certificate-*`, the reviews, the non-demo requests (published and drafts), and the `ratelimit.*` counters.
   - Delete the `prod` workflow instances.
   - Run `npm run seed`, then `web/scripts/workflow-migrate.ts`.
   - Decide first what happens to the `decision` docs: delete the test ones, or keep them for history.
   - Show the user the dry-run list before deleting anything.
2. **Full production run of every DoD step** (PLAN "Definition of done" 1-7) after the reset, within the limits: 5 submits per hour and 6 receipts per hour per network.
3. Screenshots and a demo video (agent-browser `record start/stop`), for the post.
4. Then Day 8: the DEV post from `handoff/BUILD_LOG.md`.

## Accounts and setup state

| Thing | State |
|---|---|
| GitHub | `gh` as `bO-05`. Private repo https://github.com/bO-05/vouch-sanity (public only at submission, with the user's OK) |
| Vercel | `bo-05`, team `bo05s-projects`, project `vouch-sanity` (`prj_1URHcrG1AU3k4lPHiBSY57hzF2Il`), Root Directory `web`, Node 22.x, function region `cdg1`. Not git-connected: `npx -y vercel@latest deploy --prod --yes` from the repo root. Last prod deploy: `dpl_9fpmDXhK5pvdfKqqm24pagyxmzNU` (Day 6 + the dictation fix) |
| Sanity | CLI logged in (Google). Org `oosvo2181`. Project `o8hcpsct` (Content Lake shard `gcp-eu-w1`, Belgium). Token "Vouch web server (Next.js)" (editor). CORS: `http://localhost:3333`, `http://localhost:3000`, `https://vouch-sanity.vercel.app`. Workflows: definition `prod.need-lifecycle.v1`, tag `prod`. The Studio wasn't redeployed on Day 6 (no schema change; `rateLimit` docs are private and have no schema type) |
| TypeSafe | Key in `web/.env.local` and Vercel env. `jev-latest` → `jev-1.13.0`: about 250-340 ms per call from cdg1 |
| Tooling | Node 22.22.0, npm 10.5.1, Windows PowerShell 5.1. Next 16.3.6, React 19.3.0, Studio 6.16.0, next-sanity 13.3.4, @sanity/client 8.7.0, @sanity/workflow-engine 0.35.0, @typesafe-ai/sdk 0.6.0, tesseract.js 7.0.0 (exact). `npx -y agent-browser` 0.38.1. codebase-memory project `vouch-sanity` re-indexed on Day 6 |

## IDs and URLs

- Sanity project ID: `o8hcpsct` · dataset `production` (public read; drafts, reviews, receipt scans, rate-limit counters and workflow docs are private: dotted ids) · org `oosvo2181`
- Public query endpoint: `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...`
- Studio: https://vouch-aid.sanity.studio (appId `h4u1z9yazx543zhzvdop7hjd`)
- Web app: https://vouch-sanity.vercel.app
  - Ask: /ask · My requests: /status · Verifier desk: /desk (also linked from the feed footer; the nav hides it on phones)
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
- Derived keys (no new secrets), all derived from `SANITY_API_WRITE_TOKEN` except the last:
  - The intake ticket HMAC key.
  - The rate-limit network HMAC key.
  - The verifier session HMAC key, derived from `VERIFIER_PASSCODE`.
- Scripts in `web/scripts/` read `web/.env.local` via `node --env-file=.env.local`.
- Never type the passcode into a command: read it into a PowerShell variable from `.env.local`.

## Blockers / open questions

- Nothing waits on the user. Before the reset script deletes anything, show them the dry-run list.
- **Dictation (resolved Sep 28):** Chrome on Android re-sent the utterance so far, which doubled every word. Fixed in `web/src/app/ask/transcript.ts` (checked by `web/scripts/check-dictation.ts`), and confirmed on the user's phone. Android records one utterance per tap.
- **Rate-limit caveats (for the post):**
  - Fixed windows: a burst across a boundary can reach twice a limit.
  - Limits are per network, so people behind one NAT share them.
  - The limits are code constants, not policy content.
- **Receipt limits (documented):** one receipt must cover the checklist (coverage ≥ 80%). Quantities aren't checked. A photo is at most about 1.1 MB after downscaling.
- **Stuck lifecycles:** if an `after()` drain dies, the desk shows the item as stuck after 45 s with "Retry automatic steps". Nothing retries automatically.
- **Latency trade-off (for the post):** each engine commit uses sync visibility (about 0.8 s). A clean request goes live in about 9 s, and a clean receipt gets its certificate in about 10 s. The UI shows the real stages meanwhile.
- Line endings: git warns `LF will be replaced by CRLF` on some files (harmless on Windows; Vercel builds fine).
