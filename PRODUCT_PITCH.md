# Markwise - Product Pitch

## One-line pitch

Markwise is the human-agent review layer for markdown.

## Product pitch

AI agents are becoming good at producing long-form work: PRDs, specs, strategy docs, research notes, launch plans, architecture proposals, and other markdown-based documents. But the review loop back to the agent is still broken.

A human reviewer either replies in chat, which loses the exact location and intent of the feedback, or edits the markdown directly, which gives the agent no structured way to understand what changed, what remains open, and what needs a response.

Markwise gives teams a shared protocol for reviewing agent-written markdown: anchored comments, suggested edits, reply threads, review state, and agent responses, all carried inside the markdown artifact itself.

## The core insight

The problem is not simply that markdown needs comments.

The problem is:

> Agent-written documents need a durable human feedback loop that both humans and agents can understand.

That means Markwise is not just annotation syntax. It is a workflow contract:

- The human leaves local, structured feedback.
- The agent revises the document.
- The agent responds to every item.
- The human decides whether the feedback is resolved.
- The document preserves the review history without polluting normal reading.

## Why not CriticMarkup

CriticMarkup is useful prior art, but it solves a narrower problem: visible editorial markup for prose editing.

Markwise is taking a different position.

| Need | CriticMarkup | Markwise |
|---|---|---|
| Show insert/delete/replace suggestions | Strong | Supported through Markwise suggestions |
| Clean in normal markdown previewers like VS Code and GitHub | Weak when unsupported | Strong, because metadata is hidden in HTML comments |
| Threaded comments | Not core | Core |
| Review states | Not core | Core |
| Agent replies | Not core | Core |
| Prompt generation for agents | Not core | Core |
| Lint/status/export tooling | Not core | Core |
| Self-contained markdown artifact | Yes | Yes |
| Designed for human-agent review loop | No | Yes |

The reason to move away from CriticMarkup is not just that VS Code preview looks bad. That would be too tactical.

The stronger reason is that CriticMarkup is an editorial syntax, while Markwise is a review protocol for AI-generated documents. Clean preview is an important requirement because these documents are routinely read in ordinary markdown tools, but the deeper difference is workflow: state, threads, accountability, and closure.

The right framing is not "CriticMarkup is bad." It is:

> Markwise borrows the spirit of CriticMarkup, but adapts it for AI-era document review: invisible by default, structured for machines, and workflow-aware for humans.

## Market positioning

Markwise sits between markdown editors, document review tools, and AI agents.

It is not trying to replace Google Docs, Notion, GitHub PR review, or VS Code. It is the missing protocol layer for agent-produced markdown.

Positioning statement:

> Markwise is a lightweight review protocol and preview tool for teams using AI agents to create markdown documents. It lets humans give precise, structured feedback and lets agents revise against that feedback without losing context, state, or accountability.

## Target users

The first users are people already using agents to produce written work:

- PMs reviewing PRDs, strategy notes, and launch docs.
- Engineering leads reviewing specs and architecture docs.
- Researchers reviewing AI-generated summaries.
- Founders and operators using agents for planning documents.
- Teams that keep important work in markdown repos.

The common pattern is not job title. The common pattern is: important markdown is being drafted by AI, and humans need to review it properly.

## Category

Markwise should avoid positioning itself as only a markdown commenting tool. That sounds too small.

Better category options:

- AI document review protocol.
- Human-agent feedback layer.
- Review workflow for AI-written markdown.
- Structured feedback system for agent-authored docs.

The strongest category phrase is:

> Human-agent review layer for markdown.

## Why this can win

Markdown is already the portable artifact format for technical and semi-technical teams. Agents can read it. Humans can version it. Repos can store it. Existing tools can preview it.

But markdown lacks a shared review loop that is both human-friendly and agent-actionable.

Markwise wins if it keeps three promises:

1. **Readable everywhere:** normal markdown previews stay clean.
2. **Actionable by agents:** feedback has IDs, anchors, states, and instructions.
3. **Closed-loop by design:** every comment gets revised against, answered, resolved, or reopened.

That is the real product, not the syntax.

## Recommended PM framing

Markwise turns markdown from a one-way AI output into a reviewable, revisable work artifact.

Unlike CriticMarkup, which is mainly visible editorial syntax, Markwise is built for the full human-agent feedback loop: anchored comments, structured state, suggested edits, agent replies, linting, status, and clean previews in everyday markdown tools.

It lets teams keep using plain markdown while giving AI agents the missing protocol they need to respond to feedback reliably.

## Interop note

Markwise should support CriticMarkup import/export later. That makes the positioning less defensive.

Markwise is not rejecting the existing standard. It is saying the agent-review use case needs a richer protocol.
