# Markwise - Prior Art Comparison

This note compares Markwise with CriticMarkup and Roughdraft. Keep the short
decision record in `DECISIONS.md`; use this file for the fuller rationale and
tradeoffs.

Last updated: 2026-05-24

* * *
## Summary recommendation

Markwise should not position itself as "CriticMarkup, but hidden" or
"Roughdraft, but with different syntax." The stronger position is:

> Markwise is a clean-preview, protocol-first review layer for agent-written
> markdown, with interoperability paths to CriticMarkup and Roughdraft-style
> workflows.

The key product requirement that justifies a separate Markwise protocol is:

> A markdown file under active review must remain visually clean in mainstream
> markdown previewers that do not know Markwise exists.

If that requirement is relaxed, the custom HTML-comment protocol becomes much
less defensible, and adopting Roughdraft-flavored CriticMarkup becomes the
simpler path.

* * *
## CriticMarkup comparison

| Dimension | CriticMarkup | Markwise direction |
|---|---|---|
| Primary strength | Human-readable plain-text editorial markup | Structured, stateful, agent-actionable feedback loop |
| Preview in unsupported markdown tools | Renders as visible syntax | Hidden in most markdown previews via HTML comments |
| Raw source readability | Strong: feedback appears where it applies | Mixed: inline anchors are small, full details live elsewhere |
| Suggested edits | Strong native syntax for insert/delete/replace | Must be designed carefully |
| Threads | Not native | Native goal |
| Review states | Not native | Native goal |
| Agent replies | Not native | Native goal |
| Clean sharing during review | Weak | Stronger, but creates hidden-data leakage risk |
| Existing ecosystem | Stronger prior art | Custom protocol |

### Recommendation

Do not reject CriticMarkup as prior art. Borrow its operation model:

- comment
- highlight
- insert
- delete
- replace/substitute

But do not use CriticMarkup syntax as the canonical storage format if clean
mainstream preview is a core requirement.

Markwise should provide import/export paths:

- `markwise import --criticmarkup <doc>`
- `markwise export --criticmarkup <doc>`

This lets Markwise respect the existing ecosystem without inheriting
CriticMarkup's preview pollution in GitHub, VS Code, Obsidian, and similar
contexts.

* * *
## Roughdraft comparison

Roughdraft is not just CriticMarkup. It is a local-first review app, CLI, and
agent workflow wrapped around Roughdraft-flavored CriticMarkup. Its strongest
ideas are workflow ideas, not only syntax ideas.

| Dimension | Roughdraft | Markwise direction |
|---|---|---|
| Core product | Local-first markdown editor/viewer for AI collaboration | Protocol + CLI + previewer for agent-readable review loops |
| Storage | Roughdraft-flavored CriticMarkup in the `.md` file | HTML-comment anchors + footer record in the `.md` file |
| Source of truth | Markdown file with visible CriticMarkup | Markdown file with hidden Markwise metadata |
| Existing previewers | Review markup is visible when unsupported | Review markup is hidden in normal previews |
| Raw source readability | High for humans | Medium; optimized for clean rendered preview |
| Agent workflow | Strong: `open`, watch, Done Reviewing event, MCP | Planned: lint/status/prompt/export; should borrow handoff ideas |
| Structured state | Partial, via attributes such as `id`, `by`, `at`, `re` | Should be first-class |
| Suggested edits | Native CriticMarkup strength | Needs conflict rules |
| Differentiation | Polished local app around visible review markup | Clean-preview review protocol for agent loops |

### Recommendation

Borrow the workflow patterns from Roughdraft:

- a local `open <file>` review surface
- a "Done Reviewing" handoff event
- JSON output that agents can watch
- a review index that agents can query
- eventual MCP tools

Do not borrow Roughdraft's storage model as-is unless Markwise gives up the
clean-preview requirement.

* * *
## Design implications for Markwise

1. **Clean preview is the differentiator.** It should be stated as a core
   requirement, not treated as a convenience.

2. **HTML comments are a transport, not the whole protocol.** The protocol also
   needs lifecycle states, selector recovery, conflict rules, and safe payload
   encoding.

3. **Interop matters.** CriticMarkup and Roughdraft are not competitors to be
   dismissed. Markwise should import/export their review model where practical.

4. **Hidden data is a real risk.** Because Markwise data is invisible in
   rendered previews, `export` / `strip` must be a first-class sharing workflow.

5. **Agent handoff is a product feature.** A CLI that can open a review session,
   wait for completion, and emit machine-readable review status is more useful
   than a validator-only CLI.

