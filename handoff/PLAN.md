# PLAN: Vouch (Sanity edition)

Source of truth for scope and progress. Tick a box only after the item is verified end-to-end against real services. Deadline: Sun Oct 4 2026, 11:59 PM PDT (publish by noon PDT). Current state and the exact next action: `handoff/STATUS.md`. Session prompts: `handoff/README.md`.

## Definition of done: what judges can do on the live site

1. Ask for help by voice or text → Jev proposes a checklist from the Sanity supply catalog → requester edits → submits.
2. Within seconds: published, or "a volunteer will review" with the reasons shown, or emergency resources shown.
3. Verifier desk (demo passcode given in the post) → approve / send back / reject → the request goes live or returns.
4. Pledge checklist items as a donor; progress updates live.
5. Upload a receipt (sample receipts provided) → in-browser OCR → editable lines → Jev match → verified or queued → certificate with an in-browser SHA-256 check.
6. Each request page shows its trail: Jev decisions (with probabilities), human reviews, proof match, certificate hash.
7. Judges get the Sanity project ID + public dataset, and a deployed Studio.

## Scope tiers

**MUST (by end of Day 5)**
- Sanity schema + seed data; deployed Studio with a useful structure (Review inbox, Live, Fulfilled, Catalog, Policy, Decisions).
- Next.js: feed, request page, submit flow, pledge, proof flow, verifier desk, certificate page.
- Jev: catalog match, triage, proof match; every call stored as a `decision`.
- Drafts-as-gate publishing. Deployed on Vercel.

**SHOULD**
- Sanity Workflows engine drives the lifecycle (1-day timebox). Fallback: same stages as a `stage` field + transition log on the document, advanced by the same server functions. *(Done Day 4: the engine drives it. The `stage` field stays as a mirror written by the effects.)*
- Policy-as-content: category descriptions, urgency levels, flag questions and thresholds read from Sanity at runtime (editable in Studio, no redeploy).
- Language flag: non-English requests go to a bilingual verifier.
- Live updates via Sanity's Live Content API.

**COULD (only if every MUST is green)**
- Studio custom view showing Jev probabilities for a document.
- App SDK "Verifier Desk" (React 19) in the Sanity Dashboard.
- World map of needs (port and simplify from the prototype).
- Read-aloud via browser speechSynthesis.

**WON'T**
- Solana/crypto, payments, Gemini or any LLM, ElevenLabs, translation, analytics dashboards, UN/ProPublica feeds, accounts for requesters/donors.

## Architecture (default; revisit only if blocked)

