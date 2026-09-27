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
