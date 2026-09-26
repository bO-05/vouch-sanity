# RESEARCH: facts gathered on Sep 26, 2026

Condensed from the live pages below. Early-access products change fast: when a detail matters, re-check the linked live doc.

---

## 1. The challenge (DEV x Sanity)

- Page: https://dev.to/challenges/sanity-2026-09-16 · Announcement: https://dev.to/devteam/join-the-sanity-challenge-2500-in-prizes-for-five-winners-514m
- Runs Sep 18 → **Oct 4, 11:59 PM PDT**. Winners announced Oct 22.
- **Path Two: "Vibe-code something strange"** (our path). "Prompt your way to a working app. Any AI-native IDE, Next.js or Astro on the front, Sanity behind it." Judged on the build as much as the result. "A rough app with an honest writeup beats a polished one with three sentences."
  - Judging: (1) quality and honesty of the build-process writeup, (2) functionality of the finished app, (3) thoughtfulness of the schema, (4) creativity and originality.
  - Bonus for reaching past the Studio: **App SDK** (custom app with real-time data and your own interface) and **Workflows** ("model a process as data next to the content, so an agent can move a draft forward and a person can approve it through the same transitions"). Neither required; "a submission that uses one well will stand out."
  - Prizes: 2 winners × $500 + DEV++ + badge. Completion badge for all valid entries.
- Path One (agent + Sanity Context MCP + Knowledge Base): 3 winners. Not in scope.
- Requirements:
  - **Sanity project ID or a public dataset URL in the post** (judges inspect the schema/content). Without it the entry may be incomplete.
  - Tag `#sanitychallenge`; template tags: `devchallenge, sanitychallenge, sanity, ai`.
  - If login is needed, give judges test credentials/instructions (→ our verifier passcode).
  - One submission per path; separate posts per path; teams up to 4.
