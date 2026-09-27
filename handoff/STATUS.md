# STATUS: resume point

A brand-new session should be able to continue from this file alone. It's rewritten at every wrap-up.

**Last updated:** Sun Sep 27, 2026, Day 3 done two days early: ask flow, catalog match, calibrated triage gate, private status link, verified on production. Only live speech input is still waiting for the user's microphone test.

## Where we are

- Days 1-3 are verified on production (evidence: the last `handoff/BUILD_LOG.md` entry). Day 3 stays unticked in PLAN until the user confirms dictation works in Chrome.
- **Web app** (https://vouch-sanity.vercel.app):
  - **Feed** of verified requests. **Request page** with checklist, pledges and a trail that now shows real Jev decisions.
  - **`/ask`** (`web/src/app/ask/`): typed or dictated plea → "Suggest a checklist" (catalog match) → the editable checklist → "Submit for verification".
  - **`/status#<token>`** (`web/src/app/status/`): the requester's private page (stage, reasons, emergency resources, their words). With no token it lists the requests remembered in this browser.
- **Intake** (`web/src/lib/intake.ts`):
  - Validate in code → create `drafts.need-<uuid>` (stage `triage`) → one triage fan-out call to Jev → gate in code (`web/src/lib/triage.ts`).
  - **Pass:** one transaction (revision-guarded patch of the draft, create the published document, delete the draft).
  - **Otherwise:** the draft moves to `review` with code-written reasons, or `emergency` (resources shown).
  - **Any failure** → review. Never an automatic publish.
- **Catalog match** (`web/src/lib/catalog-match.ts`): 46 Nouls plus one Choice per number found by code. It's linked to the request's trail with an HMAC "ticket".
- **Calibrated policy** in Sanity: `maxFlagProbability` 0.5, danger flag's own threshold 0.3, `triageMinConfidence` 0.7 (category and language only; urgency never gates), `catalogMinProbability` 0.5.
  - Script: `web/scripts/calibrate-triage.ts`; results in `handoff/calibration/`.
  - 33/33 synthetic pleas routed as expected.
- **Dataset:**
  - 10 published requests: the 8 seeded demos, plus 2 submitted through the app while testing, labeled `isDemo`, with real trails.
  - 7 drafts: 2 seeded (`need-demo-09`/`-10`, stage intake), plus 5 app-submitted demos in `review`, which are material for the Day 4 verifier desk:
    - "Blankets for the cold": contact flag; the story has a fake 555 phone number, so it's a reject case.
    - "Help with groceries": gift cards.
    - "Leaving tonight": emergency.
    - "Baby is very sick": emergency.
    - "School notebooks": Jev was down.
  - 5 demo pledges. The pledge invariant holds.

## Exact next action

Day 4 in `handoff/PLAN.md`: the verifier desk plus the lifecycle, with a 1-day timebox for the Sanity Workflows engine.

1. Ask the user whether the Chrome dictation test worked. If yes, tick Day 3 in PLAN and note it in BUILD_LOG.
2. Read RESEARCH §2.1 (Workflows), then run `& "..\node_modules\.bin\sanity.cmd" workflows --help` from `studio/`. Decide within about 2 hours whether the engine drives the lifecycle. The fallback is the existing `stage` field plus `review` docs, advanced by the same server functions.
3. **Verifier auth:** passcode (`VERIFIER_PASSCODE`) → httpOnly cookie, via a Server Action and `cookies()`. Every desk action re-checks the cookie on the server.
4. **Desk** (`/desk`, verifier only):
   - The review inbox: drafts in `review`, read with the write client using `perspective: 'raw'`.
   - For each: the triage reasons, fired flags, the Jev decision's answers, and the requester's words.
5. **Actions**, each writing a `review` doc (subject = base id, `reviewerName`, note):
   - **Approve:** publish with the same revision-guarded transaction. Factor `publishDraft()` out of `intake.ts`, and set `triage.outcome` kept + `publishedAt`.
   - **Send back:** stage `sent_back` with a note. The requester sees it on `/status#token` and can edit title/story/checklist there. Resubmitting re-runs triage on the same draft.
   - **Reject:** stage `rejected` (the draft stays private).
   - **Never** republish a stale draft over a published request (STATUS blocker below).
6. **Done-check on production:**
   - Approve one review draft → it appears on the feed live, and the trail shows the review.
   - Send one back → the requester's status page shows the note → edit and resubmit → re-triaged.
   - Reject one → it stays a draft and the status page says rejected.
   - A wrong or missing passcode can't reach the desk or call the actions (direct Server Action POST).

## Accounts and setup state

| Thing | State |
|---|---|
| GitHub | `gh` as `bO-05`. Private repo https://github.com/bO-05/vouch-sanity (public only at submission, with the user's OK) |
| Vercel | `bo-05`, team `bo05s-projects`, project `vouch-sanity` (`prj_1URHcrG1AU3k4lPHiBSY57hzF2Il`), Root Directory `web`, Node 22.x. Not git-connected: deploy with `npx -y vercel@latest deploy --prod --yes` from the repo root. Last deploy: `dpl_AbLM9M1YUWZFVotLoXW7rFH8gmMq` (Day 3 final, matches the Day 3 commit; the done-check ran on `dpl_5NkhGEaJU5w9MhUSSXXeBWzpfPBJ`) |
| Sanity | CLI logged in (Google, gilangbram@…). Org `oosvo2181`. Project `o8hcpsct`. Token "Vouch web server (Next.js)" (editor role, id `g-SdGOI9i4nv28`). CORS origins: `http://localhost:3333`, `http://localhost:3000`, `https://vouch-sanity.vercel.app` (no credentials). Studio redeployed on Day 3 (schema: `statusTokenHash`, `catalogMinProbability`, flag `threshold`) |
| TypeSafe | Key in `web/.env.local` and Vercel env. `jev-latest` → `jev-1.13.0`: 129-191 ms per call from Vercel, about 300-500 ms from the laptop |
| Tooling | Node 22.22.0 (runs `.ts` directly), npm 10.5.1, Windows PowerShell 5.1. Next 16.3.6, React 19.3.0, Studio 6.16.0, next-sanity 13.3.4, @sanity/client 8.7.0, @typesafe-ai/sdk 0.6.0. `npx -y agent-browser` 0.38.1 (not on PATH) |

## IDs and URLs

- Sanity project ID: `o8hcpsct` · dataset `production` (public read; drafts private) · org `oosvo2181`
- Public query endpoint: `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...`
- Studio: https://vouch-aid.sanity.studio (appId `h4u1z9yazx543zhzvdop7hjd`)
- Web app: https://vouch-sanity.vercel.app
  - Ask: https://vouch-sanity.vercel.app/ask
  - My requests: https://vouch-sanity.vercel.app/status
  - An app-verified request with a real trail: https://vouch-sanity.vercel.app/requests/need-019de14f-be23-4945-8223-da1038b75620
- GitHub repo: https://github.com/bO-05/vouch-sanity
- First recorded Jev decision (prod): `hlhLRnJC2qq7qfNW6n0PzP` (kind `health_check`)
- Verifier demo passcode: only in `web/.env.local` and Vercel env (`VERIFIER_PASSCODE`). Share it in the DEV post at submission.

## Secrets: locations only, never values

- `web/.env.local` (git-ignored): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `TYPESAFE_API_KEY`, `SANITY_API_WRITE_TOKEN`, `VERIFIER_PASSCODE`. Template: `web/.env.example`.
- The same 5 variables are in the Vercel project env (production, preview, development). The 3 secrets are encrypted.
- The intake ticket's HMAC key is derived from `SANITY_API_WRITE_TOKEN` (no new secret). Rotating that token invalidates open tickets only, which is harmless.
- `studio/` needs no token: the seed uses the CLI login (`--with-user-token`).

## Blockers / open questions

- **Waiting on the user:** try "Dictate instead" on https://vouch-sanity.vercel.app/ask in Chrome (allow the microphone). The agent can't use a microphone.
- **Abuse:** `/ask` (2 Jev calls and 1 draft per submission) and pledges have no rate limit. PLAN Day 6: a simple per-IP limit. Day 7: a demo reset script.
- **Stale drafts:** if a published request ever gets a Studio draft, publishing that draft later would overwrite the live `pledgedQty`. The Studio can't publish requests; Day 4 approval must publish only drafts that have no published version (the transaction's `create` already fails if one exists).
- **Drafts via the CLI:** use `--api-version v2021-06-07` for queries that must see drafts (with 2025-02-19+ the default perspective is `published`).
- **Idea (Day 6):** a state check in the trail. Recompute the state from the published text and compare it with the decision's `stateDigest`, to show "Jev saw exactly these words".
- Day 4: check whether the built-in `sanity workflows` CLI topic replaces `@sanity/workflow-cli`.