- npm workspaces: `web/` Next.js App Router (TypeScript), `studio/` Sanity Studio v6, `workflows/` definitions + `sanity.workflow.ts`, later `desk/` (App SDK). The repo root already has `handoff/`, `AGENTS.md`, `opencode.json` and `.opencode/`, so scaffold into subfolders (create-next-app and sanity init may refuse non-empty dirs). Keep `.opencode/node_modules` (OpenCode's own plugin deps) out of git.
- One Sanity project; dataset `production` with public read (only published docs are exposed; drafts stay private). Workflow engine documents in the same dataset unless a private `workflows` dataset proves necessary.
- Server-side only: Jev client, Sanity write client, workflow engine, verifier auth. Browser-side: speech recognition, Tesseract.js OCR, Web Crypto SHA-256.
- Demo verifier auth: shared passcode (env `VERIFIER_PASSCODE`) → httpOnly cookie. Documented in the post.
- Env (web/.env.local, git-ignored): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_WRITE_TOKEN`, `TYPESAFE_API_KEY` (the user pastes it; never in chat), `VERIFIER_PASSCODE`. Mirror them in Vercel project env.

## Content model (draft)

- `category`: title, slug, description (used verbatim as Jev Choice criteria).
- `supplyItem`: name, synonyms[], unit, unitPrice (USD), category ref, maxPerHousehold, active.
- `need`: title, story (requester's own words, never rewritten), language, displayName, city, country, geopoint, category ref, urgency (0-3), items[] {supplyItem ref, quantity, pledgedQty}, stage, triageSummary (outcome, reasons, fired flags, min confidence, decision ref), statusTokenHash (SHA-256 of the private status link token; hidden), publishedAt. Created as a draft; publishing = verified.
- `pledge`: need ref, itemKey, quantity, donorDisplayName, status (pledged / delivered / cancelled).
- `proof`: need ref, image asset, ocrText, lines[] {text, amount?}, matches[] {lineIndex, itemKey, probability}, coverage, verdict (auto_verified / needs_review / verified / rejected).
- `decision`: subject ref (need or proof, **weak**: the need may still be a draft), kind (catalog_match / triage / duplicate / proof_match / health_check), model id, questions (JSON string), answers (JSON string), **stateDigest** (SHA-256 of the state sent; the state itself is not stored, so an unverified plea never leaks through a published decision), outcome, error, latencyMs, inputTokens, createdAt.
- `review`: subject ref, action (approve / send_back / reject), note, reviewerName, createdAt.
  - Stored under the private path `review.<hash of the effect key>`, because it may be about a draft. The server shows reviews for published requests. Send-back and reject notes stay private; approval notes are public.
- `certificate`: need ref, canonical payload, sha256, issuedAt.
- `policy` (singleton): thresholds (catalog min probability, triage min confidence, max flag probability, proof min match probability, min coverage, receipt min probability), urgency level texts, flag questions (code, label, question text naming `request`, routesTo, optional own threshold, enabled), emergency resources text.

## Lifecycle (workflow `need-lifecycle`)

As built on Day 4 (`web/src/workflows/need-lifecycle.ts`):
- triage (effect `jev-triage`) → [review, only if flagged] → publishing (effect `publish-need`) → open (collect pledges).
- open → `submit-proof` → proof_check (effect `jev-proof`) → [proof_review, only if flagged] → certifying (effect `issue-certificate`) → fulfilled.
- review → send-back → sent_back → resubmit → triage again. `rejected` is terminal. A publish failure returns to review.
- Both the automatic pass and a verifier's approval enter `publishing`.
- Workflow subject = the need's base `_id` (not `drafts.`). Instances: `prod.wf-instance.<id>`.
- Requests that existed before the lifecycle are adopted at `review` or `open` (`adoptAt`; no effect queued).

## Jev question design (calibrated Sep 27 on 33 synthetic pleas; `web/scripts/calibrate-triage.ts`)

- Catalog match (before submit, UX assist), one call:
  - One Noul per active supplyItem ("Does `request` ask for {name}, or say they need it? Other names for it: …").
  - Code finds the numbers in the text, and one Choice per number picks the catalog item it counts, or "something else".
  - Code builds the proposal (policy `catalogMinProbability`, quantities capped at `maxPerHousehold`). The requester edits it.
- Triage (on submit, one fan-out call):
  - Category (Choice from `category` docs + "unclear"), urgency (Score, levels from policy), language (Choice), and one Noul per enabled policy flag (danger, contact info, payment redirect, pressure, not material, manipulation).
  - **Gate in code:** any flag at or above its threshold (danger 0.3, others 0.5) → volunteer (danger → emergency resources too); "unclear" category → volunteer; non-English or language confidence < 0.7 → bilingual volunteer.
  - **Not gated:** urgency never gates (it only orders the feed). A category below 0.7 confidence is left empty rather than blocking.
- Duplicates: GROQ finds recent needs in the same city/category → Noul "same household, same need".
- Proof match: one Choice per receipt line (which checklist item it bought, "another product", "not a product"), plus a "this text is a store receipt" Noul.
  - **Code counts the units** (Sep 28): quantities printed on the line or on a quantity-only line below it ("3 @ 18.99", "3 x 18.99", "QTY 3", "x3", or proven by the arithmetic). A line without one counts as 1.
  - A quantity counts only if OCR read the same one in the photo, and quantity × unit price is the line's total.
  - Coverage = units shown / units asked for. The policy needs 1 (everything, in full).

## Schedule and checklist (plan made Sat Sep 26)

- [x] Day 1 (Sep 26-27): GitHub repo; scaffold `web/` + `studio/`; Sanity project + public dataset; schemas; seed (categories, ~40 supply items, policy, ~10 needs); Studio deployed; skeleton `web/` deployed to Vercel; first real Jev call from a server route; fill AGENTS.md Commands. *(Verified Sep 26: project `o8hcpsct`, Studio vouch-aid.sanity.studio, web vouch-sanity.vercel.app; anonymous GROQ shows 8 published / 0 drafts; prod Jev call recorded as a decision.)*
- [x] Day 2 (Sep 28, done Sep 27): feed + request page + pledges (live updates). The pledge updates `pledgedQty` in the same transaction as the pledge doc (`ifRevisionId`); drafts return 404. *(Verified Sep 27 on production: two browsers, B updated ~1.4 s after A's pledge with no reload; `pledgedQty` and the pledge doc correct in Sanity; direct Server Action POSTs refused over-pledging, a draft-only request and a cross-site Origin; 6 simultaneous pledges for 5 units → exactly 5 accepted; drafts 404.)*
- [x] Day 3 (Sep 29, done Sep 27; dictation confirmed Sep 28): submit flow (speech + text) → catalog match → triage → draft/publish gate → decisions stored. Also decide how a requester returns to their draft (needed for send-back), and check the trail's decision rendering on real data.
  - *Verified Sep 27 on production:*
    - A clear plea was published in 1.43 s and appeared on an open feed 1.62 s later with no reload; its trail shows both decisions.
    - A gift-card plea stayed a private draft (both URLs 404, anonymous count 0) with a code-written reason.
    - The emergency plea showed the resources.
    - All 6 production Jev calls are stored as decisions.
    - Jev down (bad key) → review with the error.
    - Calibration: 33/33.
    - The way back to a draft is `/status#token` (only the SHA-256 is stored).
  - **Dictation on a real phone (Sep 28):** the first try repeated every word (Chrome on Android re-sends the utterance so far). After the fix in `web/src/app/ask/transcript.ts`, the user's re-test on the same Android phone showed the sentence once.
- [x] Day 4 (Sep 30, done Sep 27): Workflows engine lifecycle (timebox) + verifier desk. Approve reuses the intake's revision-guarded publish transaction. Send-back is answered on `/status#token` and resubmitting re-runs triage. The 5 demo drafts in `review` are the test material.
  - *Timebox verdict:* adopt the engine. The whole lifecycle is `web/src/workflows/need-lifecycle.ts` (deployed `prod.need-lifecycle.v1`). Functions moved to cdg1, next to the EU Content Lake shard.
  - *Verified Sep 27 on production:*
    - Approve → published 4.2 s after the click, live on an open feed with no reload, and the review is in the trail.
    - Send back → the requester read the note, edited and resubmitted → re-triaged → published.
    - Reject → the draft stays private and the status page says "Rejected".
    - Unauthenticated and forged-cookie Server Action POSTs were refused.
    - The 17 older requests were adopted (not re-triaged).
    - A PayPal plea that auto-published exposed a gap in the payment flag question. It was reworded in the policy; calibration is 37/37.
- [x] Day 5 (Oct 1, done Sep 27): proof flow (Tesseract.js + editable lines + Jev match) + certificate. No definition change was needed: v1 already declared the proof stages.
  - *Verified Sep 27 on production (`dpl_FfkkSLjqCfxTZ8AbygNwtNHwwiWw`):*
    - Groceries sample on need-demo-08: read in the browser in 8.1 s → `auto_verified` (3/3 at p = 1.00) → certificate 10.4 s after submit → fulfilled.
    - Electronics sample on need-demo-06 → desk → declined with a note → back to `open`. Then the pharmacy sample → verified → fulfilled in 14.5 s. So the lifecycle re-enters the receipt check correctly.
    - A rewritten line on need-demo-01 (OCR similarity 0.51 < 0.60) → desk → accepted → certificate "verified by volunteer verifier Bram".
    - The certificate hash recomputes in the browser; a tampered payload shows a mismatch; Node's SHA-256 of the stored payload is equal.
    - Anonymous reads see 0 receipt scans, 0 reviews and 0 drafts. The pledge invariant holds.
  - Calibration on 11 synthetic receipts: 11/11 (`web/scripts/calibrate-proof.ts`).
  - Known limit: one receipt must cover the whole checklist. *(Quantities weren't checked until Sep 28; since then code counts them, see Day 7.)*
- [x] Day 6 (Oct 2, done Sep 28): polish, policy-as-content, empty/error states, per-network rate limits.
  - *Verified Sep 28 on production (`dpl_4mULSinxjePqcWo9iHd4vgC4JeYn`):*
    - **Rate limits,** counted in private Sanity documents (`web/src/lib/rate-limit.ts`) and exceeded on purpose with invalid inputs:
      - Passcode (desk sign-in + Jev health): 10 per 15 min, then 429 with `Retry-After`; the desk form shows the message.
      - Receipts: 6 per hour. Submits: 5 per hour. Catalog matches: 20 per hour. Pledges: 30 per hour.
      - No IP is stored (HMAC of the network). Anonymous reads see 0 counters. Expired counters are deleted automatically.
      - If Sanity can't count, the action is refused (checked with a "Sanity down" build).
    - **Error states:** every page says what failed when Sanity is unreachable. There are now a site-wide 404 and error boundary. The trail reports failed reads. The resubmit form no longer claims items "left the catalog" when the catalog failed to load.
    - **Phones:** all 7 pages fit at 390 px and 320 px. Fixed the nav wrap, grid overflow, and the camera-only receipt input.
    - **Policy as content:** `catalogMinProbability` 0.5 → 0.95 in the published policy dropped Bread (p 0.87) from the very next match 16 s later, with no redeploy ("proposed 3 items" → "proposed 2 items"). Restored.
  - Not done (optional idea): a trail "state check" that recomputes each decision's state from the published text and compares it with `stateDigest`.
- [ ] Day 7 (Oct 3, started Sep 28): full production run of every DoD step; demo reset script; demo video + screenshots.
  - [x] **Demo reset** (`web/scripts/demo-reset.ts`, dry run unless `--yes`). Ran Sep 28 after the user approved the dry-run list:
    - 92 documents deleted in one transaction (the 11 Day 3-4 test requests, all proofs, receipt scans, certificates, reviews and counters, all `prod` instances, and 35 test decisions). The 3 Day 1 health checks were kept.
    - Backed up to a git-ignored folder. Then the seed and the migration ran, and all 11 checks passed.
  - [x] **Full production run of DoD 1-7** (Sep 28, 12:28-13:05 UTC; details in BUILD_LOG):
    - Ask → published automatically in about 9 s; payment → volunteer; emergency → resources.
    - Desk: approve, send back → resubmit → published, reject.
    - Live pledge: 2.4 s in a second browser.
    - Receipts: automatic (certificate +10.6 s), declined then automatic, and volunteer-accepted. Certificate hash checked in the browser and in PowerShell.
    - Trails, the public dataset and the Studio checked.
    - This run's 9 documents are labeled demo (`web/scripts/label-demo.ts`).
  - [x] Screenshots: 14 in `handoff/media/` (the private token hidden), plus 4 of the quantity check (14-17).
  - [x] **Found by the user:** "fulfilled" while the checklist said "2 still needed". *(Fixed and verified Sep 28 on production, `dpl_9DBzKHKMgv774T6SHAP8dSYQ7xrT`; details in BUILD_LOG "Day 7 (part 2)".)*
    - Now code counts the units a receipt shows. Jev never counts.
    - Coverage means units, and the policy's `proofMinCoverage` is 1: automatic "fulfilled" means everything, in full.
    - A volunteer who accepts a short receipt must write a public note.
    - A fulfilled checklist shows "N/M on the receipt". Pledges are shown as optional promises.
    - Checks:
      - Offline: 58/58 (`web/scripts/check-quantities.ts`).
      - Real Jev: 17/17 receipts.
      - Production: pharmacy → demo-07 automatic (3/3, 2/2, certificate v2), a short receipt → desk → accepting without a note refused → accepted with a note, household → demo-05 automatic.
  - [ ] Demo video (agent-browser `record`).
  - Optional polish: label the times. Server-rendered ones (desk, trails) are UTC, while the status page uses local time.
- [ ] Day 8 (Oct 4): DEV post from `handoff/BUILD_LOG.md` (Path Two template); publish by noon PDT.

## Risks → fallbacks

- Workflows engine too rough → document-state fallback (see SHOULD). Don't burn more than the Day 4 timebox.
- Jev error/rate limit → show the error, keep the request as a draft for human review; never auto-publish.
- Tesseract misreads → editable lines + low confidence → human review; sample receipts for judges.
- Speech API unsupported (Firefox) → text input.
- Non-English pleas (Jev is English-first) → flagged to a bilingual verifier.
