# Prototype lessons

The idea for this app comes from **Vouch**, a prototype built Sep 4-8, 2026 for the DEV Weekend Challenge (Generosity Edition). It was never submitted.

- Local folder (reference only): `D:\Repo\ALL HACKATHONS\DevTo Hackathons or Challenges\weekend challenge - generosity [Vouch]`. The brackets matter in PowerShell, so use `-LiteralPath` or `git -C "<path>"`.
- Remote: https://github.com/bO-05/vouch
- Stack: React 18 + Vite SPA, one Express file (`server/index.js`, ~3.4k lines), JSON-file "database", about a dozen external integrations.

This rebuild shares the idea and some visuals. **No logic is ported.** Credit the prototype in the DEV post.

## What went wrong (don't repeat it)

Line numbers below point to the old repo. They were checked on Sep 26, 2026.

1. **Verification always succeeded.**
   - The proof route marked the request fulfilled and unlocked "escrow" for every proof.
   - It returned `isVerified: true` regardless of what the model said (`server/index.js:2803-2837`).
   - Confidence defaulted to 98 (`server/index.js:2600`, `2705`, `2723`).
2. **"Escrow" was a boolean** in the JSON file (`server/index.js:3226`, unlocked at `2820`). No funds were ever held.
3. **Fake on-chain evidence.** When the sponsor wallet couldn't pay, a random *unrelated* devnet transaction signature was attached and labeled on-chain (`server/index.js:3178-3192`).
4. **Simulated integrations.**
   - The Snowflake/"Cortex" panel was simulated (`server/index.js:1383`), with a `Math.random()` sentiment score (`server/index.js:1562`).
   - AI routes fell back to keyword templates that silently replaced model output.
   - Tests passed on those fallbacks.
5. **The lifecycle was only `active → fulfilled`.** An `in_review` status existed in the types but was never set.
6. **The client owned the state.**
   - `POST /api/requests` stored the raw client body, so clients could set status or amounts.
   - There was no auth.
   - CORS was open to all origins.
7. **Docs overstated reality.** The README and submission draft claimed "production-grade" features that were simulated.

**Rules that follow from this** (also in AGENTS.md):
- No fake success.
- The server owns all state transitions.
- Every AI verdict is actually used and stored.
- Public claims must match what runs.

## Worth porting (visuals and ideas only; credit in the post)

- **Visual language:** dark "obsidian + amber" palette and card layout. See `src/index.css`, `src/components/AidCard.tsx` and `src/components/HeroBanner.tsx`.
- **World map** (COULD tier): d3-geo + topojson projection in `src/components/GlobalRadarMap.tsx`. It's about 1k lines, so simplify heavily.
- **Certificate check:** the in-browser SHA-256 verifier idea from `src/components/ProofOfGenerosityModal.tsx`.
- **Sample receipts:** `public/demo-assets/sample-cvs-receipt.svg` and `sample-kroger-receipt.svg`. Convert them to PNG/JPG for OCR tests; Tesseract can't read SVG.
- **Seed stories:** `server/db.json` and `server/defaultData.js`. Rewrite them honestly and drop the fake weather, verification and "501(c)(3) verified" claims.
- **Voice capture:** the Web Speech API pattern in `src/components/VoiceRecorderModal.tsx`, roughly lines 117-153.

Line references in this last section come from an automated audit and are approximate. Re-check them before relying on them.
