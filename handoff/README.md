# START HERE: Vouch (Sanity edition) handoff

Everything needed to build, continue and finish this project lives in this folder. You never need an old chat session: every new OpenCode session starts from these files plus git.

## What's in `handoff/`

| File | What it is | Updated when |
|---|---|---|
| `README.md` | This page: how to start, continue and wrap up, with copy-paste prompts | rarely |
| `STATUS.md` | Resume point: where we are, the exact next action, IDs/URLs, blockers | every wrap-up |
| `PLAN.md` | Scope, definition of done, content model, lifecycle, schedule checklist | boxes ticked at wrap-up |
| `RESEARCH.md` | Challenge rules plus Sanity and Jev facts, with links | when we learn something new |
| `PROTOTYPE_LESSONS.md` | What the old prototype faked, and what's worth reusing | rarely |
| `BUILD_LOG.md` | Dated journal; becomes the DEV post's "My Build Process" | every wrap-up |

Loaded automatically into every session: `../AGENTS.md` (project rules), `PLAN.md` and `STATUS.md` (via `../opencode.json`). This only works when the project is opened at the `vouch-sanity` folder itself.

## How to use it: autopilot, no prompts needed

1. Open this folder as the project, not its parent: `D:\Repo\ALL HACKATHONS\DevTo Hackathons or Challenges\vouch-sanity`
2. Start a new session and type anything: `go`, `continue`, `lanjut`, or a specific task.
   For the very first session, this message works even if the autopilot didn't load:
   `go. First session for Vouch (Sanity edition), project root D:\Repo\ALL HACKATHONS\DevTo Hackathons or Challenges\vouch-sanity. Use the vouch-autopilot skill: run START, then the one-time SETUP, then Day 1 from handoff/PLAN.md.`

That's it. The project skill `vouch-autopilot` (in `.opencode/skills/`) and `AGENTS.md` make the agent do the rest by itself:
- **Every session start:** it reads `STATUS.md` and the log, checks git, gives a 5-line briefing, and continues the next PLAN item. The first time, it does the one-time setup (Sanity login, GitHub repo, secrets file).
- **Every finished milestone,** or when you say `stop`, `done` or `pause`: it updates `BUILD_LOG.md`, `STATUS.md` and `PLAN.md`, then commits and pushes to the private repo. You pre-authorized this.
- **Long sessions:** after a wrap-up, it tells you to open a fresh session. You just type `go` again.

You don't need a terminal. The agent runs commands itself. When something needs your browser (the Sanity login) or a secret (the TypeSafe key), it tells you exactly what to do.

After adding or changing anything in `.opencode/` or `opencode.json`, **restart the OpenCode app once**. Config and skills load at startup.

## Fallback prompts (only if the autopilot doesn't kick in)

These do the same thing manually. `/next` and `/wrapup` are shortcuts for Prompt 2 and Prompt 3.

## Prompt 1: first session only (Day 1 kickoff)

```text
We're building Vouch (Sanity edition) for the DEV Sanity Challenge, Path Two.
Project root: D:\Repo\ALL HACKATHONS\DevTo Hackathons or Challenges\vouch-sanity

1. Read handoff/README.md, handoff/STATUS.md, handoff/PLAN.md and AGENTS.md (some may already be in your context), skim handoff/BUILD_LOG.md, and read handoff/RESEARCH.md sections 1-3.
2. Start Day 1 from handoff/PLAN.md. I use the OpenCode app, not a terminal, so run every command yourself. One-time setup first:
   a. Sanity login: ask me which login provider I use (GitHub, Google, Sanity email, or Vercel), then run `npx sanity@latest login --provider <provider>` with a long timeout (5+ minutes). I'll finish the login in the browser window it opens.
   b. Create a PRIVATE GitHub repo bO-05/vouch-sanity with gh and add it as the remote. Don't push yet.
   c. Once web/ exists, create web/.env.local with an empty TYPESAFE_API_KEY= line and tell me to paste my key into that file. Never ask me to paste it into chat. Then confirm the key works with one real Jev call, without printing it.
3. Work through the rest of Day 1, verifying each step for real. Only stop when you need me (a browser login, a key, an account decision).
4. When Day 1 is done, or the context gets long, do the wrap-up (Prompt 3 in handoff/README.md).
```

## Prompt 2: every later session (continue)

```text
Continue Vouch (Sanity edition).
Project root: D:\Repo\ALL HACKATHONS\DevTo Hackathons or Challenges\vouch-sanity

Read handoff/STATUS.md and the latest entry in handoff/BUILD_LOG.md, and check `git log --oneline -15` and `git status`. Then take the next unchecked item in handoff/PLAN.md (or this task instead: ______).
Give me a briefing of 5 lines or fewer and a short step list that says how we'll verify it end-to-end, then start working. I use the OpenCode app, not a terminal: run commands yourself and only stop when you need me.
```

If your OpenCode app shows custom slash commands, `/next` does the same thing.

## Prompt 3: end of a work block (wrap up)

```text
Wrap up this session following handoff/README.md:
1. Run the checks (typecheck/lint/build) and report failures honestly.
2. Append a dated entry to handoff/BUILD_LOG.md: what shipped and how it was verified, prompts that worked and didn't, where you got stuck, decisions, next step.
3. Rewrite handoff/STATUS.md so a brand-new session can resume from it alone.
4. Tick verified items in handoff/PLAN.md.
5. Make sure no secrets are staged, then commit and push to the private GitHub repo.
```

`/wrapup` does the same thing.

## Session rhythm

- Plan on one session per work block, roughly one PLAN day or one feature. The agent wraps up on its own; then open a fresh session and type `go`.
- Start fresh whenever replies get slow or forgetful. Say `wrap up` first if the agent hasn't just done it. Nothing is lost: the state lives in `handoff/` and git.
- You never need to reopen old sessions to continue. They're only useful as transcripts for the DEV post.

## Things only you can do

- Finish browser logins. Sanity is needed once; GitHub and Vercel are already logged in on this machine.
- Paste the TypeSafe key into `web/.env.local` when asked, and into Vercel's environment variables if the agent can't set them for you.
- Decide when the GitHub repo goes public (at submission).
- Record the demo video and publish the DEV post. The agent drafts the post from `BUILD_LOG.md`.

## For the DEV post later

- DEV's agent-session uploader doesn't support OpenCode. To show sessions, use `/share` (public link) or export them, and quote prompts from `BUILD_LOG.md`.
- Never share a session that contains a secret.
