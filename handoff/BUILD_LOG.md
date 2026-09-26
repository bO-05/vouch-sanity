# Build log: Vouch (Sanity edition)

A dated journal of how this app gets built with an AI coding agent (OpenCode). It's the raw material for the DEV post's "My Build Process" section. Keep prompts, dead ends and course corrections, not just the wins. Newest entries go at the bottom.

---

## Day 0: Sat Sep 26, 2026. From "can I reuse my old app?" to a plan

This session ran in the old prototype's folder and was brainstorming only. No app code was written.

**Starting point.** I had an unsubmitted weekend-challenge prototype, Vouch (Sep 4-8), which was a voice-first mutual-aid app. The Sanity Challenge had opened, and TypeSafe had just released Jev.

**Key prompt (paraphrased):** "Can this app be my Sanity Challenge entry instead, using Sanity and Jev? Read the challenge pages and the TypeSafe docs. We're still brainstorming whether it's possible."

**What the agent did:**
- Read both challenge pages.
- Read the Sanity docs: Context, Knowledge Bases, App SDK, the Workflows cookbook and early-access notes, and Functions.
- Read the TypeSafe blog, docs and agent skill.
- Audited the prototype's code.

**Uncomfortable finding.** Most of the prototype's trust layer was simulated:
- Proof verification always passed, with a hard-coded 98%.
- "Escrow" was a boolean in a JSON file.
- A failed grant got an unrelated devnet signature labeled as on-chain.

Details are in `handoff/PROTOTYPE_LESSONS.md`. This became the core idea of the rebuild: make trust a real process instead of a claim.

**Decisions and why:**
- **Path Two only.** Vouch maps onto both Path Two bonus items: a workflow where an agent moves a draft forward and a person approves it through the same steps. Path One would mean building a different product and needing an LLM agent loop.
- **Rebuild from scratch in a new repo.** Every commit falls inside the challenge window, and nothing fake carries over. The prototype gets credited in the post, as the rules require.
- **Jev is the only AI.** No LLM touches anyone's words. Jev answers narrow typed questions with calibrated confidence, and code owns the rules.
- **Why Jev fits Sanity Workflows.** Sanity's "AI content pipeline" cookbook runs its checks as an LLM prompt followed by JSON parsing, and it suggests "confidence scores instead of pass/fail" as an adaptation. Jev returns exactly that, natively. TypeSafe says a call takes 70-500 ms, which is fast enough to run triage inside the submit request.
- **Drafts as the trust gate.** An unverified request stays a Sanity draft, which a public dataset doesn't expose. Publishing it means it has been verified.
- **No Solana or payments.** Donors pledge checklist items, and proof closes the loop.
- **Free OCR.** Tesseract.js in the browser, with editable lines before matching. Messy OCR then produces low confidence and goes to a human.

**Workflow setup for the build.** I asked for everything the next sessions need to live inside the new repo, so I'd never have to reopen this chat. I also use the OpenCode app rather than a terminal.

The agent created:
- A `handoff/` folder: `README.md` (start here, with three copy-paste prompts: first session, continue, wrap up), `STATUS.md` (resume point), `PLAN.md`, `RESEARCH.md`, `PROTOTYPE_LESSONS.md` and this log.
- `AGENTS.md` at the root, which OpenCode loads automatically. It includes a rule that the agent runs every command itself, including browser logins.
- `opencode.json`, which auto-loads `PLAN.md` and `STATUS.md` into every session.
- Optional `/next` and `/wrapup` commands that do the same as the prompts.

Each new session starts from the repo files instead of an ever-growing chat.

**Then I asked for no prompts at all.** Key prompt: "can you make a skill or anything in that workspace so I don't have to refer to this again and again, and if I run work there it will automatically do this?"

The agent added a project skill, `.opencode/skills/vouch-autopilot/SKILL.md`, with four routines: START, ONE-TIME SETUP, WORK LOOP and WRAP-UP. It also added an "Autopilot (always on)" section to `AGENTS.md` that tells every session to run START on the first message, whatever I type.

Wrap-ups now happen automatically after each verified milestone, or when I say stop. I pre-authorized the commit and push to the private repo. The copy-paste prompts stayed in `handoff/README.md` as a fallback.

**Next:** Day 1 in `handoff/PLAN.md`: scaffold, Sanity project, schemas and seed data, deploy the skeleton, and make the first real Jev call.

