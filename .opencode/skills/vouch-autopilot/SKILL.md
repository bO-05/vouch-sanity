---
name: vouch-autopilot
description: Session autopilot for the Vouch (Sanity edition) repo. Use at the START of every session in vouch-sanity, whatever the first message says ("go", "continue", "next", "lanjut", "hi", a task); after a context compaction; when a handoff/PLAN.md item is finished; and when the user says stop, done, pause, wrap up, bye or selesai. Runs the start briefing, one-time setup, work loop and automatic wrap-up (BUILD_LOG, STATUS, PLAN, commit, push).
---

# Vouch autopilot

The user shouldn't have to paste prompts or remember a procedure. They open a session and type anything; you run the routines below. The rules in `AGENTS.md` always apply.

## Routine A: START (first message of every session, and after a compaction)

1. Read `handoff/STATUS.md` (the resume point) and the **last** entry of `handoff/BUILD_LOG.md`. `AGENTS.md` and `handoff/PLAN.md` are auto-loaded; re-read them after a compaction.
2. Run `git status --short` and `git log --oneline -10`.
   - If an earlier session left uncommitted changes, work out what they are from the diff plus STATUS/BUILD_LOG. Re-verify that they work; they go into the next wrap-up.
3. Pick the task:
   - If STATUS shows the one-time setup is incomplete → do Routine B first.
   - Else, if the user's message names a task or asks a question → do that.
   - Else → the "Exact next action" in STATUS, i.e. the first unchecked item in `handoff/PLAN.md`.
4. Reply with a briefing of at most 5 lines (where we are, what's next, blockers) plus a short step list that includes the **done-check**: how you'll verify the item end-to-end against real services. Then **start working immediately**. Only wait when you need something only the user can do.

## Routine B: ONE-TIME SETUP (only the steps STATUS shows as not done)

Update STATUS after each step.
1. **Sanity login.**
   - Ask which provider the user signs in with: github, google, sanity or vercel.
   - Run `npx sanity@latest login --provider <provider>` with a timeout of at least 300000 ms.
   - Tell the user a browser window will open and they should finish the login there.
   - Then confirm the login (for example `npx sanity@latest projects list`). Never print tokens, and never run `sanity debug --secrets`.
2. **GitHub.** `gh repo create bO-05/vouch-sanity --private`, then add it as `origin`. Push at the first wrap-up.
3. **Secrets file.**
   - After `web/` exists, create `web/.env.local` with empty lines: `TYPESAFE_API_KEY=`, `SANITY_API_WRITE_TOKEN=`, `VERIFIER_PASSCODE=`, plus the public Sanity project ID and dataset.
   - Ask the user to paste the TypeSafe key into that file in the editor, never into chat.
   - Confirm it works with one real Jev call, without echoing the key. Generate the write token and passcode yourself where possible, without printing them.
4. Record every ID and URL in STATUS (project ID, dataset, Studio URL, Vercel URL, repo URL).

## Routine C: WORK LOOP

- Stay inside the current PLAN item. Work one verified step at a time.
- Follow `AGENTS.md`: no fake success, secrets stay server-side, store every Jev decision, verify for real.
- The user uses the OpenCode app, not a terminal. Run every command yourself and prefer non-interactive flags.
- Keep notes for the build log as you go: what you asked or tried, what broke (the exact error), how you fixed it, doc gaps, surprises. This is the heart of the DEV post.
- If a fact in `handoff/RESEARCH.md` turns out to be wrong, fix it there.
- When the item's done-check passes → Routine D. Then continue with the next item if the session is still in good shape.

## Routine D: WRAP-UP (automatic)

**When:**
- A PLAN item or a meaningful milestone has been verified.
- The user says stop / done / pause / wrap up / bye / selesai.
- The session is getting long (many tool calls or large files read). Wrap up *before* continuing.

**Permission:** the user has pre-authorized wrap-up commits and pushes to the **private** repo. Never force-push, never rewrite history, never make the repo public without asking, never commit secrets.

1. Run the checks that exist (typecheck / lint / build for `web/` and `studio/`). Report failures honestly.
2. Append a dated entry to `handoff/BUILD_LOG.md` (template below).
3. Rewrite `handoff/STATUS.md` so a brand-new session can resume from it alone (template below).
4. Tick verified boxes in `handoff/PLAN.md` and add newly discovered tasks. Keep the `AGENTS.md` Commands section current.
5. Run `git status` and `git diff --staged`. Confirm no `.env*` files, tokens or keys are staged. Commit with a concise message, then push. If `origin` doesn't exist yet, create the private repo first.
6. In one or two lines, tell the user what was saved and whether to keep going here or open a fresh session. A fresh session needs no prompt: open a new session in this project and type "go".

### BUILD_LOG entry template

```markdown
## Day N: <Weekday, Mon DD>. <short title>

**Goal:** <PLAN item>
**What shipped:** <what works now>
**Verified by:** <the exact check: URL visited, command run, observed result>
**Prompts/approaches that worked:** <brief quotes>
**What didn't:** <failed attempts, with the error>
**Where we got stuck and how we course-corrected:** <...>
**Decisions:** <what and why>
**Next:** <exact next step>
```

### STATUS template

```markdown
# STATUS: resume point
**Last updated:** <date, day N, one-line summary>
## Where we are          (3-6 bullets)
## Exact next action     (numbered, concrete, verifiable)
## Accounts and setup state   (table: GitHub, Vercel, Sanity, TypeSafe, tooling)
## IDs and URLs          (project ID, dataset, Studio URL, web URL, repo URL)
## Secrets: locations only, never values
## Blockers / open questions
```

## Session rotation and compaction

- You can't open a new session yourself. After a wrap-up in a long session, say: "Good point to start fresh: open a new session in this project and type go."
- If you notice the history was compacted (you see a summary instead of the full conversation), run Routine A steps 1-2 again before continuing.

## Never

- Never ask the user to open a terminal or to paste secrets into chat.
- Never print secrets (tokens, `.env` contents, `sanity debug --secrets`).
- Never tick a PLAN box because something "builds"; tick it only for verified behavior.
- Never let the agent fake success. If a service fails, show the failure or route to a human.
