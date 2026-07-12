# markwise feedback command + launch follow-up post

- Date: 2026-07-12
- Status: draft for review
- Owner: Saurabh (PM), build via Opus subagents per standard workflow

## Context and objective

A month ago Saurabh posted (X/LinkedIn) about the pain of reviewing agent-written
markdown. markwise now exists: live on npm (`markwise@0.3.0`), site at
https://markwise.dev, repo at github.com/farandclose/markwise. This spec covers the
follow-up announcement post and the feedback channel it points to.

**Post objective:** 5-15 real users install markwise, run it on a real
agent-written doc, and send actionable feedback. Reach, stars, and installs are
side effects, not goals.

**Timeline:** post this week. The feedback command must be live on npm before the
post goes out (its CTA names the command).

## Part A: `markwise feedback` CLI subcommand

New subcommand in the existing dispatcher (`src/cli.ts`), implemented in a new
`src/feedback.ts`, following the pattern of the other commands.

### Flow

1. `markwise feedback` runs a short structured terminal interview (readline,
   one line per answer, Enter submits each):
   - Q1: "What were you trying to do?"
   - Q2: "What happened - what worked, what broke?"
   - Q3: "What would you change or add first?"
   - Q4 (optional): "GitHub handle or email, if you're open to follow-up
     questions (Enter to skip)"
2. At least one of Q1-Q3 must be non-empty; otherwise exit with a friendly
   message and send nothing.
3. Auto-collected metadata, shown to the user before sending: markwise version,
   platform (`process.platform`), Node major version. Nothing else - no paths,
   no file contents, no IP-derived info in the issue body.
4. Confirmation gate (required, because the text becomes public):
   "This will be posted publicly as a GitHub issue on farandclose/markwise.
   Send? [Y/n]"
5. On confirm, POST to the relay (Part B). On success print:
   "Thanks - your feedback is now issue #N: <issueUrl>". The URL lets users with
   a GitHub account subscribe or comment as themselves.
6. Ctrl-C at any point aborts; nothing is sent, nothing is written to disk.

### Failure fallbacks (nothing typed is ever lost)

If the relay is unreachable or returns an error:

1. Save the composed feedback as `markwise-feedback-draft.md` in the current
   directory and tell the user.
2. Attempt to open the browser at the repo's new-issue URL with title and body
   prefilled via query params (safe under the ~8 KB URL limit for typed answers).
3. If the browser cannot be opened, print the composed markdown and the issues
   URL for manual paste.

### Config

- Endpoint default: `https://markwise.dev/api/feedback`. Overridable via
  `MARKWISE_FEEDBACK_URL` env var (testing/staging).

## Part B: relay service (Vercel function)

The repo already deploys to the `markwise-md` Vercel project as a static site
(`outputDirectory: site`). Add `api/feedback.ts` at the repo root; Vercel serves
it at `https://markwise.dev/api/feedback` alongside the static site.

### Contract

- `POST /api/feedback` with JSON:
  `{ answers: { tryingTo, whatHappened, wouldChange }, contact?, meta: { version, platform, node } }`
- Success: `201 { issueNumber, issueUrl }`
- Method other than POST: 405. Validation failure: 400. Rate limited: 429.

### Behavior

- Creates a GitHub issue on `farandclose/markwise` via the REST API:
  - Title: `CLI feedback: <first 60 chars of Q1, whitespace-collapsed>`, or
    `CLI feedback` if Q1 is empty.
  - Body: the three Q/A sections, metadata line, and optional contact line.
  - Label: `cli-feedback` (label created in the repo as part of rollout).
- GitHub credential: fine-grained personal access token from a dedicated
  machine account (`markwise-bot` or similar), scoped to the single repo with
  Issues read/write only. Stored as a Vercel env var (`FEEDBACK_GITHUB_TOKEN`).
  GitHub permits one machine account per person. Migrating to a GitHub App is
  deferred hardening, not v1.

### Abuse protection (v1 bar: raise effort, accept residual risk)

- Reject total answer text under 20 or over 10,000 characters.
- Require header `X-Markwise-Client: <constant>` baked into the CLI release.
  Not a secret - just filters drive-by curl spam.
- Best-effort per-IP rate limit of 3 submissions/hour. v1 may use an in-memory
  per-instance limiter; if abuse appears, escalate to Vercel WAF rules. Never
  block silently - return 429 so the CLI falls back to the browser path.
- The token is never echoed; errors returned to the CLI contain no internals.

## Part C: repo and site surfaces

- README gains a "Feedback" section: the `markwise feedback` command, the
  issues link, and the ladder ("or reply/DM on the announcement post").
- Create the `cli-feedback` label.
- Site: one line mentioning `markwise feedback` (may ride the in-flight
  `feat/landing-critique-fixes` branch or a tiny follow-up PR).

## Part D: the follow-up post

Two variants from one outline: LinkedIn (single long post) and X (shorter,
optionally a thread). Copy is drafted after the command ships and is reviewed
by Saurabh before posting. Outline:

1. Callback: one line quoting the original post's pain (splitting attention
   between the doc and the terminal).
2. What got built: markwise, the review layer for agent-written markdown -
   one sentence, then a short GIF/screen recording of select -> comment ->
   agent acts (reuse the site hero gesture material).
3. Try it: `pnpm add -g markwise`, then run it on the next plan your agent
   writes.
4. Feedback as a product statement: "Feedback works the markwise way: run
   `markwise feedback`, type, hit Enter - it lands in my GitHub issues. No
   account needed."
5. Ladder: "or just reply/DM - I read everything."
6. Close: ask people to poke holes, echoing the original post's ending.

Tone rules: no feature list, no superlatives. The post is a report back to a
thread that asked for it, not an ad.

## Sequencing (launch checklist)

1. Human steps (Saurabh): create the machine account, issue the fine-grained
   PAT, add it as a Vercel env var, create the `cli-feedback` label.
2. Build: CLI subcommand + relay + tests (subagent build from the plan).
3. Deploy relay; end-to-end verify by filing one real issue, then closing it.
4. Version bump to 0.4.0 (new feature = minor); Saurabh pushes the tag
   (release tags are human-gated); OIDC publishes to npm.
5. Merge `feat/landing-critique-fixes` so the site is at its best before
   traffic arrives.
6. Merge README feedback section.
7. Draft post copy (both variants), Saurabh reviews, posts.
8. Triage window: respond to incoming `cli-feedback` issues fast; transcribe
   DM/reply feedback into issues manually.

## Success criteria

- On a clean machine with no GitHub CLI and no GitHub login, `markwise
  feedback` produces a public labeled issue within seconds.
- 5-15 substantive feedback submissions within two weeks of posting.
- At least a third of submissions have a follow-up path (contact field filled,
  or the submitter commented on their issue from their own account).

## Out of scope / deferred

- `--doc` annotated FEEDBACK.md mode (the dogfooded doc-review feedback flow).
- `/markwise:feedback` agent-side command - arrives with the planned
  `markwise setup` packaging work; also the hook for announcement post #3.
- GitHub App migration, CAPTCHA, accounts, private feedback storage.

## Key decisions

- Relay over `gh` CLI or prefilled-URL-only: zero-friction submission was
  chosen knowing bot-authored issues are anonymous by default; the optional
  contact field and printed issue URL recover the follow-up path.
- Structured three-question prompt over a blank one: blank prompts collect
  applause, not actionable feedback.
- Machine-account PAT over GitHub App for v1: one day of build budget; the
  App is better hygiene but slower to stand up.
