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

---

## Day 2: Sun, Sep 27. Pledges that can't oversell, and pages that update themselves

**Goal:** Day 2 in PLAN: request page, pledges, live updates. Done a day ahead of the schedule.

**Prompt:** "go". That was the whole prompt. The autopilot read STATUS and picked the next PLAN item.

**What shipped:**
- **Request page** `/requests/[id]`:
  - The requester's story verbatim (with a `lang` attribute), the checklist with per-line and overall progress, and the pledges.
  - A "Trail" section: the triage summary, every Jev decision with its probabilities, and human reviews.
  - Demo requests say plainly that Jev never saw them.
- **Drafts return 404, twice over.**
  - Ids containing a dot (`drafts.*`, `versions.*`) are rejected before any query runs.
  - The public client only reads the published perspective.
  - The 404 page explains the trust gate.
- **Pledges**: a Server Action calls `createPledge` in `web/src/lib/pledges.ts`.
  - Code enforces the rules: the request is published and `open`, the line exists, the quantity is a whole number from 1 to what's still needed, and the display name has 1-40 characters and no contact details. Contact-looking names are refused, not just warned about.
  - One transaction creates the pledge document and patches the request with `ifRevisionId(rev).setIfMissing({pledgedQty: 0}).inc({pledgedQty: n})` on that line.
  - On a revision conflict (HTTP 409) nothing is written. The server re-reads, re-checks and retries with exponential backoff.
  - Pledges for the same request queue up inside a server instance.
- **Live updates**:
  - `defineLive` from next-sanity, with `<SanityLive action="refresh" />` in the root layout.
  - Pages that show counts render per request and read uncached from the Content Lake API.
  - A "Live" badge in the header shows the real connection state. It changes only on the Live Content API's own welcome, reconnect, goaway and error events, so it can't claim "live" when it isn't.
- **Seed fix:** re-seeding now recomputes `pledgedQty` from every active pledge, demo and real, so a reset never drops a real donor's units.
- **CORS:** added origins for `localhost:3000` and `vouch-sanity.vercel.app`. The browser's Live Content API connection needs them.

