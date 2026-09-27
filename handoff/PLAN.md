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
- Sanity Workflows engine drives the lifecycle (1-day timebox). Fallback: same stages as a `stage` field + transition log on the document, advanced by the same server functions.
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
- `need`: title, story (requester's own words, never rewritten), language, displayName, city, country, geopoint, category ref, urgency (0-3), items[] {supplyItem ref, quantity, pledgedQty}, stage, triageSummary (flags + min confidence), publishedAt. Created as a draft; publishing = verified.
- `pledge`: need ref, itemKey, quantity, donorDisplayName, status (pledged / delivered / cancelled).
- `proof`: need ref, image asset, ocrText, lines[] {text, amount?}, matches[] {lineIndex, itemKey, probability}, coverage, verdict (auto_verified / needs_review / verified / rejected).
- `decision`: subject ref (need or proof, **weak**: the need may still be a draft), kind (catalog_match / triage / duplicate / proof_match / health_check), model id, questions (JSON string), answers (JSON string), **stateDigest** (SHA-256 of the state sent; the state itself is not stored, so an unverified plea never leaks through a published decision), outcome, error, latencyMs, inputTokens, createdAt.
- `review`: subject ref, action (approve / send_back / reject), note, reviewerName, createdAt.
- `certificate`: need ref, canonical payload, sha256, issuedAt.
- `policy` (singleton): thresholds (triage min confidence, max flag probability, proof min match probability, min coverage), urgency level texts, flag question texts, emergency resources text.

## Lifecycle (workflow `need-lifecycle`)

intake → triage (effect `jev-triage`) → [review, only if flagged] → open (collect pledges) → proof-check (effect `jev-proof`) → [proof-review, only if flagged] → fulfilled (effect `issue-certificate`). `rejected` is terminal. Send-back returns the request to its author with a note. Workflow subject = the need's base `_id` (not `drafts.`); publishing happens in an effect when triage/review passes.

## Jev question design (initial; calibrate on ~30 sample pleas)

- Catalog match (before submit, UX assist): one Noul per active supplyItem ("The request asks for {name} (also called {synonyms})"). Quantities pre-filled by code from numbers in the text; requester edits.
- Triage (on submit, one fan-out call): category (Choice from `category` docs + "unclear"), urgency (Score, levels from policy), immediate danger (Noul), personal contact info present (Noul), scam signals (Nouls: gift cards/crypto/wire to a third party; pressure for cash; not a material-help request), language (Choice). Gate in code with policy thresholds.
- Duplicates: GROQ finds recent needs in the same city/category → Noul "same household, same need".
- Proof match: Noul per (receipt line × checklist item); code assigns matches greedily and computes coverage; plus a "this text is a store receipt" Noul.

## Schedule and checklist (plan made Sat Sep 26)

- [x] Day 1 (Sep 26-27): GitHub repo; scaffold `web/` + `studio/`; Sanity project + public dataset; schemas; seed (categories, ~40 supply items, policy, ~10 needs); Studio deployed; skeleton `web/` deployed to Vercel; first real Jev call from a server route; fill AGENTS.md Commands. *(Verified Sep 26: project `o8hcpsct`, Studio vouch-aid.sanity.studio, web vouch-sanity.vercel.app; anonymous GROQ shows 8 published / 0 drafts; prod Jev call recorded as a decision.)*
- [x] Day 2 (Sep 28, done Sep 27): feed + request page + pledges (live updates). The pledge updates `pledgedQty` in the same transaction as the pledge doc (`ifRevisionId`); drafts return 404. *(Verified Sep 27 on production: two browsers, B updated ~1.4 s after A's pledge with no reload; `pledgedQty` and the pledge doc correct in Sanity; direct Server Action POSTs refused over-pledging, a draft-only request and a cross-site Origin; 6 simultaneous pledges for 5 units → exactly 5 accepted; drafts 404.)*
- [ ] Day 3 (Sep 29): submit flow (speech + text) → catalog match → triage → draft/publish gate → decisions stored. Also decide how a requester returns to their draft (needed for send-back), and check the trail's decision rendering on real data.
- [ ] Day 4 (Sep 30): Workflows engine lifecycle (timebox) + verifier desk.
- [ ] Day 5 (Oct 1): proof flow (Tesseract.js + editable lines + Jev match) + certificate.
- [ ] Day 6 (Oct 2): polish, policy-as-content, empty/error states; a simple per-IP rate limit on pledges and submissions; COULD items only if all MUST are green.
- [ ] Day 7 (Oct 3): full production run of every DoD step; demo reset script (delete non-demo pledges, proofs and test docs, then `npm run seed`) and seed demo data; demo video + screenshots.
- [ ] Day 8 (Oct 4): DEV post from `handoff/BUILD_LOG.md` (Path Two template); publish by noon PDT.

## Risks → fallbacks

- Workflows engine too rough → document-state fallback (see SHOULD). Don't burn more than the Day 4 timebox.
- Jev error/rate limit → show the error, keep the request as a draft for human review; never auto-publish.
- Tesseract misreads → editable lines + low confidence → human review; sample receipts for judges.
- Speech API unsupported (Firefox) → text input.
- Non-English pleas (Jev is English-first) → flagged to a bilingual verifier.