---

## Day 1: Sat, Sep 26. From an empty folder to a live skeleton with a real Jev call

**Goal:** Day 1 in PLAN: one-time setup, scaffold, Sanity project and schemas, seed, deployed Studio, skeleton `web/` on Vercel, first real Jev call, AGENTS.md Commands.

**Prompt:** "go. First session for Vouch (Sanity edition) ... Use the vouch-autopilot skill: run START, then the one-time SETUP, then Day 1." After that I only answered two questions in the chat: my Sanity login provider (Google), and whether the TypeSafe key was in place.

**What shipped:**
- **Accounts and repo.** Sanity CLI login via Google, done by the agent; I clicked through the browser. Private GitHub repo `bO-05/vouch-sanity`. npm workspaces `web/` (Next.js 16.3, React 19.3, Tailwind 4) and `studio/` (Sanity Studio 6.16).
- **Sanity project** `o8hcpsct` with a public `production` dataset, created unattended with `sanity init -y --project-name "Vouch" --organization ... --template clean`.
- **Content model** (`studio/schemaTypes/`):
  - Documents: `need`, `pledge`, `proof`, `certificate`, `decision`, `review`, `category`, `supplyItem`, plus the `policy` singleton.
  - Objects: checklist line, triage summary and flags, receipt line, proof match, flag question, thresholds.
  - Deliberate choices:
    - The requester's `title`, `story` and `displayName` are read-only in the Studio, so nobody can rewrite someone's words.
    - `stage` is server-owned.
    - `decision` stores the exact typed questions and answers, but only a SHA-256 of the state. Otherwise an unverified plea would leak through a published decision document.
    - Decision and review subjects are weak references, because the need may still be a draft.
    - Category descriptions double as Jev's option texts.
    - Policy thresholds, urgency wording, flag questions and emergency resources are content.
- **Studio** (`studio/structure.ts`): Review inbox, Live, Fulfilled, Sent back/rejected, Intake, all requests; pledges, proofs, certificates; Jev decisions by kind; human reviews; catalog; the policy singleton.
  - The Studio can't create server-owned types.
  - It can't publish or unpublish a request by hand: publishing means "verified", so only the lifecycle may do it.
  - Deployed at https://vouch-aid.sanity.studio with the schema deployed alongside it.
- **Seed** (`npm run seed`, idempotent): 7 categories, 46 supply items with synonyms, US price estimates and per-household caps, the policy with starting thresholds and 5 flag questions, 10 demo requests and 5 demo pledges.
  - 8 demo requests are published and 2 stay drafts: a Spanish one, for the bilingual path, and a vague one with no checklist.
  - Every demo document has `isDemo: true` and shows a "Demo" label.
  - The demo requests have no triage summary and no decision documents. Jev never saw them, and the data doesn't pretend it did.
- **Web skeleton:**
  - `web/src/lib/jev.ts`: the only place Jev is called. It records every call, failures included, as a `decision`. If the decision can't be recorded, the result counts as a failure, because an unrecorded decision must never drive a state change.
  - Public published-only client and a server-only write client.
  - `/api/status`: counts, plus booleans for which secrets are set.
  - `/api/jev/health`: passcode-protected; one real call with a fixed made-up plea.
  - A dark obsidian and amber feed of verified requests with pledge progress.
- **Vercel:** project `vouch-sanity` (Root Directory `web`), env vars set, live at https://vouch-sanity.vercel.app.

**Verified by:**
- Anonymous GROQ against `https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production`: 8 needs, 0 drafts, and `drafts.need-demo-09` isn't visible even by id. The authenticated CLI (`sanity documents get drafts.need-demo-09`) does see the draft. The trust gate works at the Content Lake level.
- `GET https://vouch-sanity.vercel.app/api/status` → `{"ok":true, ... "publishedNeeds":8,"supplyItems":46,"policy":true, "configured":{all true}}`.
- The live feed renders the 8 published titles. Neither draft title appears in the HTML.
- `POST /api/jev/health` without the passcode → 401. With it, on production → `model: jev-1.13.0`, 151 ms, category `food` (probability 1.0), material-request noul 0.99. It was recorded as decision `hlhLRnJC2qq7qfNW6n0PzP`, which is publicly readable with questions, answers, latency, tokens and state digest. Two earlier local calls took 514 ms and 439 ms.
- `npm run typecheck`, `npm run lint`, `npm run build:web` and `npm run build:studio` all pass.

