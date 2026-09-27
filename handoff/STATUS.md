# STATUS: resume point

A brand-new session should be able to continue from this file alone. It's rewritten at every wrap-up.

**Last updated:** Sun Sep 27, 2026, Day 2 done a day early (request page, pledges in one guarded transaction, live updates, verified on production)

## Where we are

- Day 1 and Day 2 are done and verified on production (see the last `handoff/BUILD_LOG.md` entry for the evidence).
- **Web app** (https://vouch-sanity.vercel.app):
  - The feed of verified requests; each card links to `/requests/[id]`.
  - The request page shows the story verbatim, the checklist with progress, the pledges and a trail (triage summary, Jev decisions with probabilities, human reviews).
  - Drafts, `drafts.*`/`versions.*` ids and unknown ids return 404.
- **Pledges:**
  - `pledgeAction` (`web/src/app/requests/[id]/actions.ts`) calls `createPledge` (`web/src/lib/pledges.ts`).
  - Code validates everything, then one Sanity transaction creates the pledge and increments the line's `pledgedQty`, guarded by `ifRevisionId`.
  - A 409 conflict is retried after a re-read, with exponential backoff. Pledges are queued per request within an instance.
  - Over-pledging, drafts, contact-looking names and cross-site POSTs are refused.
- **Live updates:** `<SanityLive action="refresh" />` from `defineLive` (`web/src/lib/sanity/live.ts`). The header has a truthful "Live" badge (`web/src/components/live-status.tsx`).
  - Pages that show counts are `force-dynamic` and read with `fetchPublished` (no CDN, no Next cache).
  - A pledge shows up in other browsers about 1.4 s after it's confirmed.
- **Sanity:** schema, seed and Studio are unchanged from Day 1, apart from the seed fix below. The dataset is clean: 8 published demo requests, 2 drafts, 5 demo pledges, no test documents.
  - The seed now recomputes `pledgedQty` from all active pledges (demo + real).
- The codebase is indexed in codebase-memory-mcp as project `vouch-sanity`.

## Exact next action

Day 3 in `handoff/PLAN.md`: submit flow, then catalog match, then triage, then the draft/publish gate, with every decision stored.

1. Read RESEARCH §3 (the Jev API, SDK and design guidance). Check the limits on questions per call and the rate limits before designing the catalog match (46 active supply items means 46 Nouls).
2. `/ask` page (client):
   - Title, story (typed, or dictated with the Web Speech API `SpeechRecognition`/`webkitSpeechRecognition`; fall back to text when unsupported), display name, city, country.
   - Contact-info check with `web/src/lib/contact.ts`.
3. Catalog match (server action, UX assist):
   - One Jev call, with one Noul per active `supplyItem` ("The request asks for {name} (also called {synonyms})").
   - Code pre-fills quantities from numbers in the text and caps them at `maxPerHousehold`.
   - The requester edits the proposed checklist before submitting.
   - Recorded as a `decision` (kind `catalog_match`).
4. Submit (server action):
   - Create `drafts.need-<uuid>`: stage `triage`, `submittedAt`, `pledgedQty: 0` on every line.
   - Run triage in one fan-out Jev call: category (Choice from the `category` docs + "unclear"), urgency (Score, level texts from the policy) and the enabled flag questions from the policy (Nouls).
   - Gate in code with the policy thresholds.
   - **Pass:** publish in one transaction (create the published doc from the draft with stage `open` and `publishedAt`, then delete the draft).
   - **Otherwise:** stage `review` with the reasons composed by code. A danger flag shows the policy's emergency resources.
   - Write `triage` (outcome, reasons, flags, minConfidence, decision ref).
   - **A Jev error means review with the error shown. Never auto-publish.**
5. Decide how a requester comes back to a draft. A send-back on Day 4 needs this: for example a private status link with a random token whose SHA-256 is stored on the draft (a schema change).
6. Calibrate: run the triage questions over about 30 ambiguous sample pleas (script, results in BUILD_LOG), then set the policy thresholds.
7. **Done-check on production:**
   - A clear plea gets published within seconds, appears on the feed live, and its trail shows the triage decision with probabilities.
   - A flagged or ambiguous plea stays a draft: the requester sees "a volunteer will review" plus the reasons, and the public URL returns 404.
   - The emergency path shows the resources.
   - Every Jev call has a `decision` doc.
   - The user can test speech input in Chrome; the agent can't use a microphone.

## Accounts and setup state

| Thing | State |
|---|---|
| GitHub | `gh` as `bO-05`. Private repo https://github.com/bO-05/vouch-sanity (public only at submission, with the user's OK) |
| Vercel | `bo-05`, team `bo05s-projects`, project `vouch-sanity` (`prj_1URHcrG1AU3k4lPHiBSY57hzF2Il`), Root Directory `web`, Node 22.x. Not git-connected: deploy with `npx -y vercel@latest deploy --prod --yes` from the repo root. The global CLI (37.x) is too old. Last deploy: `dpl_DzH9qD36neGj86zUhfVgmUG25Kd4` (Day 2) |
| Sanity | CLI logged in (Google, gilangbram@…). Org `oosvo2181`. Project `o8hcpsct`. Token "Vouch web server (Next.js)" (editor role, id `g-SdGOI9i4nv28`). CORS origins: `http://localhost:3333`, `http://localhost:3000`, `https://vouch-sanity.vercel.app` (no credentials) |
| TypeSafe | Key in `web/.env.local` and Vercel env. Verified: `jev-latest` → `jev-1.13.0`, 151 ms from Vercel |
| Tooling | Node 22.22.0, npm 10.5.1, Windows PowerShell 5.1. Next 16.3.6, React 19.3.0, Studio 6.16.0, next-sanity 13.3.4, @sanity/client 8.7.0, @typesafe-ai/sdk 0.6.0. Browser automation: `npx -y agent-browser` 0.38.1 (not on PATH) |

## IDs and URLs

- Sanity project ID: `o8hcpsct` · dataset `production` (public read; drafts private) · org `oosvo2181`
- Public query endpoint: `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...`
- Studio: https://vouch-aid.sanity.studio (appId `h4u1z9yazx543zhzvdop7hjd`)
- Web app: https://vouch-sanity.vercel.app · request page example: https://vouch-sanity.vercel.app/requests/need-demo-01
- GitHub repo: https://github.com/bO-05/vouch-sanity
- First recorded Jev decision (prod): `hlhLRnJC2qq7qfNW6n0PzP` (kind `health_check`)
- Verifier demo passcode: only in `web/.env.local` and Vercel env (`VERIFIER_PASSCODE`); share it in the DEV post at submission

## Secrets: locations only, never values

- `web/.env.local` (git-ignored): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `TYPESAFE_API_KEY`, `SANITY_API_WRITE_TOKEN`, `VERIFIER_PASSCODE`. Template: `web/.env.example`.
- The same 5 variables are in the Vercel project env (production, preview, development). The 3 secrets are encrypted.
- `studio/` needs no token: the seed uses the CLI login (`--with-user-token`).

## Blockers / open questions

- None blocking.
- The code that renders decisions in the trail (`DecisionEntry`, `web/src/lib/answers.ts`) hasn't run on real data yet, because no request has a decision. Day 3's triage will exercise it; check it then.
- **Abuse:** pledges have no rate limit, so one visitor could fill every demo line. Before judging, add a demo reset script (delete non-demo pledges, then `npm run seed`) and consider a simple per-IP limit (PLAN Day 6/7).
- If a published request ever gets a Studio draft, publishing that draft later would overwrite the live `pledgedQty`. The Studio can't publish requests; the Day 3/4 lifecycle code must never republish a stale draft over a published request.
- Calibrate thresholds on about 30 ambiguous sample pleas (Day 3). The easy health-check plea returned confidence 1.0.
- Day 4: check whether the built-in `sanity workflows` CLI topic replaces `@sanity/workflow-cli`.
