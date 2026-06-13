# Support CRLF (Windows) line endings, preserving them on write

Date: 2026-06-13
Branch: `crlf-support`
Status: approved design, pending implementation plan

## Context

Markwise stores review markers and a JSON log inside the markdown file, and anchors each note by
1-based line number, byte offset, surrounding "before"/"after" breadcrumb text, and a short
content hash. The parser splits on `\n` (`source.split('\n')`) and every mutation re-joins with
`\n` (`lines.join('\n')`). It has no handling for `\r`.

The cross-OS CI matrix added on the npm-shipping branch caught the consequence: on Windows,
git checks files out with CRLF (`\r\n`) line endings, and markwise then misreads them. A CRLF
copy of the repo's own `sample.md` lints as broken - every inline marker reports `L142`
(orphaned marker, no matching record) and the log records report `L106` (record-shaped JSON
outside any block). The npm branch fixed this for the *repository* by forcing LF via
`.gitattributes`, and explicitly deferred runtime support for CRLF files a user actually
authored. This spec is that deferred work.

The user-facing goal: a Windows user can open their own CRLF markdown file in the previewer,
leave comments and suggested edits, and have markwise read it correctly and save it back
**still in CRLF**, with a diff that shows only the lines markwise actually changed.

## Goal and success criteria

1. Every markwise command reads a CRLF (or mixed) markdown file correctly - identical results to
   the same file in LF form (lint findings, status, parsed notes, hashes).
2. When markwise writes a user's file (preview save, `lint --fix`, `export`), it preserves that
   file's original line ending. A CRLF file stays CRLF; an LF file stays LF.
3. A diff of a CRLF file after a markwise write shows only the lines markwise changed - not a
   whole-file ending flip.
4. The Windows CI jobs (already green on a forced-LF checkout) stay green, and new tests prove
   the CRLF round-trip directly.

## Scope

In scope:
- A small line-ending utility module.
- Normalizing user-document reads to LF at every read site, and re-applying the detected ending
  at every user-file write site.
- Tests: utility units, CRLF lint correctness, CRLF preview round-trip, hash stability.

Out of scope:
- Changing the parser, hashing, anchoring, mutation, lint, or strip internals. They continue to
  operate on LF text only; this work guarantees they always receive LF.
- Per-line preservation of mixed-ending files (see Locked decisions).
- Any review/preview feature behavior or UI change. The change is invisible to correctly-behaved
  (LF) files.
- The `.gitattributes` repo policy (already in place; unchanged).

## Locked decisions

- **Approach: normalize at the I/O boundary** (not a CRLF-aware core). Convert to LF immediately
  on read; re-apply the original ending only at the final write. The core stays LF-only - its
  existing contract becomes a guarantee. Chosen over teaching the parser/offset math/hashing to
  carry `\r`, which spreads line-ending logic through the well-tested core.
- **Preserve the file's ending on write** (not normalize-to-LF). User decision: a Windows user's
  file must stay CRLF.
- **Ending detection (dominant):** count `\r\n` versus lone `\n`; the file's ending is CRLF when
  CRLF occurrences are at least as many as lone-LF occurrences (ties favor CRLF), otherwise LF.
  Pure-CRLF and pure-LF files - the overwhelming majority - are unambiguous either way.
- **Mixed-ending files** are written uniformly in that dominant ending, not preserved per line.
- **Lone-CR-only files** (classic Mac, effectively extinct) are normalized to LF on read and
  written as LF. Accepted limitation, documented.
- **The previewer version hash** (optimistic-concurrency `shortHash`) is computed over the
  **normalized (LF)** text on both the load and save sides, so detection still works and the
  browser's offsets align with what the server mutates.
- **`export`'s clean copy** uses the **source file's** detected ending (a CRLF source yields a
  CRLF clean copy).

## Design

### 1. New module: `src/eol.ts`

A single-responsibility utility with three pure functions:

- `detectEol(source: string): '\r\n' | '\n'` - returns the dominant ending: `'\r\n'` when the
  count of `\r\n` is at least the count of lone `\n` (ties favor CRLF), else `'\n'`. Pure-CRLF and
  pure-LF files are unambiguous.
- `toLf(source: string): string` - normalizes to LF: replace `\r\n` with `\n`, then any remaining
  lone `\r` with `\n`. This is what every reader feeds to the rest of the system.
- `applyEol(text: string, eol: '\r\n' | '\n'): string` - if `eol` is `'\r\n'`, convert the LF
  `text`'s `\n` to `\r\n`; otherwise return `text` unchanged. Inverse of `toLf` for write-back.
  Assumes `text` is already LF (it is - it came from the LF-only core).