- Path Two template sections: What I Built · Demo (link + video/screenshots) · Code · **My Build Process** ("the heart": which AI-native IDE, prompts that worked and didn't, where the model got stuck, how you course-corrected, how App SDK/Workflows went) · Sanity Project Details · Agent Session (optional).
- Agent sessions: DEV's uploader (https://dev.to/agent_sessions/new) supports Claude Code, Gemini CLI, Codex, GitHub Copilot CLI, Pi. **OpenCode isn't listed** → link an OpenCode `/share` URL (opncd.ai/s/...) or quote excerpts from `/export` (Markdown) / `opencode export --sanitize` (JSON). Check for secrets first.
- Rules on prior work: riffing on/improving previous work is allowed "but your changes must be significant enough"; "any non-generic, non-trivial usage of prior work ... must be credited". AI use is allowed. → Credit the Sep 2026 prototype in one or two sentences.

---

## 2. Sanity

Docs index for agents: https://www.sanity.io/docs/llms.txt

### 2.1 Workflows (early access)
- Cookbook: https://www.sanity.io/docs/workflows/cookbook · AI content pipeline (our template): https://www.sanity.io/docs/workflows/cookbook-ai-content-pipeline · Quick start: https://www.sanity.io/docs/workflows/getting-started · Early access terms: https://www.sanity.io/docs/workflows/prerelease · Functions runtime: https://www.sanity.io/docs/workflows/sanity-functions · Testing (in-memory bench): https://www.sanity.io/docs/workflows/testing · Workflows MCP server: https://www.sanity.io/docs/workflows/mcp
- Packages (public on npm, same version for all): `@sanity/workflow-engine` (0.35.0 on Sep 26; Node ≥ 20), `@sanity/workflow-cli` (bin `sanity-workflows`). Quick start needs ≥ 0.33.0 and Node 20.12+.
- It's a **library, not a service**: nothing moves unless our code calls the engine. Effects are queued and run when something calls `drainEffects()`. Time-based conditions need someone to call `tick()`.
- Early-access caveats: 0.x, minor versions may break APIs; every engine check is **advisory** (UX, not security); guards aren't enforced by the Content Lake yet; Studio plugin needs **Studio ≥ 6.15**; there are Studio/App SDK adapters for custom workflow UIs.
- Definition language (`@sanity/workflow-engine/define`): `defineWorkflow({name, title, initialStage, fields, stages})`, `defineStage({name, activities, transitions})`, `defineActivity({name, actions})`, `defineAction({name, when?, status?: 'done'|'failed', effects?, params?, ops?})`, `defineTransition({name, to, when?})`, `defineField({type: 'subject'|'actor'|'string'|'progress'|..., name})`. Default transition condition is `$allActivitiesDone`. Conditions can read `$effectStatus['name']`, `$effects['name'].outputKey`, `$fields.x`. A stage with no transitions is terminal.
- A **required `subject` field needs reader model 10**: set `expectedMinReaderModel: 10` in the deployment.
- Subject = global document reference. CLI form `dataset:PROJECT_ID:DATASET:DOCUMENT_ID`; code form `refDataset({projectId, dataset, documentId, type})`. Use the **base `_id`, never `drafts.xxx`** (versioned ids are rejected). The AI-pipeline cookbook starts an instance on a draft-only document (base id) and publishes it later in a `publishing` stage, which is exactly our drafts-as-gate model.
- Config file `sanity.workflow.ts` → `defineWorkflowConfig({deployments: [{name, tag, expectedMinReaderModel: 10, workflowResource: {type: 'dataset', id: 'PROJECT.DATASET'}, definitions: [...]}]})`. Deploy: `npx sanity-workflows deploy` (`--check` validates offline, `--dry-run` diffs). CLI uses the `sanity login` session, or `SANITY_AUTH_TOKEN`.
- CLI for manual testing: `npx sanity-workflows start <def> --field subject='{"id":"dataset:P:D:ID","type":"need"}'`, `fire-action <INSTANCE_ID> --activity <a> --action <x>`, `show <INSTANCE_ID>`, `nuke --deployment <name>` (resets workflow data only).
- Engine in our server code:
  ```ts
  import {createClient} from '@sanity/client'
  import {createEngine, ENGINE_API_VERSION, refDataset} from '@sanity/workflow-engine'
  const engine = createEngine({
    client: createClient({projectId, dataset, apiVersion: ENGINE_API_VERSION, token, useCdn: false}),
    workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`},
    tag: 'prod',
    effects: {handlers: effectHandlers},
    // resourceClients: (parsed) => ... route subject reads to a content client if datasets differ
  })
  const started = await engine.startInstance({definition: 'need-lifecycle', initialFields: [
    {type: 'subject', name: 'subject', value: refDataset({projectId, dataset, documentId: needId, type: 'need'})},
  ]})
  await engine.drainEffects({instanceId: started.instance._id}) // runs queued effects, cascades transitions
  await engine.fireAction({instanceId, activity: 'verify', action: 'approve'}) // human step
  ```
- Effect handler: `const h: EffectHandler = async (params, ctx) => { ...; return {outputs: {flagged: true}} }`. `params` carries the declared `bindings` (e.g. `subject: '$fields.subject._id'`; `extractDocumentId(params.subject)` gives the doc id). `ctx.effectKey` is the idempotency key (handlers may run more than once), plus `ctx.setProgress(field, n)` and `ctx.log()`. Outputs must be declared on the effect (`outputs: [{type: 'boolean', name: 'flagged'}]`).
- Cookbook's own suggestion we implement: "Confidence scores instead of pass/fail: have a check return a number, and gate needs-human on a threshold." The cookbook's checks use an LLM prompt + JSON parsing + validation; Jev replaces that with typed answers.

### 2.2 Functions (probably not needed)
- https://www.sanity.io/docs/functions/functions-introduction. Node 24 runtime, default timeout 10 s (max 900), recursion limit 16.
- **Scheduled Functions on the Free plan run at most daily** (Growth: hourly). So we drive the workflow engine from Next.js server routes instead of cron Functions.

### 2.3 App SDK (COULD tier)
- https://www.sanity.io/docs/app-sdk/sdk-introduction. Requires **React 19+, Node 22.12+**, `@sanity/sdk-react`; app is hosted in the Sanity Dashboard (org members only, so judges can't log in: show it in the video). Hooks with Suspense, real-time documents, optimistic edits, permissions checks. No UI kit (pair with Sanity UI). Safari has dev-mode connection issues (use Chrome).

### 2.4 Content Lake basics we rely on
- Public datasets expose **published** documents only; `drafts.*` need an authenticated token. That's why unverified needs stay drafts.
- Next.js integration: https://www.sanity.io/docs/next-js-quickstart (next-sanity, GROQ, Live Content API).

### 2.5 Sanity Context / Knowledge Bases (Path One only, out of scope)
- https://www.sanity.io/docs/ai/sanity-context: hosted read-only MCP server; needs Labs enabled by an org admin, an org token with Context Viewer, and your own LLM + agent harness. KBs are beta, ≤150 docs.

### 2.6 Sanity CLI, run by the agent (the user has no terminal)
- Reference: https://www.sanity.io/docs/cli-reference/login
- Login: `npx sanity@latest login --provider <google|github|sanity|vercel>`. It opens the browser; `--no-open` only prints the URL. Run it from the shell tool with a long timeout while the user finishes the login in the browser. The session token is stored in the user's Sanity CLI config.
- `sanity debug --secrets` prints the personal auth token. **Never run it in a session that might be shared**, and never echo the token.
- **Verified on Sep 26 with `@sanity/cli` 8.13.0** (the older docs example with `--create-project` is outdated):
  - Unattended project creation: `sanity init -y --project-name "Vouch" --organization <orgId> --dataset production --visibility public --template clean --typescript --output-path studio --package-manager npm --no-install --no-git --no-mcp --no-skills`. `--organization` is required in unattended mode; get the id from `sanity organizations list`. This created project `o8hcpsct` with Studio 6.16.
  - Tokens are in the CLI: `sanity tokens add "<label>" --role editor --json -y` prints JSON whose `token` field is the secret. Capture it straight into a git-ignored file and never echo it.
  - Studio hosting: `sanity deploy -y --schema-required --url <host>` builds, deploys the schema and hosts it at `<host>.sanity.studio`. Afterwards add the printed `appId` to `deployment` in `sanity.cli.ts` so later deploys don't prompt.
  - Built-in topics include `documents` (query/get/create), `schemas`, `datasets`, `tokens`, `cors`, `organizations` and **`workflows`** (deploy/inspect Workflows definitions and instances). The CLI may now cover what `@sanity/workflow-cli` does; check `sanity workflows --help` on Day 4.
  - `sanity documents query '<groq>' --api-version 2026-09-01` runs as the logged-in user, with drafts included (`--anonymous` = the public view).
  - `npx sanity ...` can hang for minutes on this machine. Call the workspace binary `node_modules\.bin\sanity.cmd` instead.
- Public dataset check (verified): an anonymous `GET https://o8hcpsct.api.sanity.io/v2026-09-01/data/query/production?query=...` returns published documents only. `drafts.*` never appear, even when queried by id.
- Vercel env vars: with CLI v60, `vercel env add` works non-interactively. We used the REST API instead (`POST /v10/projects/{id}/env?teamId=...&upsert=true`), reading values from `web/.env.local` inside PowerShell so none were printed. Secrets are `type: encrypted`, `NEXT_PUBLIC_*` values are `plain`.
- **Vercel CLI must be ≥ 47.2.2.** The global 37.12.1 fails with "This endpoint requires version 47.2.2 or later"; use `npx -y vercel@latest` (60.1.3 on Sep 26). v60 can set the Root Directory: `vercel project update <name> --root-directory web --framework nextjs --node-version 22.x --yes`.

