# Vouch (Sanity edition): agent guide

Every OpenCode session opened on this folder loads this file automatically, plus `handoff/PLAN.md` and `handoff/STATUS.md` (via `opencode.json`). Earlier chat sessions are NOT available to you: **the `handoff/` folder and git are the memory.**

## Autopilot (always on): the user does not paste prompts

The user opens a session in this project and types anything: "go", "continue", "lanjut", a question, or a task. You drive the process with the project skill **`vouch-autopilot`** (`.opencode/skills/vouch-autopilot/SKILL.md`).

- **First message of every session, and after any context compaction:** load that skill and run its START routine before anything else.
  - Read `handoff/STATUS.md` and the latest `handoff/BUILD_LOG.md` entry, and check git.
  - Brief the user in 5 lines or fewer.
  - Then carry on with the task they named, or else the next unchecked item in `handoff/PLAN.md`.
  - If STATUS shows the one-time setup is incomplete, do that first.
- **Wrap up automatically.** Triggers: a PLAN item or meaningful milestone is verified, the user says stop / done / pause / bye, or the session gets long.
  - Steps: run the checks, append to `handoff/BUILD_LOG.md`, rewrite `handoff/STATUS.md`, tick `handoff/PLAN.md`, then commit and push.
  - **The user has pre-authorized these wrap-up commits and pushes to the private GitHub repo.** Never force-push, never make the repo public without asking, never commit secrets.
- **Rotating sessions:** after a wrap-up in a long session, tell the user to open a fresh session and type "go". Nothing is lost: the state lives in `handoff/` and git.
- **Manual overrides** still work: `/next`, `/wrapup`, and the fallback prompts in `handoff/README.md`.

## What we're building

Vouch: verified mutual aid, for the DEV Sanity Challenge, **Path Two ("Vibe-code something strange")**.
Deadline: **Sun Oct 4 2026, 11:59 PM PDT**. Target: DEV post published by noon PDT on Oct 4.

