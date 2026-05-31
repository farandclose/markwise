# Markwise - note-authoring instructions

This is the instruction block for an agent asked by a reviewer to turn plain-language feedback into
Markwise notes in a document. (Authoring surface per DECISIONS D21; the reviewer remains the source
of intent.) The CLI fills in `<CURRENT_TIME>`.

---

## Your job

A human reviewer gives you a markdown document and feedback in plain language. Turn each distinct
piece of feedback into a Markwise **note**: place an inline marker in the prose and add a matching
JSON record to the file's `mw:log` block. Do **not** otherwise change the prose - you are
annotating, not revising.

## Choose the note type

- `comment` - a question or observation; proposes no text change.
- `insert` - add new text at a point.
- `delete` - remove a span of text.
- `replace` - swap a span of text for new text.

A note is **either** a comment **or** a suggested edit (insert / delete / replace).

## Place the inline marker

- **Span** (delete, replace, or a comment about a specific phrase): wrap the text -
  `<!-- mw:ID -->...the text...<!-- /mw:ID -->`
- **Point** (insert, or a comment about a location): a single `<!-- mw:ID -->` at the spot.
- IDs: short and unique within the file (`s1`, `s2`, ...). Never reuse an id.
- Do not place markers inside fenced code blocks.

## Write the record

All note records live in a single `mw:log` block at the **end of the file**. This block is **one
multi-line HTML comment** - NOT a paired open/close tag like the inline markers. The opener
`<!-- mw:log v=1` has **no `-->` after it**; each record sits on its own line inside the comment;
and a single `-->` on the final line closes the whole block. Do **not** write a `<!-- /mw:log -->`
closing tag, and never let a record sit outside the comment (that would make the raw JSON visible
in the rendered document). Create the block if it does not exist. The exact shape:

```
<!-- mw:log v=1
{"id":"s1","type":"replace","state":"open","disp":"none","anchor":{"kind":"span","hash":"<short>","before":"...","after":"..."},"text":"...","thread":[{"by":"reviewer","at":"<CURRENT_TIME>","body":"..."}]}
{"id":"s2","type":"comment","state":"open","disp":"none","anchor":{"kind":"span","hash":"<short>","before":"...","after":"..."},"thread":[{"by":"reviewer","at":"<CURRENT_TIME>","body":"..."}]}
-->
```

- `state`: always `open` for a new note.
- `disp`: always `none` for a new note.
- `text`: the new text - for `insert` and `replace` only. Omit for `comment` and `delete`.
- `thread`: one opening message, `"by":"reviewer"`, carrying the reviewer's intent. If the reviewer
  gave no explicit wording, write a short faithful paraphrase of what they asked.
- `anchor`:
  - `kind`: `span` or `point`.
  - `before` / `after`: a few words of the surrounding prose, so the note can be relocated.
  - `hash`: a short fingerprint of the wrapped text for a span; if you cannot compute one, use a
    short placeholder - tooling reconciles it later (DECISIONS D20). Omit for a point.

## Rules

- Annotate only; do **not** change the prose itself.
- One note per distinct piece of feedback.
- Avoid the sequences `-->` and `--` inside any `body` / `text` **value** (this does not apply to
  the `mw:` marker and block syntax itself, which necessarily uses `--` and `-->`).
- Use this timestamp for every `at`: `<CURRENT_TIME>`.

## When you are done

Output the full file: the original prose with your inline markers added, followed by the `mw:log`
block containing one record per note.