---

## 3. TypeSafe / Jev

- Blog: https://typesafe.ai/blog/introducing-system-one-models-and-jev · Docs: https://docs.typesafe.ai/ (index: https://docs.typesafe.ai/llms.txt; append `.md` to any page for Markdown) · Skill: https://github.com/typesafe-ai/skills · Console/keys: https://console.typesafe.ai/ · Playground: https://console.typesafe.ai/playground
- The user has early access and an API key (to be pasted into `web/.env.local` by the user).
- What it is: a "System One" model. State + typed questions in → typed answers with probabilities out. **Does not generate text.** Can't break the answer type; that is NOT a guarantee of truth ("typed output guarantees the interface, not truth"). Word the post that way.

### 3.1 API
- `POST https://api.typesafe.ai/v1/systemone`, header `Authorization: Bearer $TYPESAFE_API_KEY`.
- Body: `{ state: string | object | array, model: "jev-latest", questions: { <id>: Question } }`. Question ids are for our code only (not sent to the model), so put full meaning in the question text.
- Question types:
  - `noul`: `{type: "noul", instructions, criteria?: {true, false}}` → answer `{type: "noul", noul: 0..1}` (probability of yes; no confidence field).
  - `choice`: `{type: "choice", instructions, criteria: {option: description|null}}`, **max 255 options** → `{choice, probabilities, confidence}`.
  - `score`: `{type: "score", instructions, criteria: [level0, level1, ...]}` with 2-10 ordered levels → `{score (can fall between levels), legend, probabilities, confidence}`.
  - `instructions`/`criteria` may be objects; reference data fields by name in backticks, e.g. `` "Is the resume for the same person as `potential_duplicate`?" ``. Reference nested state the same way (`` `need.story` ``).