A neighbor asks for help by voice or text. Jev (TypeSafe's System One model) turns the plea into typed decisions with calibrated confidence. Sanity holds everything: the supply catalog, the requests (drafts until verified), pledges, proofs, and every AI decision. A request goes live automatically only when Jev is confident and nothing is flagged; otherwise a volunteer verifier decides. Receipts are OCR'd in the browser and matched to the checklist by Jev before a request is marked fulfilled.

Story hook for the post: "A mutual-aid app whose AI can't write a single sentence." No LLM rewrites anyone's words; Jev only makes typed decisions, and Sanity's draft/published model is the trust gate.

## Locked decisions (don't relitigate without asking the user)

- Path Two only. One polished, end-to-end app. No bloat.
- Built from scratch in this repo, inside the challenge window. The Sep 2026 prototype is reference only (`handoff/PROTOTYPE_LESSONS.md`): port visuals, never its logic. Credit it in the post.
- AI = Jev only, plus Tesseract.js (OCR) and the browser's speech recognition. No Gemini, no other LLM, no ElevenLabs.
- No Solana, no payments. Donors pledge checklist items; goods/money move off-platform; proof closes the loop.
- Sanity draft → published is the trust gate. Unverified requests stay drafts (not publicly readable).
- Stack: Next.js App Router (TypeScript) + Sanity Studio v6 + Sanity Workflows engine (early access) driven from Next.js server code. App SDK desk only if every MUST item is done.

## Non-negotiable rules

1. **No fake success.** If Jev, Sanity, or OCR fails, show the failure or route to a human. Never fabricate a result, score, signature, or "verified" state. No silent heuristic fallbacks. (The prototype broke this rule; see `handoff/PROTOTYPE_LESSONS.md`.)
2. **Secrets stay server-side.** `TYPESAFE_API_KEY` and Sanity write tokens live only in server code and git-ignored `.env.local` files. Never ask the user to paste secrets into chat, and never print them in command output (sessions may be shared publicly).
3. **Every Jev call is stored** as a `decision` document (questions, answers, model id, latency, outcome) so the UI can show why something happened.
4. **Code owns rules and math.** Exact lookups, budgets, state transitions and thresholds are code/content; Jev only answers narrow, typed questions. Thresholds live in the Sanity `policy` document.
5. **Verify end-to-end against real services** before ticking a PLAN item. "It builds" is not "it works".
6. **No personal contact data** in the dataset: display name + city only.
7. Claims in README/post must match what actually runs.

## The user works in the OpenCode app, not a terminal

- Run every command yourself with the shell tool. Never tell the user to "run X in a terminal".
- Prefer non-interactive CLI flags (`-y`, `--provider`, `--json`, etc.); interactive prompts hang the shell tool.
- When a command needs the user's browser (e.g. `npx sanity@latest login --provider github`), run it with a long timeout (5+ minutes), tell the user exactly what to click, and wait.
- When a secret is needed, create the git-ignored file with an empty `KEY=` line, tell the user to paste the value into that file in the editor, then verify it works without echoing it.

## While working

- Stay scoped to the current PLAN item. Note surprises as you go (errors, doc gaps, workarounds, prompts that failed); they're writeup material.
- If a fact in `handoff/RESEARCH.md` turns out to be wrong, fix it there.

## Where things are

- `.opencode/skills/vouch-autopilot/SKILL.md`: the START / SETUP / WORK / WRAP-UP routines and the log and status templates.
- `handoff/README.md`: START HERE for humans. How to use the project, fallback prompts, and what only the user can do.
- `handoff/STATUS.md`: resume point. Current state, next action, IDs/URLs, blockers. Rewritten at every wrap-up.
- `handoff/PLAN.md`: scope tiers, definition of done, content model, lifecycle, schedule checklist. Source of truth for progress.
- `handoff/RESEARCH.md`: challenge rules, Sanity (Workflows, App SDK, Functions, CLI, datasets) and TypeSafe/Jev API facts with links. Read the relevant section before touching that area; prefer live docs if something looks outdated.
- `handoff/PROTOTYPE_LESSONS.md`: what the prototype got wrong, and what's worth porting (with paths in the old repo).
- `handoff/BUILD_LOG.md`: dated journal that feeds the DEV post's "My Build Process" section.
- App layout: `web/` (Next.js 16 App Router), `studio/` (Sanity Studio v6: `schemaTypes/`, `structure.ts`, `scripts/seed.ts`), later `workflows/` (workflow definitions + `sanity.workflow.ts`) and optionally `desk/` (App SDK). npm workspaces at the root.
- Web internals:
  - `web/src/lib/jev.ts`: the only place Jev is called. It records every call as a `decision`.
  - `web/src/lib/pledges.ts`: the only place pledges are written. Code validation, then one `ifRevisionId`-guarded transaction, retried on 409.
  - `web/src/lib/sanity/client.ts`: public, published-only.
  - `web/src/lib/sanity/write-client.ts`: server-only editor token.
  - `web/src/lib/sanity/live.ts`: `SanityLive` plus `fetchPublished`, the uncached reads for live pages.
  - `web/src/lib/queries.ts`: GROQ.
  - `web/src/app/requests/[id]/`: the request page, the pledge form and the pledge Server Action.

## Commands

Run from the repo root (npm workspaces `web` and `studio`) unless noted.

| What | Command | Notes |
|---|---|---|
| Install | `npm install` | One lockfile at the root. Verify it stays healthy (see Environment notes) |
| Web dev server | `npm run dev:web` | http://localhost:3000, reads `web/.env.local` |
| Studio dev server | `npm run dev:studio` | http://localhost:3333 |
| Typecheck | `npm run typecheck` | web runs `next typegen` first (generates `LayoutProps`/`PageProps`) |
| Lint | `npm run lint` | Slow on this machine (the studio ESLint config takes ~40 s just to load). Run with a long timeout |
| Build | `npm run build:web` / `npm run build:studio` | |
| All checks | `npm run check` | typecheck + lint + both builds |
| Seed Sanity | `npm run seed` | `studio/scripts/seed.ts` via `sanity exec --with-user-token`. Idempotent; the policy uses createIfNotExists, so Studio edits survive |
| Deploy Studio | `npm run deploy:studio` | → https://vouch-aid.sanity.studio (appId is in `studio/sanity.cli.ts`, so there's no prompt) |
| Deploy web | `npx -y vercel@latest deploy --prod --yes` (repo root) | The project has Root Directory `web`. The global Vercel CLI (37.x) is too old: always use `npx vercel@latest` |
| Sanity CLI | `& "..\node_modules\.bin\sanity.cmd" <cmd>` (from `studio/`) | The binary is hoisted to the root `node_modules`. `npx sanity ...` can hang for minutes here, so call the local binary. Non-interactive commands: `documents create <file> --replace`, `documents delete <ids>`, `cors list`, `cors add <origin> --no-credentials` |
| Browser checks | `npx -y agent-browser --session <name> <cmd>` | Not on PATH. The first `open` in a session starts a daemon, and the shell tool reports `ChildProcess.kill`, but the session keeps working. Use two sessions for live-update checks |
| Call a Server Action directly | See RESEARCH §2.7 | For adversarial tests (over-pledge, drafts, races). Action ids differ per build |
| Pledge invariant | Anonymous GROQ: `*[_type=='need']{_id, 'bad': items[coalesce(pledgedQty,0) != coalesce(math::sum(*[_type=='pledge' && status!='cancelled' && need._ref==^.^._id && itemKey==^._key].quantity),0)]._key}[count(bad) > 0]` | Must return `[]` |
| Jev health check | `POST /api/jev/health` with header `x-verifier-passcode` | One real Jev call, recorded as a `decision` doc |
| Status | `GET /api/status` | Sanity counts plus which server secrets are set (booleans only) |

## Environment notes

- Windows + PowerShell 5.1: no `&&` (use `;` or `if ($?) { ... }`). Use `-LiteralPath` for paths with `[ ]` (the old prototype folder has brackets).
  - PS 5.1 strips embedded double quotes from native-command arguments: in GROQ passed on the command line, use single-quoted strings (`*[_type=='need']`).
  - Don't combine `$ErrorActionPreference = 'Stop'` with native commands that write to stderr (npm warnings become terminating errors). Wrap npm in `cmd /c "... > file 2>&1"` when you need its output.
  - `Start-Process` for long-lived servers makes the shell tool report a `ChildProcess.kill` error, but the process keeps running. Check the port afterwards and stop it by PID.
- Node 22.22 locally (OK for App SDK, which needs 22.12+). Module loading is slow here (likely antivirus scanning `node_modules`), so give builds and lint long timeouts.
- npm lockfile health: after any dependency change, check that `package-lock.json` entries have `resolved` and `integrity` and that the Linux binaries (`lightningcss-linux-x64-gnu`, `@next/swc-linux-x64-gnu`) are present. On Day 1 a killed install left a degraded lockfile that broke the Vercel build. Fix: move `node_modules` aside, run `npm install --package-lock-only`, move it back, run `npm install`.
- `@sanity/icons` v5: import icons from subpaths (`@sanity/icons/Inbox`). Root named imports type-check as `never` but break the bundle. The studio ESLint config blocks them.
- GitHub CLI logged in as `bO-05`; Vercel CLI logged in as `bo-05` (team `bo05s-projects`); Sanity CLI logged in via Google.
- Once code exists, index this repo with codebase-memory-mcp (project name `vouch-sanity`) and follow the global graph-first rules.