**What didn't (and the exact errors):**
1. **`npx sanity@latest login` failed twice before it worked.**
   - First `npm ERR! code ECONNRESET`, a network blip.
   - Then `MODULE_NOT_FOUND ... signal-exit\index.js imported from ... restore-cursor`, from a half-extracted npx cache.
   - Fix: delete that `_npx` cache folder, raise npm's fetch retries, and retry.
2. **The first `npm install` hit the 15-minute tool timeout.**
   - Tarballs were downloading at about 1 MB/s. The kill left `node_modules` half-populated and no lockfile.
   - The retry in the background finished in 71 s from the warm cache.
   - Lesson: long installs go in the background, with their output in a log file.
3. **The npm workspace `studio` "didn't exist".** `npm WARN workspaces studio in filter set, but no workspace folder present`. A plain `npm install` from the root fixed it; the `studio` link had never been created.
4. **@sanity/icons v5 trap.**
   - `tsc` passed, but the Studio build failed: `[MISSING_EXPORT] "CloseCircleIcon" is not exported by @sanity/icons/dist/index.js`.
   - v5 removed the root named exports but still types them as `never` (with a `@deprecated` note), so type-checking can't catch it.
   - Fix: subpath imports (`@sanity/icons/CloseCircle`), plus an ESLint `no-restricted-imports` rule so it can't come back.
5. **The first Vercel deploy failed**: `Error: Cannot find module '../lightningcss.linux-x64-gnu.node'`.
   - The install killed in point 2 had left a degraded lockfile: 1,290 of 1,340 entries had no `resolved` or `integrity`, and the Linux optional binaries had no version.
   - Regenerating it with `npm install --package-lock-only` did nothing while the degraded `node_modules` existed, because npm trusts the installed tree.
   - Fix: move `node_modules` aside, regenerate the lockfile, move it back.
   - Side effect: the regenerated lockfile resolved `react@19.3.0` at the root, while `web` pinned 19.2.8 (two Reacts). Fix: bump web to `^19.3.0`. `npm dedupe` refused because of an unrelated ESLint 9/10 peer conflict between the workspaces.
6. **Vercel CLI too old.** The global 37.12.1 failed: "This endpoint requires version 47.2.2 or later". Using `npx vercel@latest` (60.1.3) fixed it, and v60's `vercel project update --root-directory web` removed the need for the dashboard.
7. **PowerShell 5.1 papercuts.**
   - It strips embedded double quotes from native-command arguments, which broke GROQ: `*[_type=="need"]` arrived as `*[_type==need]`. GROQ accepts single quotes, so use those.
   - `$ErrorActionPreference='Stop'` turned an npm stderr warning into a terminating error halfway through the lockfile repair. Nothing was lost, because the folders were only renamed.
   - `Start-Process` for the local server makes the tool report `ChildProcess.kill`, but the server keeps running.
8. **Slow module loading** (probably antivirus scanning `node_modules`). The studio ESLint config took 39 s just to import; I mistook that for a hang at first.

**Where we got stuck and how we course-corrected:** The lockfile problem was the only real blocker. The Vercel error named a missing native binary, but the root cause was the killed install from an hour earlier. Checking the lockfile's `resolved` counts proved it. This went into AGENTS.md as a standing "lockfile health" check.

**Decisions:**
- Studio host `vouch-aid`. The editor token is created by the CLI (`sanity tokens add ... --role editor --json`) and piped straight into `web/.env.local`.
- The verifier passcode is generated locally with a CSPRNG. Neither secret was ever printed.
- Vercel env vars were set via the REST API from inside PowerShell, so the values never appeared in output.
- The health check uses a fixed made-up plea (no real words) and needs the passcode, so strangers can't spend API calls or fill the dataset.
- Thresholds are placeholders (min confidence 0.7, max flag probability 0.35, proof match 0.7, coverage 0.8, receipt 0.6) until we calibrate on about 30 sample pleas. The easy plea came back at confidence 1.0, so calibration must use ambiguous pleas.

**Next:** Day 2: feed and request page, pledges with live updates (Live Content API). The pledge route must update `pledgedQty` in the same transaction as the pledge document.