**Verified by** (production, https://vouch-sanity.vercel.app). I used a temporary published test request (`need-test-day2`) so the demo data stayed untouched, and deleted it afterwards.
- **Two browsers, no reload.** Two separate browser sessions:
  - Donor A pledged 2 × Dried beans through the form.
  - Observer B, untouched, switched to "2/3 pledged" and listed "Ines pledged 2 × Dried beans". A `window` marker set before the pledge was still there, so the page was never reloaded.
  - Measured on one clock: B updated about 1.4 s after A saw the confirmation.
- **Sanity data:** that line's `pledgedQty` was 2, and there was exactly one pledge document with the right fields.
- **Adversarial Server Action calls** (a direct POST with the action id, bypassing the form's dropdowns):
  - Pledging 5 when 1 is left was refused: "Only 1 (2 lb bag) of Dried beans still needed…".
  - Pledging on the draft-only `need-demo-09` was refused: "This request is not public".
  - A cross-site `Origin` was rejected by Next's CSRF check.
  - None of these left a document behind.
- **Race on production:** 6 simultaneous pledges for 5 units. Exactly 5 were accepted and 1 got "fully pledged".
- **Trust gate:** `/requests/need-demo-09` and `/requests/drafts.need-demo-09` return 404, and no draft title appears in any page.
- **Locally (production build):**
  - A phone number or email as the name, an unknown line, quantity 0 and an empty name were each refused with a specific message.
  - Two local server instances raced 8 pledges for 3 units: exactly 3 were accepted, and one cross-instance revision conflict was logged and retried.
- **Whole-dataset invariant query:** no checklist line whose `pledgedQty` differs from the sum of its active pledges, and no orphan pledges.
- `npm run typecheck`, `npm run lint`, `npm run build:web` and `npm run build:studio` pass.

**Prompts/approaches that worked:**
- Testing the Server Action like an attacker would, as a plain HTTP POST with a `Next-Action` header and a JSON body, instead of only clicking the form. That's how the over-pledge refusal was proven: the form's dropdowns never offer more than what's left.
- Firing truly parallel requests (async `HttpClient` tasks from one process) instead of sequential clicks.
- Proving "no reload" with a marker on `window` in the observer browser, and a DOM MutationObserver to timestamp the moment the count changed.

**What didn't (and the exact errors):**
1. **The first concurrency run was correct but useless under load.**
   - 8 simultaneous donors for 5 units: only 3 were accepted, and 5 got "Several people pledged at the same moment". The log showed 23 revision conflicts.
   - The guard did its job (no overselling). But each pledge (read plus a transaction with `visibility: 'sync'`) takes hundreds of milliseconds, and the losers kept re-colliding because their short backoffs were too similar.
   - Fix: queue pledges per request inside an instance, and back off exponentially with jitter.
   - Re-run: 5 of 5 units pledged with 0 conflicts. Across two instances: 3 of 3, with 1 conflict retried.
2. **The default `<SanityLive />` action doesn't fit a counter.** In production it calls `revalidateTag(tag, 'max')` and then `router.refresh()`. The Next 16 docs say a `'max'` revalidation serves the stale value on the next read and skips the re-render in the action response. A stale pledge count is wrong, so I didn't use Next's cache for these pages at all: per-request rendering, uncached reads and `action="refresh"`.
3. **Production rejected the local action id** with `Server action not found`. Action ids differ per build; the production id came from the page's JS chunk.
4. **`agent-browser` wasn't on PATH.** `npx -y agent-browser` works (0.38.1, with an engine warning). Each session's first `open` starts a daemon, and the shell tool reports `ChildProcess.kill` although the browser keeps running.
5. **My first "no reload" marker was lost.** The observer page hard-reloaded while I rebuilt and restarted the local server (the build id changed, which is expected). I re-proved it on the final build and on production.

**Where we got stuck and how we course-corrected:** Only the concurrency result. Clicking through the form would never have shown it; parallel requests did. Logging each revision conflict turned "it's probably fine" into evidence, both for the problem and for the fix.

**Decisions:**
- **A Server Action, not a route handler.** It takes a plain object rather than FormData, so a JSON body can test it.
- **Per-request rendering beats the cache for pages with counters.** The tradeoff: every view and every live event re-reads Sanity, which is fine at demo scale.
- **`useCdn: false`** on those reads, so read-your-own-writes doesn't depend on CDN invalidation timing.
- **Pledges are public with a display name only.**
- **Known gaps,** now in PLAN: no rate limiting (one visitor could pledge every demo line), and a demo reset script is needed before judging.

**Next:** Day 3: the submit flow (speech and text), catalog match, triage, the draft/publish gate, and stored decisions. Calibrate thresholds on ambiguous pleas.

---

## Day 3: Sun, Sep 27. Asking for help, and a gate that learned what not to ask

**Goal:** Day 3 in PLAN: the submit flow (typed or spoken), catalog match, triage, the draft/publish gate, every decision stored, a way back to a private draft, and the trail checked on real data. Done two days ahead of the schedule (it was planned for Sep 29).

**Prompt:** "go." again. The autopilot picked the next PLAN item.

**What shipped:**
- **`/ask`**: title, story (typed, or dictated with the browser's `SpeechRecognition`), display name, city, country, language. Contact details are refused in code before anything is sent.
- **Catalog match** (`web/src/lib/catalog-match.ts`), one Jev call:
  - One yes/no question per active catalog item (46): "Does `request` ask for Rice, or say they need it? Other names for it: …".
  - **Code finds every number in the text** (digits and number words; not prices, times, ranges or percentages). For each number, Jev picks which catalog item it counts, or "something else (people, ages, days, money, a size, the weight of a package)".
  - Code builds the proposal: items at or above the policy's `catalogMinProbability`, quantities capped at `maxPerHousehold` (with a note when capped). The requester edits it and can add anything from the catalog.
  - First probe: "two kids" → something else (1.00); "2 bags of rice" → rice (1.00); "size 4" diapers → something else (0.66); "3 latas de atún" → canned tuna (1.00); a Western Union plea matched no items.
- **Submit and triage** (`web/src/lib/intake.ts`, `web/src/lib/triage.ts`):
  1. Code re-validates everything and creates a private draft `drafts.need-<uuid>` (stage `triage`).
  2. One fan-out Jev call: category (Choice over the Sanity category descriptions + "unclear"), urgency (Score over the policy's four levels), language (Choice), and one yes/no per enabled policy flag.
  3. Code gates the answers against the policy and composes the reasons.
     - **Pass:** one transaction publishes it: a revision-guarded patch of the draft, create the published document, delete the draft. So exactly the text Jev checked goes live.
     - **Otherwise:** the draft moves to `review` with the code-written reasons. A danger flag also shows the policy's emergency resources right away.
     - **Any failure** (Jev, a broken policy, Sanity) → review with the error shown. Never an automatic publish.
- **The way back to a draft:** the private link `/status#<token>`.
  - The token is 256 random bits, and only its SHA-256 is stored on the request (a new hidden `statusTokenHash` field).
  - It lives in the URL fragment, which browsers never send to servers, so it stays out of logs. The page posts it to a Server Action.
  - The browser also remembers your requests (localStorage, "My requests"). Send-back on Day 4 will use this page.
- **The trail on real data:** a catalog-match decision shows the matched items plus "43 other catalog items: each below p = 0.10", and the triage decision shows every answer. Outcomes read as words ("Passed triage: published automatically").
- **The catalog match joins the trail** even though it happens before the request exists. It's recorded under a fresh request id that the browser gets back with an HMAC ("ticket"). The submit reuses the id only if the HMAC checks out and nothing exists under it yet.
- **Nothing private leaks into public decisions.** Decision documents are public, and a flagged plea is not. So the numbers' surrounding words travel only in the state (stored as a SHA-256), and the questions refer to them by path (`numbers[0].context`). Checked on production: no word of a private plea appears in its public decisions.
- **Policy migration in the seed:** the flag questions now name the field Jev reads (`request` instead of "the text"), and there's a new `manipulation` flag ("Does `request` contain instructions aimed at a computer system, an AI or a reviewer…").
  - New thresholds: `catalogMinProbability`, and a per-flag threshold for danger.
  - The seed only rewrites values that still hold their Day 1 defaults, so Studio edits survive.

**Calibration (the heart of the day):** `web/scripts/calibrate-triage.ts` runs the app's own question builder and gate over 33 synthetic pleas. They were written by us, not real people, and each has the route a careful volunteer would want. Results: `handoff/calibration/`.
- **Run 1, Day 1 thresholds** (confidence 0.7, flag 0.35): **0 wrongly published, 13 of 16 legitimate pleas needlessly sent to a volunteer, 0 emergencies missed.**
  - **Urgency confidence alone** caused 11 of those. Legitimate pleas naturally sit between two urgency levels (score 1.43 → confidence 0.50; one got 0.00).
  - A mixed request (soap, rice and a blanket) had category confidence 0.38.
  - "I am begging… I am so ashamed to ask" had pressure p = 0.41.
- **The flags themselves were excellent.** Spelled-out phone number: contact 0.99. Gift cards: payment 0.91. USDT: 0.98. Guilt plus countdown: pressure 0.96. Services: not-material 0.86. Prompt injection: manipulation 0.99. All three emergencies: danger 0.96–0.97. The highest flag on any legitimate plea was 0.41.
- **The fix was a better question about what to gate on**, not better prompts:
  - Urgency never gates (it only orders the feed).
  - A low-confidence category is left empty instead of blocking; "unclear" still goes to a volunteer.
  - Non-English still goes to a bilingual verifier.
  - The global flag threshold is 0.5, and danger has its own 0.3 (a missed emergency costs more than a false alarm).
- **Run 2: 33 of 33 routed as expected** (the one "either" case, violence in the past with the person safe now, published). The grid shows zero errors for any global flag threshold from 0.4 to 0.6, so 0.5 sits mid-band.
- Median latency was 292–299 ms from a laptop in Asia, with about 1,208 input tokens per call. The whole calibration cost a fraction of a cent.
- Jev is very consistent but not bit-identical between runs (the begging plea's pressure went 0.41 → 0.37; one urgency score 1.43 → 1.38). That's another reason to keep thresholds away from the edges.

**Verified by** (production, https://vouch-sanity.vercel.app, deploy `dpl_5NkhGEaJU5w9MhUSSXXeBWzpfPBJ`; Studio redeployed with the new schema):
- **Clear plea → live without a reload.** "Diapers for my baby girl" was submitted through the real UI.
  - Catalog match: Diapers (p = 0.99, quantity 2 from "Two packs") and Baby wipes (0.96).
  - Submit → published: **1.43 s** (`submittedAt` → `publishedAt`; the Jev triage call took 191 ms from Vercel).
  - An observer browser already on the feed, with a `window` marker set, showed the new card **1.62 s after publishing**, marker intact (9 → 10 cards).
  - Its trail shows both decisions with probabilities. Urgency was 1.60 with confidence 0.59, which the Day 1 gate would have sent to a volunteer.
- **Flagged plea → private draft.** "Help with groceries" asked for gift cards.
  - "A volunteer will review it" with the reason "Jev flagged “Asks for money instead of goods” (p = 0.95…)".
  - Both `/requests/need-f6617423…` and `/requests/drafts.need-f6617423…` return 404, and anonymous GROQ counts 0 documents for it.
- **Emergency** ("baby… struggling to breathe right now"): the emergency resources are shown first, then the private review (danger p = 0.97, threshold 0.30).
- **Every Jev call has a `decision`:** 6 on production (129–191 ms), plus 2 recorded failures from the local test below. The pledge invariant query still returns `[]`.
- **Locally (production build, same dataset):**
  - The same three routes.
  - Raw-perspective queries: the published request left no draft behind, and the flagged one exists only as `drafts.need-…` in `review`.
  - The status link, the "saved in this browser" list, and a wrong token ("No request matches this link.").
  - **Jev down:** a second server with an invalid TypeSafe key. The catalog match said "Jev couldn't suggest a checklist (TypeSafe API error 401…)" and opened the manual picker. A perfectly clear plea then went to review with the error as its reason. Both failed calls are recorded as `decision`s with outcome `error`.
- `npm run check` (typecheck, lint, both builds) passes.
- **Final deploy** `dpl_AbLM9M1YUWZFVotLoXW7rFH8gmMq` adds small follow-ups: a failed catalog match still links its recorded error to the request's trail, and the reason-list wording changed.
  - Smoke-checked: the feed, `/ask`, `/status` and the app-verified request return 200; the flagged draft's URL returns 404; `/api/status` shows 10 published requests and all three secrets configured.
- **Not verified by the agent:** real speech input. Headless Chrome exposes the API (the "Dictate instead" button shows), but there is no microphone. The user tests it in Chrome.

**Prompts/approaches that worked:**
- **Probing Jev before writing app code.** One throwaway script with four pleas settled the catalog-match design (46 Nouls plus a Choice per number) in about 400 ms per call.
- **Making the calibration script import the app's real `triage.ts`.** Node 22.22 runs TypeScript directly, so there's no second copy of the logic to drift. That needed `allowImportingTsExtensions` (allowed with `noEmit`) and pure modules with no runtime imports.
- **Asking "what should gate?" instead of "what threshold?"** The threshold grid (wrongly published / needlessly reviewed / emergencies missed) made the answer obvious.
- **Testing the failure path for real**, with a second server and a bad key, rather than trusting the code.

**What didn't (and the exact errors):**
1. **The Day 1 gate was too strict** (above). It never published a bad plea, but it would have buried volunteers in clear ones.
2. **A vacuous check.** `sanity documents query … --api-version 2026-09-01` returned only the published document, and I first read that as "the draft is gone". Since API version 2025-02-19 the default perspective is `published`, so drafts are hidden even with a token. Re-checked with `--api-version v2021-06-07` (raw); RESEARCH §2.6 is corrected.
3. **The seed migration skipped the danger threshold.** GROQ projections return `null`, not `undefined`, for a missing field.
4. **agent-browser gotchas:**
   - `wait --text 'Your checklist'` timed out because CSS uppercases the heading and the match is against `innerText` ("YOUR CHECKLIST").
   - `find label … select` doesn't exist; `select @ref` does.
5. **A privacy false alarm.** My leak check found "Ines" (the test display name) in a public decision. It was PowerShell's case-insensitive `-match` finding "sard**ines**" in the catalog synonyms; a case-sensitive, word-bounded check came back clean.
6. Node warns `MODULE_TYPELESS_PACKAGE_JSON` on the script; `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` silences it.

**Where we got stuck and how we course-corrected:** the gate. The first instinct was to tune numbers; the data said to stop asking urgency a question it can't answer confidently. It's the "answer = what, confidence = whether to act" rule, applied per question.

**Decisions:**
- **Calibration calls aren't stored as `decision`s.** They're synthetic and offline; their full answers are committed as JSON in `handoff/calibration/` instead. The claim for the post is "every Jev call the app makes is stored".
- **Test requests became labeled demo data.** The 7 requests I submitted while testing (2 published, 5 drafts in review) are marked `isDemo: true`: written by us, processed by the real pipeline, with real trails. The review drafts are Day 4 material for the verifier desk. One contains a fake 555 phone number as a reject case.
- **Readable question ids** (`Rice`, `number #1`, `flag: danger`), because they show up in the public trail. They contain no words from the plea.
- **The HMAC ticket key is derived from the Sanity write token**, so no new secret was needed.

**Next:** Day 4: the verifier desk (approve / send back / reject) and the lifecycle, with a timebox for the Sanity Workflows engine. Plus the user's speech-input test in Chrome.

## Day 4: Sun, Sep 27. The lifecycle becomes data: Sanity Workflows, the verifier desk, and a miss caught in production

**Goal:** Day 4 in PLAN (planned for Sep 30): a 1-day timebox for the Sanity Workflows engine, the verifier desk (approve / send back / reject), the send-back loop on the requester's private page, and the trail. Same prompt as every day: "go".

**What shipped:**
- **The whole request lifecycle is a Sanity Workflows definition** (`web/src/workflows/need-lifecycle.ts`, deployed as `prod.need-lifecycle.v1`): triage → (review) → publishing → open → proof_check → (proof_review) → certifying → fulfilled, plus sent_back and rejected. The proof stages are already declared for Day 5.
  - **Jev and the verifier go through the same transitions.** Both a passed triage and a verifier's approval enter `publishing`, whose effect publishes the draft. It's the challenge's own description of Workflows: "an agent can move a draft forward and a person can approve it through the same transitions".
  - **Effects** (`web/src/lib/lifecycle/`):
    - `jev-triage`: the Day 3 call and gate, now inside an effect.
    - `publish-need`: one transaction guarded by the exact revision that was checked, or seen by the verifier.
    - `record-send-back` / `record-rejection`: each writes the review and the draft's new stage in one transaction.
  - An approval is recorded **in the publish transaction**, so "approved" and "live" can't disagree.
  - Every instance is private (dotted id `prod.wf-instance.<request>`). Its id is derived from the request id, so there's no lookup and starting is idempotent.
- **Verifier desk** (`/desk`):
  - Sign-in: the passcode plus a display name, exchanged for an HMAC-signed, httpOnly, SameSite=strict cookie that every action re-checks.
  - The inbox shows the requester's words, the checklist, the code-written reasons, Jev's typed answers, earlier reviews and the live lifecycle.
  - Actions: Approve and publish, Send back with a question, or Reject. Stuck automatic steps get a "Retry automatic steps" button, and drafts without a lifecycle get "Start the lifecycle".
- **Send-back loop:** the requester sees the verifier's note on `/status#token`, edits the words, checklist and details, and resubmits. The lifecycle checks the new version from scratch.
- **Live progress:** after submitting, the requester gets their private link immediately and watches the real stages, read from the instance document ("Jev checks it · 5.1 s → Publishing · 4.0 s → Verified and live").
- **Trail on the public page:** Jev decisions, human reviews, and the lifecycle stages with timings.
  - Reviews are stored under a private path (`review.*`), because they talk about requests that may still be drafts. The server shows them once a request is published.
  - Send-back and reject notes stay private forever; approval notes are public.
- **Adoption instead of rewriting history.** The 17 requests from Days 1-3 got instances through an explicit `adoptAt` start field: adopted at `open`, or at `review`, with no Jev effect queued. Their trail says "Adopted into the lifecycle (this request existed before it; no check ran here)" instead of pretending Jev ran.
  - The two never-checked seeded drafts were started normally, and the desk's Retry ran their real triage.

**The Workflows timebox (decided about 1.7 h in: adopt the engine):**
1. **Versions:** `sanity workflows` is built into `@sanity/cli` 8.13, but it bundles engine and CLI **0.32.0**; npm latest is **0.35.0**, and the quick start wants ≥ 0.33 with matching versions.
   - `@sanity/workflow-cli@0.35.0` peers on `@sanity/workflow-blueprint`, which peers on TypeScript 6 or 7. Result: `ERESOLVE` against our TS 5.9.
   - Decision: pin `@sanity/workflow-engine@0.35.0` in `web` and deploy with `engine.deployDefinitions()` (`web/scripts/workflow-deploy.ts`), the documented programmatic equivalent, on the same version as the runtime.
2. **First define-time error:** `duplicate effect name (registry key — unique per definition) "record-review"`. An effect's name is both its declaration and its handler key, so every decision gets its own effect name, all sharing one handler.
3. **Functional probe** (stub handlers, a throwaway `dev` tag, the real dataset): every path worked the first time.
   - A clean request went triage → publishing → open in ONE `drainEffects`.
   - Approve while in `sent_back` failed with `ContractViolationError: Activity "verify" not found in current stage "sent_back"`.
   - A second decision failed with `ActionDisabledError … action filter returned false`.
   - Engine docs (`sanity.workflow.definition` / `sanity.workflow.instance`) have dotted ids, so anonymous queries see 0 of them.
4. **Latency, the real finding:** each engine verb made **13-31 sequential HTTP requests**, mostly re-reading the instance document.
   - From the laptop: start 6.5 s, drain 9-22 s.
   - From a Vercel preview in iad1: start 4.3 s, drain 4.6 s, fireAction 2.3 s, approve → open 9.3 s. That projected about 14 s for a clean submission; Day 3 took 1.4 s.
5. **Why:** the response header `X-Sanity-Shard: gcp-eu-w1-prod-40034` says the project's Content Lake is in **europe-west1 (Belgium)**, with `Server-Timing: api;dur=4`. Our functions ran in Washington.
   - `web/vercel.json` `regions` was silently ignored for CLI deploys from the repo root.
   - The project setting `resourceConfig.functionDefaultRegions` (a REST PATCH) worked, and functions moved to **cdg1 (Paris)**.
   - Results: a plain query went from 118 ms to 31-47 ms, and fireAction from 2.3 s to 0.95 s.
6. **The floor:** the engine hard-codes `SYNC_COMMIT = {visibility: "sync"}`, and a sync commit costs about 0.8 s on this dataset even from Paris. I didn't override an early-access engine's consistency guarantee. Instead:
   - Fewer commits: an approval is one effect, not two.
   - Our own writes use `visibility: 'async'`.
   - The intake drain runs in Next's `after()` while the requester watches the real stages.
   - It's still a trade: a clean request now goes live in about 9 s instead of 1.4 s, and the requester sees why.

**Verified by** (production https://vouch-sanity.vercel.app, deploy `dpl_BbJ12bns8WqPk5FKXuDciiJKC3Ts`, functions in cdg1: `x-vercel-id: sin1::cdg1::…`):
- **Approve** "School notebooks" (Jev was down on Day 3):
  - The click was at 09:02:48.34 and fireAction committed at +1.2 s.
  - **Published at +4.2 s**, with the approval review written in the same transaction (same timestamp).
  - An observer browser already on the feed showed the new card without a reload (marker intact, 13 → 14 cards).
  - The public trail shows "Volunteer Bram: Approved" with the note, plus the lifecycle.
- **Send back → edit → resubmit:** a PayPal plea was flagged, sent back ("Vouch can only pass on goods, not money…"), and the requester read the note on their private page and edited the words.
  - Timeline: triage 5.1 s → review → sent back → triage 5.1 s → publishing 4.0 s → verified and live.
  - The public trail shows the catalog match, both triage decisions and "Sent back", without the private note.
- **Reject:** the review was recorded at +2.0 s and the instance completed at `rejected` at +3.0 s. The draft stays private, and the requester's page says "Rejected", shows the note, and ends the lifecycle at "Rejected (stays private)".
- **Retry** on a never-checked seeded draft ran a real Jev triage from Paris in 274 ms and routed it to a person.
- **Refused:**
  - Direct Server Action POSTs to decide, retry and start, both without a cookie and with a forged one: "Sign in to the verifier desk first".
  - A cross-site Origin: HTTP 500 from Next's CSRF check.
  - A wrong passcode sets no cookie.
  - Resubmitting with a wrong or malformed token is refused.
- **Anonymous GROQ:** 0 drafts, 0 reviews and 0 workflow docs visible. The pledge invariant query still returns `[]`. `npm run check` passes.

**What didn't (and the exact errors):**
1. **The production miss.** "Could someone send me money by PayPal so I can buy her a warm coat and gloves?" scored `payment_redirect` **p = 0.30** and **published automatically**.
   - The Day 3 question listed gift cards, crypto, wire transfers, mobile money and cash, but never "money" itself, and the 33 calibration pleas had no payment app.
   - A comparison probe on 8 synthetic pleas (`web/scripts/probe-payment-flag.ts`), old wording vs new:
     - PayPal: 0.21 → 0.99.
     - Venmo: 0.72 → 0.99.
     - Pleas that only mention money: 0.02-0.04 → 0.02-0.03.
   - The new wording is policy content: I patched it in Sanity, with no redeploy, and updated the seed default and migration.
   - Calibration with 4 new money pleas: **37/37**.
   - Production then flagged the same PayPal plea at p = 0.98. The published test request was removed; its decision documents stay as evidence.
2. `vercel.json` `regions` had no effect (the functions stayed in iad1, per `VERCEL_REGION`).
3. `@sanity/client` reserves `tag` as a query-parameter name ("Type 'string' is not assignable to type 'never'"), so the migration uses `$workflowTag`.
4. `getDocument` takes no `timeout` option. React's purity lint flagged `Date.now()` in a server component, so that moved into the data loader.
5. The desk sign-in "failed" the first time only in my test: React 19 resets a form after its action runs, so my second click submitted an empty name.
6. PowerShell 5.1 strips embedded double quotes from `node -e` code, so one-off patches go in a temporary script file.

**Decisions:**
- **Adopt the engine** (above). The fallback `stage` field stays as a mirror on the document, written by the effects, so feed queries and the public dataset keep working.
- **Reviews are private** (`review.*`); only the server shows them, and only for published requests.
- **Adoption, not fake history,** for pre-lifecycle requests.
- **Test requests became labeled demo data again** (`isDemo`), as on Day 3.

**Next:** Day 5, the proof flow. Receipt upload, then in-browser OCR, then editable lines, then `submit-proof` on the instance. Then the `jev-proof` and `issue-certificate` handlers (the stages are already deployed), and the certificate page. Also Day 7's reset script must nuke and re-adopt the workflow instances.


## Day 5: Sun, Sep 27. Receipts close the loop: OCR in the browser, a gate Jev can't talk its way past, and a hash anyone can check

**Goal:** Day 5 in PLAN (planned for Oct 1): the proof flow (Tesseract.js, editable lines, Jev match), the verifier's receipt decisions, and the certificate with an in-browser SHA-256 check. Same prompt: "go" (and "do what you think is correct and necessary for day 5").

**What shipped:**
- **Upload page** (`/requests/[id]/proof`):
  - Take a photo, or use one of four made-up sample receipts (`web/public/samples/`).
  - Tesseract.js 7 reads it **in the browser**. The page downscales and grayscales the image first.
  - The uploader corrects the lines, deletes what they don't want to share, and submits.
  - Then it shows the real stages until the verdict.
- **Lifecycle:** the v1 definition already declared the proof stages on Day 4, so there was no redeploy and no migration. Only handlers were added (`web/src/lib/lifecycle/proof-step.ts`):
  - `jev-proof`: one fan-out Jev call, then the gate in code.
  - `issue-certificate`: canonical JSON (sorted keys, no whitespace) plus SHA-256. One certificate per request, with an id derived from the request.
  - `record-proof-accepted` / `record-proof-declined`.
- **Privacy:** the dataset is public, and Sanity asset files and asset documents are too. So the photo (a JPEG data URL) and the raw OCR text live in a private dotted-id document, `receipt-scan.<id>`. The public `proof` keeps the corrected lines, the matches, the verdict and the photo's SHA-256.
- **Verifier desk:** a receipts section. It shows the private photo, the corrected lines with Jev's matches, lines marked "edited · 51 % like the OCR", the code-written reasons, the raw OCR, Jev's typed answers, and Accept / Decline (a note is required to decline).
- **Certificate page** (`/certificates/[id]`): Web Crypto recomputes the SHA-256 of the exact payload text. Edit one character and it says "Mismatch".
- **Trail:** the request page shows each receipt (who uploaded it, the verdict, only the matched lines), the receipt reviews, and the certificate hash.

**Question design (calibrated on synthetic receipts, `web/scripts/calibrate-proof.ts`):**
- The questions:
  - One noul: "Are the lines in `receipt` the lines of a receipt…?"
  - One choice per receipt line: which `checklist` item did it buy, "another product", or "not a product" (store, totals, payment…).
  - Code keeps pairs at or above `proofMinMatchProbability`, assigns at most one line per item (most probable first) and computes coverage.
- **First attempt: 5/10.**
  - The state held the lines as an array, and the questions pointed at `receipt.lines[5]`. Jev answered about the neighbouring line: on "SPAGHETTI", pasta got 0.11 and beans 0.32.
  - It mixed 0- and 1-based positions. "PEANUT BUTTER" was scored as pasta (0.37), and the store's "TOTAL" line was scored as trash bags.
- **Fix:** every line became a named field (`receipt.line_06`). **Result: 11/11**, including:
  - Brand names: Similac, Pampers, Calpol, Elastoplast.
  - An Indonesian receipt: "BERAS PANDAN WANGI" → rice, "TELUR AYAM" → eggs.
  - Decoys: "RICE CAKES", "PEANUT BUTTER COOKIES", "PASTA SAUCE" and "JELLY BEANS" all → "another product".
  - A thank-you note: receipt p = 0.03.
  - Lesson for the post: point Jev at state by name, not by index.
- **Jev reads text, not the photo.** So code checks that every matched line is close to a line OCR read (character-pair similarity with the OCR text, which stays private). This is a new policy threshold, `proofMinOcrSimilarity = 0.6`, editable in the Studio. Rewriting a line to invent a purchase sends the receipt to a person, who compares it with the photo.

**Verified by** (production https://vouch-sanity.vercel.app, deploy `dpl_FfkkSLjqCfxTZ8AbygNwtNHwwiWw`, functions in cdg1):
- **Auto-verified:** the groceries sample on need-demo-08.
  - Read in the browser in 8.1 s, including the model download. All 15 lines were right except `16OZ` → `160Z`.
  - Submitted at 17:48:46.4. The proof was checked at +6.3 s (Jev 287 ms, 3/3 matches at p = 1.00, receipt p = 0.98).
  - Certificate `certificate-demo-08` at +10.4 s. The request is `fulfilled`.
- **Declined, then verified:** the electronics sample on need-demo-06.
  - Proof review after 9.8 s ("0 of 3 checklist items").
  - On the desk, the photo rendered (708×888). Declined with a note: the request went back to `open` in 8.9 s.
  - Then the pharmacy sample: fulfilled 14.5 s after submit. The lifecycle shows open → proof_check → proof_review → open → proof_check → certifying → fulfilled.
- **Edited line:** "PEANUT BUTTER 160Z 6.96" was rewritten as "SMOOTH PEANUT BUTTER JAR 2 PACK".
  - Jev still matched it (p = 0.99), but the gate routed it to a person: "similarity 0.51; the policy needs 0.60".
  - The verifier accepted it, and the certificate says "Verified by volunteer verifier Bram".
- **Certificates:**
  - The browser hash equals the stored hash.
  - A tampered payload shows "Mismatch: the text was changed".
  - Node's `crypto.createHash('sha256')` of the stored payload equals the stored `sha256`.
- **Anonymous GROQ:** 0 `receiptScan`, 0 reviews and 0 drafts visible. 4 `proof_match` decisions stored (2 auto_verified, 2 needs_review). The pledge invariant returns `[]`.
- `npm run typecheck`, `npm run lint` and `npm run build:web` pass. The Studio is redeployed with the new schema.

**What didn't:**
1. The session started with `package-lock.json` and `web/package.json` deleted from disk (uncommitted; the cause is unknown). Restored with `git restore`, and typecheck passed before any work.
2. The first production submit worked, but **the page hid its own result**. The server page decided "not open → show a notice" and unmounted the uploader. Submitting changes the request's stage, so Sanity Live refreshed the page and the "Jev is checking…" view disappeared. My browser test waited 120 s for text that never came, while Sanity already said `fulfilled` at +10 s. Fix: the uploader always stays mounted and gets the stage as a prop.
3. React's lint rule treated my `useSample()` click handler as a hook ("cannot be called inside a callback"). Renamed it to `readSample`.
4. The calibration's first run: 5/10 (above).

**Decisions:**
- **No definition change:** v1's proof stages were enough, so no v2 and no migration.
- **Private photos as data URLs in dotted-id documents**, not Sanity assets (assets are public). The upload is downscaled in the browser to at most about 1.1 MB, and `serverActions.bodySizeLimit` is `2mb`.
- **Receipt decisions are public** (with the verifier's note), because the uploader has no private page. Send-back and reject notes on requests stay private.
- **Quantities are not checked**, and one receipt must cover the checklist. Both are documented on the page and in the certificate text.

**Next:** Day 6: polish, rate limits (ask, pledge, catalog match, receipt upload, desk sign-in), empty and error states. Day 7's reset script must also delete the Day 5 test data.

## Day 6: Mon, Sep 28. Limits that live in Sanity, pages that say what failed, and a policy edit that changed the very next decision

**Goal:** Day 6 in PLAN (planned for Oct 2): rate limits, empty and error states, phone layouts, and proof that policy-as-content needs no redeploy. Prompt: "go". The user didn't know how to answer the dictation question ("idk what to answer, do what you think best"), so that check stays open.

**What shipped:**
- **Rate limits per network, counted in Sanity** (`web/src/lib/rate-limit.ts`):
  - One private counter document per (limit, network, window): `ratelimit.<limit>-<seconds>.<window start>.<hash>`. One transaction does `createIfNotExists` + `inc`, and Sanity's response carries the new count. So every Vercel instance shares one count.
  - The limits:
    - Checklist suggestions: 20 per hour.
    - New requests: 5 per hour and 12 per day.
    - Pledges: 30 per hour.
    - Receipt uploads: 6 per hour and 15 per day.
    - Passcode attempts: 10 per 15 minutes, shared by the desk sign-in and the Jev health check.
  - **No IP address is stored.** The network (an IPv4 address, or an IPv6 /64) goes through an HMAC keyed from the server's Sanity token. When a new window opens, a delete-by-query in `after()` removes expired counters.
  - **Checked first in each action,** before validation, so refused attempts count too.
  - **If Sanity can't count, the action is refused** ("Vouch couldn't check its rate limit…"). It's never waved through.
  - **Not limited, on purpose:**
    - The receipt status poll: the page polls it.
    - The status lookup: useless without a 256-bit token.
    - Resubmits: only possible after a verifier's send-back.
    - Desk decisions: they need a verifier session.
- **Error states:**
  - New `app/error.tsx` (Next 16.3's new `retry` prop, read from the bundled docs), `app/global-error.tsx`, and a site-wide `app/not-found.tsx` in the app's style.
  - The receipt and certificate pages now catch their Sanity reads and say what failed. Before, a Sanity error crashed them to Next's default error page.
  - The request page's trail now reports a failed read of volunteer reviews or of the lifecycle. Before, it silently showed none.
  - **A small lie the review found:** if the catalog failed to load on `/status`, the resubmit form would have said "N item(s) left the catalog and were removed". It now says the catalog couldn't be loaded and disables resubmitting.
  - Smaller fixes:
    - The desk no longer says "0 requests in the inbox" above a load error.
    - The feed's empty state links to /ask.
- **Phones:**
  - **The nav wrapped** on a 390 px phone ("My requests" and "Ask for help" on two lines each) and hid the desk link.
    - The links no longer wrap.
    - On phones, the Live badge is just the dot; screen readers still get the words.
    - The feed footer now links the desk.
  - **At 320 px, the request and receipt pages scrolled sideways** (334 and 378 px wide). A grid's implicit `auto` column grew to fit the pledge `<select>` and the file input. `grid-cols-1` (= `minmax(0, 1fr)`) and a full-width file input fixed it.
  - **The receipt input had `capture="environment"`.** On phones that opens the camera and hides the photo library. Removed, so people can take a photo or pick one they already have.

**Verified by** (production https://vouch-sanity.vercel.app, final deploy `dpl_4mULSinxjePqcWo9iHd4vgC4JeYn`, functions in cdg1):
- **Probe first**, against the live Content Lake (a temporary script, since deleted):
  - `createIfNotExists` + `inc` in one transaction with `returnDocuments: true` returned count 1, then 2.
  - 10 concurrent increments came back as 3…12, with a final 12.
  - Anonymous reads saw none of the dotted ids.
  - A delete-by-query with a `[0...500]` slice removed them.
- **Every limit exceeded on purpose, with invalid inputs.** So no drafts, Jev calls or pledges were created. Calls below each limit reached normal validation, which shows valid calls still pass through.
  - Jev health with a wrong passcode: 10 × 401, then 429 "Too many passcode attempts from your network: the limit is 10 per 15 minutes…" with `Retry-After: 697` (`x-vercel-id: sin1::cdg1::…`).
  - The desk sign-in form in a browser then showed the same message.
  - Receipts: 6 accepted, the 7th refused. Submits: the 6th refused. Catalog matches: the 21st. Pledges: the 31st. About 350 ms per call from Indonesia.
  - In Sanity: 9 counters, and no IP anywhere. Anonymous `count(*[_type == "rateLimit"])` and `count(*[_id in path("ratelimit.**")])` are both 0.
  - Cleanup: an expired counter from the local test (its window ended at 04:30 UTC) was deleted when production opened a new window at 04:33.
- **Sanity down:** a throwaway local build with a nonexistent project ID and a dummy token.
  - The feed, request, receipt, certificate and ask pages each said "Couldn't load … from Sanity", with Sanity's own error.
  - The desk sign-in refused with "Vouch couldn't check its rate limit in Sanity (Unauthorized - Session not found), so nothing was done".
  - `/status` showed the lookup error.
- **Policy as content, no redeploy:**
  - The same plea ("Food for the week… two bags of rice and some milk… maybe cereal or bread") at `catalogMinProbability` 0.5 proposed Rice 0.98, Milk 0.97 and Bread 0.87.
  - Set to 0.95 in the published policy at 05:01:04 UTC. The same call at 05:01:20 proposed only Milk 0.98 and Rice 0.98.
  - The stored decisions read "proposed 3 items" (twice), then "proposed 2 items".
  - Restored to 0.5 at 05:01:37.
- **Phones:** agent-browser as an iPhone 14 (390 px) and at 320 px.
  - All 7 pages have `scrollWidth == innerWidth`.
  - The receipt page read the groceries sample in the browser, and its edit screen fits at 320 px.
- `npm run check` (typecheck, lint and both builds) passes.

**What didn't:**
1. The codebase-memory index dated from early Day 3. The first re-index created a second project under a derived name; I deleted it and re-indexed as `vouch-sanity`.
2. My first scrape for production Server Action ids found nothing: Next 16.3 serves chunks from `/_next/static/immutable/chunks/`, not `/_next/static/chunks/`.
3. The first "before" catalog match printed nothing, because my filter looked for `"message"` and only failures have one. The call still counted and was stored as a decision.

**Decisions:**
- **Counters in Sanity**, not in memory and not a new service.
  - An in-memory limiter resets on every cold start and differs per instance.
  - Upstash would mean a new account and a new dependency.
  - Sanity already holds everything, the transaction is atomic, and the check costs one round trip.
- **Fail closed:** an unchecked limit isn't a limit, and every limited action needs Sanity anyway.
- **Fixed windows,** documented: a burst across a window boundary can reach twice a limit. Limits are per network, so people behind one NAT share them.
- **Limits are code constants, not policy content:** they must keep working when the policy doesn't load, and a Studio edit shouldn't be able to switch abuse protection off.

**Next:** Day 7: the demo reset script and a full production run of every DoD step, then the demo video and screenshots. The dictation check still waits for the user.

## Day 3's last check, Mon Sep 28: dictation on a real phone repeated every word

**Goal:** the one open item of Day 3: dictation tested by a person with a microphone.

**What happened:**
- The user tried "Dictate instead" on an Android phone (Chrome, opened from an app) and sent a screenshot.
- Recognition worked, but the box read "we we we need we need we need rice we need rice we need rice and we need rice and milk …".
- Cause: Chrome on Android re-sends the whole utterance so far as each new result and marks them final. The hook appended every final result, which is the pattern of Google's own Web Speech demo.
- The same quirk is visible in react-speech-recognition, which works around it on Android: it ignores "final" results with confidence 0, skips a repeated final-only event, and debounces finals by 250 ms.

**What shipped:**
- `web/src/app/ask/transcript.ts` (pure): on every event, the session's text is rebuilt from **all** of its results, and a result that re-sends the previous one replaces it instead of being appended. It works on content, not on Android's event metadata, so it covers every plausible event shape:
  - A growing list of cumulative results.
  - One result replaced in place.
  - A duplicated final.
  - A revised word.
- **Android:** one utterance per tap (`continuous = false`); it stops at a pause, and tapping again adds more. The hint says so on phones.
- **Desktop:** continuous as before.
- **The words appear live in the box,** after whatever was typed before. The box is read-only while listening, so nothing typed can be overwritten.
- **Nothing is reworded:** every word shown is a word the recognizer returned.

**Verified by:**
- `web/scripts/check-dictation.ts`: 11/11. The first check proves the reconstruction: appending the 12 reconstructed results gives the phone's text exactly. The new code gives "we need rice and milk for the week" and never shows a repeat at any step.
- **Production** (`dpl_9fpmDXhK5pvdfKqqm24pagyxmzNU`): agent-browser replaced `SpeechRecognition` with a scripted fake and dictated after "Hello." was typed.
  - **As a Pixel 7:** `continuous: false`. After each of the 12 events the box read "Hello. we" … "Hello. we need rice and milk for the week", with no repeat, read-only while listening and editable after.
  - **As desktop Chrome:** `continuous: true`, with separate phrases joined into the same sentence.
- `npm run typecheck` and `npm run lint` pass.
- **The user's real phone, after the fix:** they reloaded /ask on the same Android phone, dictated again and reported "dictate was normal now". Day 3 is ticked.

**Lesson for the post:** the only person who could test the microphone found the bug in 30 seconds. A demo path that "works on my machine" isn't verified.
