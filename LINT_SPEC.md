# Markwise - `lint` rule catalog

The complete, implementable set of checks `markwise lint` performs. This is the spec the CLI codes
against (build order D21 item 2). Rationale lives in DECISIONS.md (D33, D36-D38 and the schema
decisions D23-D35); this file is the *what*, organized for implementation.

## How to read this

- **Severity tracks consequence, not tier** (D37):
  - **error** - the file is unparseable, the review state is corrupted, or raw markup leaks into a
    normal markdown preview. The doc is broken or *looks* broken. Non-zero exit.
  - **warning** - the file is valid and renders clean, but something is degraded, risky, or almost
    certainly a mistake. Reported; exit zero by default.
- **Exit:** any `error` -> non-zero exit. `warning`s exit zero unless `--strict` is passed, which
  makes warnings fail too (D37).
- **`--fix`** (D38): read-only by default. With `--fix`, `lint` repairs **mechanical fields only**
  (recompute `hash`, refresh `before`/`after`) and never touches prose, `disp`, `state`, threads,
  or `text`. The **Fix** column marks which rules `--fix` can mend.
- **Rule IDs:** `L1xx` structural (Tier 1), `L2xx` anchor health (Tier 2), `L3xx` lifecycle
  (Tier 3). IDs are stable so output and tests can reference them.

## Tier 1 - Structural integrity

### Block envelope (D30, D33)

| ID | Check | Severity | Fix |
|----|-------|----------|-----|
| L101 | More than one `mw:log` block in the file | error | - |
| L102 | More than one `mw:archive` block in the file | error | - |
| L103 | Malformed block envelope: opener is not `<!-- mw:NAME v=1` on its own line, or the block is not closed by a `-->` on its own line | error | - |
| L104 | Paired-close form `<!-- /mw:log -->` / `<!-- /mw:archive -->` present (the block is one comment, not a paired tag) (D33b) | error | - |
| L105 | Self-closed opener `<!-- mw:log v=1 -->` followed by record lines (D33c) | error | - |
| L106 | Record-shaped JSON line sitting outside any `mw:` block - leaks as visible text in preview (D33a) | error | - |
| L107 | Unrecognized schema version (`v` not `1`) - reader must refuse or migrate (D13/D30) | error | - |
| L108 | A `mw:log` / `mw:archive` block is not at the end of the file (D2 footer layout) - valid and still hidden, but off-convention | warning | - |

### Record syntax (D23)

| ID | Check | Severity | Fix |
|----|-------|----------|-----|
| L110 | A line inside a block is not valid JSON (report the offending line number) | error | - |

### Record schema and values (D24-D28, D34, D35)

| ID | Check | Severity | Fix |
|----|-------|----------|-----|
| L120 | Missing a required key. Log record: `id`, `type`, `state`, `disp`, `anchor`, `thread`. Archive record: `id`, `type`, `state`, `at`, `summary` | error | - |
| L121 | `type` not one of `comment` / `insert` / `delete` / `replace` | error | - |
| L122 | `state` not one of `open` / `resolved` (D34) | error | - |
| L123 | `disp` not one of `none` / `applied` / `answered` / `declined` / `needs_clarification` (D35) | error | - |
| L124 | Payload rule violated: `text` must be present for `insert`/`replace` and absent for `comment`/`delete` (D27) | error | - |
| L125 | Bad anchor shape: `kind` not `span`/`point`; a `span` missing `hash`/`before`/`after`; or a `point` carrying a `hash` (D26) | error | - |
| L126 | Bad thread message: not `{by, at, body}`, or `by` not `reviewer`/`agent` (D28) | error | - |

### Escaping (D13/D17)

| ID | Check | Severity | Fix |
|----|-------|----------|-----|
| L130 | A `body` or `text` value contains a raw `-->` (or strict `--`) - breaks the HTML comment | error | - |

### ID and fence integrity (D8, D14, D15, D19)

| ID | Check | Severity | Fix |
|----|-------|----------|-----|
| L140 | Duplicate `id` within the file | error | - |
| L141 | A `mw:log` record has no matching inline marker in the prose | error | - |
| L142 | An inline marker in the prose has no matching record | error | - |
| L143 | Dangling fence: a span open marker without its close, or a close without its open (open Q5) | error | - |
| L144 | Marker shape does not match `type`: `comment` = point or span; `insert` = point; `delete` = span; `replace` = span (D8) | error | - |
| L145 | A `mw:` marker sits inside a fenced code block - leaks as visible text (D8/D14) | error | - |
| L146 | An archived record (in `mw:archive`) still has an inline marker in the prose; fences must be stripped on resolve (D19) | error | - |
| L147 | Two suggested edits (`insert`/`delete`/`replace`) whose spans overlap - ambiguous to apply; v1 rejects them (D14) | error | - |

## Tier 2 - Anchor health (D12, D18, D20)

These are the mechanical-field checks `--fix` can mend (D38).

| ID | Check | Severity | Fix |
|----|-------|----------|-----|
| L201 | A span's stored `hash` does not match the recomputed hash of the currently-wrapped text - the note may have drifted (`stale` / `needs_reanchor`) | warning | yes |
| L202 | A record's `before`/`after` context no longer matches the surrounding prose | warning | yes |

The full selector-*recovery* matching algorithm (how to relocate a note whose fence is gone) is
deferred (open Q3, pending drift evidence). Tier 2 only *detects* drift; it does not relocate.

## Tier 3 - Lifecycle consistency (D5, D19, D34, D35)

| ID | Check | Severity | Fix |
|----|-------|----------|-----|
| L301 | A `mw:log` record has `state:resolved` - resolved notes belong in `mw:archive` (D19/D34) | error | - |
| L302 | A `mw:archive` record has `state` other than `resolved` | error | - |
| L303 | A `declined` or `needs_clarification` note has no agent reply in its thread - the loop was not closed (D5) | warning | - |
| L304 | Suspicious `disp`/`type` combo: `disp:answered` on an edit-type note (`insert`/`delete`/`replace`), since `answered` means "replied, no prose change" (D35) | warning | - |

**Explicitly NOT a `lint` finding:** a note that is `open` with the reviewer's message last and no
agent response yet. Under D34 that is normal pending state ("the agent's turn"), reported by
`status`, not `lint`.

## Out of scope for v1 (deferred)

- Full selector-recovery / re-anchoring algorithm (open Q3).
- Exhaustive semantic validation beyond L303/L304.
- Comment-ID generation scheme (open Q4) - `lint` checks uniqueness (L140), not how IDs are minted.
- Suggested edits crossing markdown block boundaries (D14 marks these out of scope).
- CriticMarkup / Roughdraft interop validation (D16).
