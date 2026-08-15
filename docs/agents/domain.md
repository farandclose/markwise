# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root - the glossary and source of truth for what each Markwise term means.
- **`DECISIONS.md`** at the repo root - this repo's decision record (see below).
- **`docs/adr/`** - read ADRs that touch the area you're about to work in. This directory does not exist yet; see below.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Where decisions live in this repo

Markwise records architectural decisions in **`DECISIONS.md`** at the repo root, not as one-file-per-decision under `docs/adr/`. Decisions are numbered (`D4`, `D8`, `D18`, `D42`, `D43`, ...) and the file is **append-only**: new decisions are added at the end, and superseded ones are crossed out or annotated with a dated note rather than rewritten.

This matters because `docs/adr/` is currently empty. Treat `DECISIONS.md` as the ADR set:

- When a skill says "read the relevant ADRs", read the `D<n>` entries in `DECISIONS.md` that touch your area.
- When a skill says "flag ADR conflicts", cite the decision by its number (e.g. "Contradicts D8 - anchor drift").
- Reference a decision as `D<n>`, matching how the codebase and existing docs already cite them.

If ADRs are later split into `docs/adr/`, both locations apply - read `DECISIONS.md` for the historical record and `docs/adr/` for anything newer.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md          ← glossary
├── DECISIONS.md        ← numbered decisions (D1, D4, D8, ...)
├── docs/adr/           ← not yet used
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root - not the case here):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

`CONTEXT.md` is unusually strict here: most entries carry an explicit _Avoid_ line. For example, **note** is the atomic unit and **comment** is one specific *type* of note - so "comment" must never be used as the generic word. Honour those _Avoid_ lines.

If the concept you need isn't in the glossary yet, that's a signal - either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts a recorded decision, surface it explicitly rather than silently overriding:

> _Contradicts D4 (feedback stored as HTML comments) - but worth reopening because..._