- `readDocument(file)` / `writeDocument(file, text, eol)` - thin fs wrappers that apply the three
  functions, so each read/write site uses one tested helper rather than inlining the calls.

### 2. Read boundary - normalize on entry

Every read of the **user's document** normalizes with `toLf` before any parsing or hashing, and
captures `detectEol(raw)` wherever a write may follow:

- `src/cli.ts`: `lint` read, `status` read, `prompt` read, `export` read.
- `src/preview/server.ts`: `persist()`'s read, and the `GET /api/doc` read.

Reads of **our own package templates** (`AGENT_PROMPT.md`, `AUTHOR_PROMPT.md`, `SETUP_PROMPT.md`)
and static preview assets are not user documents and are left unchanged (already LF).

### 3. Write boundary - preserve on exit

Every write of a **user file** applies the source's detected ending to the LF result:

- `src/cli.ts`: `lint --fix` write, `export` output write (uses the source file's ending).
- `src/preview/server.ts`: `persist()`'s `writeFileSync`.

Concretely, each write site changes from `writeFileSync(path, text)` to
`writeFileSync(path, applyEol(text, eol))`, where `eol` was detected from that file's bytes on
the corresponding read.

### 4. Data flow (previewer, the read-write path)

1. `GET /api/doc`: read raw -> `toLf` -> build payload (render, records, version hash) from the
   LF text -> browser renders and computes selection offsets in LF space.
2. Browser POSTs a mutation (reply/resolve/discard/new note) with LF-space offsets and the
   version hash it received.
3. `persist()`: read raw -> capture `eol = detectEol(raw)` -> `toLf` -> version-hash check
   (`shortHash` of the LF text vs the header) -> run the mutation/`fixText`/`lintText` (all LF)
   -> `writeFileSync(path, applyEol(result, eol))` -> rebuild payload from the LF result.

Because the browser only ever sees normalized text, its offsets and the server's mutations share
one coordinate space; CRLF never reaches the core or the client.

### 5. What stays unchanged

`parse.ts`, `hash.ts`, `mutate.ts`, `fix.ts`, `strip.ts`, `lint.ts`, and the rules all keep
operating on LF strings. No offset arithmetic, regex, or hashing logic changes. This is the point
of the boundary approach: the blast radius is the I/O edges plus one new utility file.

## Testing strategy

Test first, per task:

- `test/eol.test.ts` (extend the existing repo-LF guard, or a new `test/eol-util.test.ts` for the
  utility - keep the existing guard test): `detectEol` (LF, CRLF, mixed, empty), `toLf` (CRLF,
  lone CR, already-LF idempotent), `applyEol` (LF passthrough, CRLF round-trips `toLf`).
- Lint correctness: a CRLF rendering of `sample.md` lints clean (the exact failure we reproduced),
  and matches the LF result finding-for-finding.
- Hash stability: `shortHash` of a document is identical for its CRLF and LF forms (because the
  hash is computed post-normalization).
- Preview round-trip: starting from a CRLF source, a reply (and a resolve) writes a file that is
  still CRLF, where only the changed line differs from the original bytes.
- `export` of a CRLF source yields a CRLF clean copy; `export` of an LF source yields LF.
- The existing 180 tests continue to pass unchanged (LF files behave identically).
- Cross-OS proof: the existing Windows CI jobs remain green; the round-trip test exercises the
  preserve-on-write path on every OS.

## Definition of done

- All read/write sites listed above normalize on read and preserve on write.
- New tests above pass; existing suite stays green.
- A CRLF `sample.md` lints clean locally and in Windows CI.
- A previewer reply/resolve on a CRLF file leaves it CRLF with a minimal diff.

## Risks and assumptions

- **Missed read or write site.** If a user-file read forgets `toLf`, that path regresses on CRLF;
  if a write forgets `applyEol`, that path flips the ending. Mitigation: the read/write sites are
  few and enumerated above; the round-trip test covers the preview path, and CRLF lint covers the
  cli read paths.
- **The version-hash check.** It must hash the normalized text on both sides; hashing raw on one
  side and normalized on the other would always 409. Mitigation: a single shared normalize step
  feeds both `buildDocPayload` and `persist`.
- **Mixed/lone-CR files** are rare; the chosen uniform-write and normalize-to-LF behaviors are
  accepted and documented, not bugs.
- Assumes Node reads files as UTF-8 (already the case) and that `\r\n`/`\n` are the only endings
  worth preserving.
