# Handoff: human steps for the markwise feedback launch

For Saurabh, to run in a separate assisted session. These are the steps that
need a human (account creation, secrets, admin rights) for the `markwise
feedback` launch. Full context lives in the spec:
`docs/superpowers/specs/2026-07-12-feedback-command-and-launch-post-design.md`.
Build work happens on `feat/feedback-command` in a parallel session - these
steps can be done in any order relative to the build, but all of 1-3 must be
done before end-to-end verification of the relay.

## 1. Create the bot machine account

- Sign up at github.com with a fresh email (an alias like
  saurabhmehta123+markwisebot@gmail.com works). Suggested name: `markwise-bot`;
  any available name is fine - note whatever you pick.
- GitHub ToS allows one machine account per human.
- Invite the bot as a collaborator on farandclose/markwise with the **Triage**
  role (Settings -> Collaborators). Any account can file issues on public
  repos, but GitHub silently drops the `cli-feedback` label at creation time
  unless the creator has at least triage access. Triage grants no code access.
- Store the credentials in your password manager.

## 2. Issue the token

- Logged in as the bot: Settings -> Developer settings -> Personal access
  tokens -> Tokens (classic) -> Generate new token (classic).
- Scope: `public_repo` only. Name it `markwise-feedback-relay`.
  Expiration: 90 days is fine (set a reminder to rotate).
- Why classic, not fine-grained: fine-grained PATs cannot target a repo the
  token owner does not own. Blast radius is small - the bot owns nothing, so
  the token only lets it do what any GitHub account can do on public repos.
- Copy the token; it is shown once.

## 3. Put the token in Vercel

From the repo root (project `markwise-md`, team `farandcloses-projects`):

```
vercel env add FEEDBACK_GITHUB_TOKEN production
vercel env add FEEDBACK_GITHUB_TOKEN preview
```

Paste the token when prompted. Never commit it anywhere. Verify with
`vercel env ls` - the var should show for production and preview.

## 4. Create the issue label

```
gh label create cli-feedback --repo farandclose/markwise \
  --description "Feedback submitted via markwise feedback CLI" --color 0E8A16
```

(Or via the repo's web UI: Issues -> Labels -> New label.)

## 5. Later, after the build merges (not now)

- Push the release tag (`v0.4.0`) once the version bump lands on main - the
  tag push is always your step; OIDC then publishes to npm.
- Review the post copy drafts before anything is posted.

## Done when

- `vercel env ls` shows FEEDBACK_GITHUB_TOKEN in production and preview.
- The `cli-feedback` label exists on farandclose/markwise.
- Bot credentials and token are in your password manager.