- Response: `{model: "jev-1.13.0", answers: {...}, usage: {input_tokens, output_tokens}}`.
- Errors: 401 bad key, 422 validation (body names the field), 429 rate limit, 529 overloaded (retry with backoff; SDK does it).
- Models: `jev-latest` = `jev-1.13.0` (pin `jev-1.13.0` once thresholds are tuned). 64k tokens per request; 32k for state + the longest question. Rate limits ~250k tokens/s, 1,200 req/min (adjusting dynamically). Price $0.042 per 1M input tokens; output free. **Text only** (no images/audio: OCR first). English is strongest; other languages work less well → watch confidence.
- Vendor-claimed latency: 70-500 ms end-to-end. **Measured on Sep 26:** a 2-question call (an 8-option choice plus a noul, 636 input tokens) took 514 ms and 439 ms from a Windows laptop in Asia, and 151 ms from Vercel. The response `model` was `jev-1.13.0` (requested as `jev-latest`).
- Observed answer shapes (SDK 0.6.0): choice → `{type, choice, confidence, probabilities}` (probabilities keyed by label; on a clear case confidence was exactly 1); noul → `{type, noul}` (0.99 on a clear case). A choice can come back with a confidence of exactly 1.0, so thresholds need calibrating on ambiguous pleas, not easy ones.

### 3.2 JS SDK
- `npm install @typesafe-ai/sdk` (0.6.0 on Sep 26; Node ≥ 20). Reads `TYPESAFE_API_KEY` from env. Server-side only.
  ```ts
  import {choice, noul, score, TypeSafeClient} from '@typesafe-ai/sdk'
  const client = new TypeSafeClient()
  const res = await client.systemOne({
    state: {story: '...', city: 'Kharkiv'},
    questions: {
      category: choice('Which kind of help is requested?', {food: 'Food and groceries', shelter: null, unclear: 'None fits'}),
    },
  })
  res.answers.category.choice // typed from the question
  ```
  Also `noul(...)` and `score(...)` helpers; check exact signatures in the SDK types: https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts (reference: https://docs.typesafe.ai/sdk/javascript/api.md).
  - Verified signatures (0.6.0 `dist/index.d.mts`): `noul(instructions?, criteria?)`, `choice(instructions, criteria)`, `score(instructions, criteria)` where criteria is an array of ≥ 2 levels. Client options: `new TypeSafeClient({apiKey, defaultModel, timeout /* ms per attempt, default 10000 */, retry: {maxRetries /* default 2 */}, logLevel})`. Errors: `APIError` (`.status`, `.body`, `.requestId`) with subclasses `AuthenticationError` (401), `UnprocessableEntityError` (422), `RateLimitError` (429), `InternalServerError` (5xx), plus `APIConnectionError` and `APITimeoutError`. The SDK refuses to run in a browser unless `dangerouslyAllowBrowser` is set.

### 3.3 Design guidance (from the official skill)
- Keep the workflow in code; ask Jev narrow, atomic judgments. Put rules/math/lookups in code.
- Give enough **state** (prefer named JSON fields). Put the judgment in `instructions`, the possible answers in `criteria`. Include a no-match option ("unclear"/"none").
- **Fan-out:** ask independent questions over the same state in ONE request (they run in parallel and can't see each other). Adding questions barely changes latency.
- **Select instead of generate:** code finds candidates (regex numbers, catalog items, receipt lines); Jev selects. The model can't choose a value you didn't offer.
- **Confidence-gated routing:** answer = what, confidence = whether to act. Per-action thresholds tuned on our own data. Noul near 0.5 = genuinely uncertain, not "medium".
- Composite scoring: score dimensions separately, combine with weights in code.
- Useful pages: confidence routing https://docs.typesafe.ai/patterns/confidence-routing.md · fan-out https://docs.typesafe.ai/patterns/fan-out.md · pre-parsed value extraction https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook.md · entity alignment (dedupe) https://docs.typesafe.ai/cookbooks/entity_alignment.md · citation check https://docs.typesafe.ai/cookbooks/citation_check.md · guardrails https://docs.typesafe.ai/cookbooks/llm_guardrails.md · jaggedness https://docs.typesafe.ai/model-jaggedness/jev-1.13.md

---

## 4. Browser-side tools

- **Tesseract.js** (free OCR in the browser, no key): `createWorker('eng')` → `worker.recognize(image)` → `data.text` / lines. Downloads worker + language data from a CDN on first use. Receipts improve with preprocessing (grayscale, contrast, upscale). Always show editable lines before matching.
- **Web Speech API**: `window.SpeechRecognition || window.webkitSpeechRecognition`; Chrome/Edge/Safari, not Firefox; needs HTTPS (or localhost); set `lang` for the spoken language. Always offer text input.
- **Web Crypto**: `crypto.subtle.digest('SHA-256', bytes)` for the certificate check.
