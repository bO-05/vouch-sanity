# STATUS: resume point

A brand-new session should be able to continue from this file alone. It's rewritten at every wrap-up.

**Last updated:** Sat Sep 26, 2026, Day 1 done (setup, schema, seed, Studio and web deployed, first real Jev call recorded)

## Where we are

- The one-time setup is **complete**: Sanity CLI login (Google), private GitHub repo, secrets file with all values filled in, TypeSafe key verified with real calls.
- The Sanity project, schema (9 document types plus objects) and seed data are live. The public dataset exposes published requests only; drafts stay private. This was verified with anonymous GROQ.
- The Studio is deployed with the Vouch structure (Review inbox, Live, Fulfilled, Decisions by kind, Catalog, Policy). Requests can't be published by hand in the Studio.
- The web skeleton is on Vercel:
  - The feed of verified requests (server-rendered, no live updates yet).
  - `/api/status`.
  - `/api/jev/health`, which makes a real Jev call and stores a `decision` doc.
- `web/src/lib/jev.ts` is the single Jev entry point. It records every call, failures included, and treats an unrecorded decision as a failure.
- The codebase is indexed in codebase-memory-mcp as project `vouch-sanity`.

## Exact next action

Day 2 in `handoff/PLAN.md`: feed, request page and pledges, with live updates.
1. Request page `web/src/app/requests/[id]/page.tsx`:
   - Show the story verbatim, the checklist with progress, the pledges, and the trail (decisions and reviews, empty for demo data).
   - Return 404 for drafts: the public client only sees published documents.
2. Pledge flow:
   - A server action or route validates the item key and quantity against the remaining need, in code.
   - It creates the `pledge` and increments `items[_key==...].pledgedQty` in **one transaction**, guarded by `ifRevisionId`, and retries on conflict.
   - Donor display name only.
3. Live updates via next-sanity `defineLive` (Live Content API) on the feed and request page, so pledges show up without a reload.
4. Done-check:
   - Pledge on https://vouch-sanity.vercel.app in one browser; the progress updates in a second browser without a reload.
   - The pledge doc and `pledgedQty` are correct in Sanity.
   - Over-pledging is refused.

## Accounts and setup state

| Thing | State |
|---|---|
| GitHub | `gh` as `bO-05`. Private repo https://github.com/bO-05/vouch-sanity (public only at submission, with the user's OK) |
| Vercel | `bo-05`, team `bo05s-projects`, project `vouch-sanity` (`prj_1URHcrG1AU3k4lPHiBSY57hzF2Il`), Root Directory `web`, Node 22.x. Not git-connected: deploy with `npx -y vercel@latest deploy --prod --yes` from the repo root. Global CLI 37.x is too old |
| Sanity | CLI logged in (Google, gilangbram@…). Org `oosvo2181`. Project `o8hcpsct`. Token "Vouch web server (Next.js)" (editor role, id `g-SdGOI9i4nv28`) |
| TypeSafe | Key in `web/.env.local` and Vercel env. Verified: `jev-latest` → `jev-1.13.0`, 151 ms from Vercel |
| Tooling | Node 22.22.0, npm 10.5.1, Windows PowerShell 5.1. Next 16.3.6, React 19.3.0, Studio 6.16.0, next-sanity 13.3.4, @typesafe-ai/sdk 0.6.0 |

## IDs and URLs

- Sanity project ID: `o8hcpsct` · dataset `production` (public read; drafts private) · org `oosvo2181`
- Public query endpoint: `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...`
- Studio: https://vouch-aid.sanity.studio (appId `h4u1z9yazx543zhzvdop7hjd`)
- Web app: https://vouch-sanity.vercel.app
- GitHub repo: https://github.com/bO-05/vouch-sanity
- First recorded Jev decision (prod): `hlhLRnJC2qq7qfNW6n0PzP` (kind `health_check`)
- Verifier demo passcode: only in `web/.env.local` and Vercel env (`VERIFIER_PASSCODE`); share it in the DEV post at submission

## Secrets: locations only, never values

- `web/.env.local` (git-ignored): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `TYPESAFE_API_KEY`, `SANITY_API_WRITE_TOKEN`, `VERIFIER_PASSCODE`. Template: `web/.env.example`.
- The same 5 variables are in the Vercel project env (production, preview, development). The 3 secrets are encrypted.
- `studio/` needs no token: the seed uses the CLI login (`--with-user-token`).

## Blockers / open questions

- None blocking.
- Calibrate thresholds on about 30 sample pleas (Day 3). The easy health-check plea returned confidence 1.0, so use ambiguous pleas.
- Day 4: check whether the built-in `sanity workflows` CLI topic replaces `@sanity/workflow-cli`.
