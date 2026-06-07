# Suggest-delete (Op 1: mouse-select + Delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reviewer propose deleting a phrase by selecting it with the mouse and pressing Delete; the span renders struck-through, a `delete` note appears with a × that discards (undoes) it, and the text stays in the file for the agent to remove.

**Architecture:** Pure string transforms in `src/preview/mutate.ts` (extend `createNote` for `type`, add `discardNote`) flow through the existing lint-gated `persist()` path in `src/preview/server.ts`. The browser (`src/preview/assets/app.js`) adds a `keydown` Delete trigger that reuses the existing `spanTargetFromSelection()` mapping and POSTs `{type:'delete', kind:'span', start, end}`; the rail card gains a × → on-card confirm → discard. No new protocol, no inline editor.

**Tech Stack:** TypeScript (Node http server, no framework), Vitest, vanilla browser JS/CSS. Markdown-it rendering with offset breadcrumbs already in place.

**Spec:** `docs/superpowers/specs/2026-06-07-previewer-suggest-delete-design.md`. Branch: `feat/suggest-delete`.

---

## File Structure

- **Modify** `src/preview/mutate.ts` — extend `createNote(opts.type)` to author `delete`; add `discardNote(source, id)`.
- **Modify** `src/preview/server.ts` — `POST /api/note` accepts optional `type`; add `discard` to the mutate-verb route.
- **Modify** `src/preview/assets/app.js` — Delete/Backspace gesture + `createDelete()`; delete-card excerpt + × discard control + on-card confirm.
- **Modify** `src/preview/assets/app.css` — styling for `.mw-card-discard` and `.mw-discard-confirm`.
- **Modify** `test/preview/mutate.test.ts` — delete-variant `createNote` tests + `discardNote` tests.
- **Modify** `test/preview/server.test.ts` — delete-create + discard endpoint tests.
- **Modify** `DECISIONS.md` (append D42) and `docs/superpowers/specs/2026-06-04-previewer-create-note-design.md` (line 28) — decision-log reframing.

Order: transforms → server → client → docs → full verification. Server tests depend on Task 1+2; client depends on Task 3.

---

## Task 1: `createNote` delete variant

**Files:**
- Modify: `src/preview/mutate.ts:158-205` (the `createNote` function)
- Test: `test/preview/mutate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this block to `test/preview/mutate.test.ts` (after the existing `describe('createNote', ...)` block, before the file's end). It reuses the existing `FRESH` fixture defined near line 222.

```typescript
describe('createNote (delete suggestions)', () => {
  const at = '2026-06-07T00:00:00Z';

  it('creates a delete note over a span: no text field, empty thread', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'delete' });
    expect(output).toContain(`<!-- mw:${id} -->wedge<!-- /mw:${id} -->`);
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.type).toBe('delete');
    expect(rec.state).toBe('open');
    expect(rec.disp).toBe('none');
    expect(rec.anchor.kind).toBe('span');
    expect(typeof rec.anchor.hash).toBe('string');
    expect('text' in rec).toBe(false);
    expect(rec.thread).toEqual([]);
  });

  it('seeds a reviewer thread message when a delete carries a comment', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: 'redundant', at, type: 'delete' });
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.thread).toEqual([{ by: 'reviewer', at, body: 'redundant' }]);
  });

  it('rejects a point delete (a delete must wrap a span)', () => {
    expect(() => createNote(FRESH, { kind: 'point', start: 5, body: '', at, type: 'delete' })).toThrow(NoteMutationError);
  });

  it('the created delete record is self-correct: fixText changes nothing and it lints clean', async () => {
    const { fixText } = await import('../../src/fix.js');
    const { lintText } = await import('../../src/lint.js');
    const wStart = FRESH.indexOf('wedge');
    const { output } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: '', at, type: 'delete' });
    expect(fixText(output).changes).toEqual([]);
    expect(lintText(output).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('still defaults to a comment when type is omitted', () => {
    const wStart = FRESH.indexOf('wedge');
    const { output, id } = createNote(FRESH, { kind: 'span', start: wStart, end: wStart + 5, body: 'why?', at });
    const rec = JSON.parse(output.split('\n').find((l) => l.trim().startsWith(`{"id":"${id}"`))!);
    expect(rec.type).toBe('comment');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: the new delete tests FAIL (e.g. `createNote` ignores `type`, so `rec.type` is `'comment'` not `'delete'`, and the point-delete case does not throw). The "defaults to a comment" test passes.

- [ ] **Step 3: Implement — replace the `createNote` function**

Replace the whole `createNote` function (`src/preview/mutate.ts`, currently lines 158-205) with this version. Changes: `opts.type?`, type-aware body rule, point-delete rejection, and a type-aware `thread`.

```typescript
export function createNote(
  source: string,
  opts: {
    kind: 'point' | 'span';
    start: number;
    end?: number;
    body: string;
    at: string;
    type?: 'comment' | 'delete';
  }
): { output: string; id: string } {
  const type = opts.type ?? 'comment';
  const body = opts.body.trim();
  // A comment's intent lives in its body, so it is required. A delete's intent is the wrapped span,
  // so its comment is optional (D27/D42); an empty body yields an empty thread.
  if (type === 'comment' && body === '') throw new NoteMutationError('comment body is empty', 400);
  if (type === 'delete' && opts.kind !== 'span') {
    throw new NoteMutationError('a delete suggestion must wrap a span', 400);
  }
  const { kind, start } = opts;
  if (!Number.isInteger(start) || start < 0 || start > source.length) {
    throw new NoteMutationError('selection start out of range', 400);
  }
  const end = opts.end;
  if (kind === 'span' && (!Number.isInteger(end) || end! <= start || end! > source.length)) {
    throw new NoteMutationError('selection end out of range', 400);
  }
  // All inputs validated; now do the work (mintId parses the whole document).
  const id = mintId(source);
  const before = stripMarkers(source.slice(0, start)).slice(-CONTEXT_WINDOW);
  const open = `<!-- mw:${id} -->`;

  let withMarkers: string;
  let anchor: Record<string, unknown>;
  if (kind === 'span') {
    const wrapped = source.slice(start, end!);
    // Refuse a selection that straddles an existing marker: wrapping it would interleave fences,
    // which lint does not catch for comment notes.
    if (stripMarkers(wrapped) !== wrapped) {
      throw new NoteMutationError('selection would wrap an existing note marker', 400);
    }
    const after = stripMarkers(source.slice(end!)).slice(0, CONTEXT_WINDOW);
    const close = `<!-- /mw:${id} -->`;
    withMarkers = source.slice(0, start) + open + wrapped + close + source.slice(end!);
    anchor = { kind: 'span', hash: shortHash(stripMarkers(wrapped)), before, after };
  } else {
    const after = stripMarkers(source.slice(start)).slice(0, CONTEXT_WINDOW);
    withMarkers = source.slice(0, start) + open + source.slice(start);
    anchor = { kind: 'point', before, after };
  }

  const record = {
    id,
    type,
    state: 'open',
    disp: 'none',
    anchor,
    thread: body === '' ? [] : [{ by: 'reviewer', at: opts.at, body }],
  };
  return { output: insertLogRecord(withMarkers, JSON.stringify(record)), id };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: PASS, including the existing `createNote` and `resolveNote`/`appendReply` tests (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/preview/mutate.ts test/preview/mutate.test.ts
git commit -m "$(cat <<'EOF'
feat(mutate): createNote can author a delete suggestion

Adds an optional type; a delete wraps a span, carries no text, and has
an optional comment (empty thread when none). Comment authoring is
byte-identical to before when type is omitted.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `discardNote` transform

**Files:**
- Modify: `src/preview/mutate.ts` (add `discardNote` after `resolveNote`, around line 116)
- Test: `test/preview/mutate.test.ts`

- [ ] **Step 1: Write the failing tests**

First, update the import on line 2 of `test/preview/mutate.test.ts` to include `discardNote`:

```typescript
import { appendReply, resolveNote, createNote, discardNote, NoteMutationError } from '../../src/preview/mutate.js';
```

Then append this block to `test/preview/mutate.test.ts`:

```typescript
describe('discardNote', () => {
  const SPAN = [
    '# Demo',
    '',
    'Ships by <!-- mw:s1 -->Q3<!-- /mw:s1 -->.',
    '',
    'Keep.<!-- mw:p2 -->',
    '',
    '<!-- mw:log v=1',
    '{"id":"s1","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"by ","after":"."},"thread":[]}',
    '{"id":"p2","type":"comment","state":"open","disp":"none","anchor":{"kind":"point","before":".","after":""},"thread":[{"by":"reviewer","at":"2026-06-01T10:00:00Z","body":"keep"}]}',
    '-->',
    '',
  ].join('\n');

  it('strips the note markers (restoring prose) and drops the record, with no archive', () => {
    const out = discardNote(SPAN, 's1');
    expect(out).toContain('Ships by Q3.');
    expect(out).not.toContain('mw:s1');
    expect(out).not.toContain('"id":"s1"');
    expect(out).not.toContain('mw:archive'); // discard erases; it does not archive
    expect(out).toContain('"id":"p2"'); // the untouched note survives
    expect(out).toContain('mw:p2');
  });

  it('drops the whole log block when discarding the only note', () => {
    const ONLY = [
      'A <!-- mw:n1 -->word<!-- /mw:n1 --> here.',
      '<!-- mw:log v=1',
      '{"id":"n1","type":"delete","state":"open","disp":"none","anchor":{"kind":"span","hash":"0","before":"A ","after":" here"},"thread":[]}',
      '-->',
      '',
    ].join('\n');
    const out = discardNote(ONLY, 'n1');
    expect(out).toContain('A word here.');
    expect(out).not.toContain('mw:log');
    expect(out).not.toContain('mw:n1');
  });

  it('round-trips clean: the discarded result lints clean and fixText changes nothing', async () => {
    const { fixText } = await import('../../src/fix.js');
    const { lintText } = await import('../../src/lint.js');
    const out = discardNote(SPAN, 's1');
    expect(fixText(out).changes).toEqual([]);
    expect(lintText(out).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('rejects an unknown note id with 404', () => {
    try {
      discardNote(SPAN, 'nope');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NoteMutationError);
      expect((e as NoteMutationError).status).toBe(404);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: FAIL with `discardNote is not a function` (or an import/type error), since `discardNote` does not exist yet.

- [ ] **Step 3: Implement `discardNote`**

Insert this function in `src/preview/mutate.ts` immediately after `resolveNote` ends (after line 116, before the `MARKER_RE` const on line 118). It is `resolveNote`'s marker-strip + record-drop, with no archive write.

```typescript
/**
 * Discard note `id`: strip its inline marker(s) from the prose (restoring any wrapped text to plain
 * prose) and remove its record from `mw:log`, dropping the whole log block if it was the only record.
 * Unlike resolveNote, it writes NO archive record - the note is erased as if it never existed (the
 * × "discard" / undo on a suggestion). Pure string transform.
 */
export function discardNote(source: string, id: string): string {
  const doc = parse(source);
  const log = doc.blocks.find((b) => b.name === 'log');
  if (!log) throw new NoteMutationError('document has no mw:log block', 404);

  const rec = log.records.find((r) => isObj(r.json) && r.json.id === id);
  if (!rec || !isObj(rec.json)) throw new NoteMutationError(`note not found: ${id}`, 404);

  // Phase 1: remove this note's inline markers from the prose, right-to-left so offsets stay valid.
  const mine = doc.markers.filter((m) => m.id === id).sort((a, b) => b.offset - a.offset);
  let stripped = source;
  for (const m of mine) stripped = stripped.slice(0, m.offset) + stripped.slice(m.end);

  // Phase 2: drop the record from mw:log. Re-parse the marker-stripped text so line numbers are
  // accurate. If it was the only record, drop the entire (now empty) log block.
  const doc2 = parse(stripped);
  const log2 = doc2.blocks.find((b) => b.name === 'log')!;
  const rec2 = log2.records.find((r) => isObj(r.json) && r.json.id === id)!;
  const lines = stripped.split('\n');
  const logEmpties = log2.records.length === 1;
  const dropFrom = logEmpties ? log2.openerLine : rec2.line;
  const dropTo = logEmpties ? log2.closeLine ?? log2.lastLine : rec2.line;

  const out: string[] = [];
  for (let n = 1; n <= lines.length; n++) {
    if (n >= dropFrom && n <= dropTo) continue;
    out.push(lines[n - 1]!);
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/mutate.test.ts`
Expected: PASS (all mutate tests, new and existing).

- [ ] **Step 5: Commit**

```bash
git add src/preview/mutate.ts test/preview/mutate.test.ts
git commit -m "$(cat <<'EOF'
feat(mutate): add discardNote (strip markers + drop record, no archive)

Erases a note as if it never existed - the basis for the × discard/undo
on a suggestion. Distinct from resolveNote, which archives.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Server — `type` on create + discard route

**Files:**
- Modify: `src/preview/server.ts:9` (import), `:86-99` (mutate-verb route), `:108-132` (`/api/note`)
- Test: `test/preview/server.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this block to `test/preview/server.test.ts` (after the `describe('mutation endpoints', ...)` block). It reuses the existing `start` / `post` helpers and `DOC` fixture.

```typescript
describe('suggest-delete endpoints', () => {
  it('creates a delete suggestion over a span and keeps the text in the file', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships');
    const res = await post(base, '/api/note', { type: 'delete', kind: 'span', start: wStart, end: wStart + 5 });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.createdId).toBe('n1');
    const note = payload.notes.find((n: { id: string }) => n.id === 'n1');
    expect(note.type).toBe('delete');
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).toContain('<!-- mw:n1 -->Ships<!-- /mw:n1 -->'); // text stays; it is a suggestion
    expect(onDisk).toContain('"type":"delete"');
  });

  it('rejects a point delete (400) and leaves the file byte-identical', async () => {
    const base = await start(DOC);
    const before = readFileSync(join(dir!, 'demo.md'), 'utf8');
    const res = await post(base, '/api/note', { type: 'delete', kind: 'point', start: 3 });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir!, 'demo.md'), 'utf8')).toBe(before);
  });

  it('rejects an unsupported type (400)', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note', { type: 'replace', kind: 'span', start: 3, end: 8, body: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST /api/note/:id/discard removes the note and restores the prose', async () => {
    const base = await start(DOC);
    const wStart = DOC.indexOf('Ships');
    await post(base, '/api/note', { type: 'delete', kind: 'span', start: wStart, end: wStart + 5 });
    const res = await post(base, '/api/note/n1/discard');
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.openCount).toBe(1); // back to just s1
    expect(payload.html).not.toContain('data-mw-id="n1"');
    const onDisk = readFileSync(join(dir!, 'demo.md'), 'utf8');
    expect(onDisk).not.toContain('mw:n1');
    expect(onDisk).not.toContain('mw:archive'); // discarded, not archived
    expect(onDisk).toContain('Ships'); // prose restored
  });

  it('404s a discard of an unknown note id', async () => {
    const base = await start(DOC);
    const res = await post(base, '/api/note/nope/discard');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/preview/server.test.ts`
Expected: FAIL — the create-delete test gets a 400 (server still rejects without a known type path / ignores `type`), and the discard route 404s as an unknown path.

- [ ] **Step 3a: Implement — import `discardNote`**

Change `src/preview/server.ts` line 9 to add `discardNote`:

```typescript
import { appendReply, resolveNote, createNote, discardNote, NoteMutationError } from './mutate.js';
```

- [ ] **Step 3b: Implement — add `discard` to the verb route**

In `src/preview/server.ts`, change the route regex on line 86 to include `discard`:

```typescript
      const mutateRoute = /^\/api\/note\/([^/]+)\/(reply|resolve|discard)$/.exec(url.pathname);
```

Then change the `if (verb === 'reply') { ... } else { ... }` branch (lines 93-99) to:

```typescript
          if (verb === 'reply') {
            const parsed = await readJsonBody(req);
            const body = isObj(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
            payload = persist(filePath, (src) => appendReply(src, id, body, now));
          } else if (verb === 'discard') {
            payload = persist(filePath, (src) => discardNote(src, id));
          } else {
            payload = persist(filePath, (src) => resolveNote(src, id, now));
          }
```

- [ ] **Step 3c: Implement — accept `type` on `/api/note`**

In the `POST /api/note` handler (lines 108-132), add `type` parsing after the `body` line (line 118) and pass it to `createNote`. The block becomes:

```typescript
      if (req.method === 'POST' && url.pathname === '/api/note') {
        try {
          const parsed = await readJsonBody(req);
          const rawKind = isObj(parsed) ? parsed.kind : undefined;
          if (rawKind !== 'point' && rawKind !== 'span') {
            throw new NoteMutationError('kind must be "point" or "span"', 400);
          }
          const kind: 'point' | 'span' = rawKind;
          const rawType = isObj(parsed) && typeof parsed.type === 'string' ? parsed.type : 'comment';
          if (rawType !== 'comment' && rawType !== 'delete') {
            throw new NoteMutationError('type must be "comment" or "delete"', 400);
          }
          const type: 'comment' | 'delete' = rawType;
          const start = isObj(parsed) && typeof parsed.start === 'number' ? parsed.start : NaN;
          const end = isObj(parsed) && typeof parsed.end === 'number' ? parsed.end : undefined;
          const body = isObj(parsed) && typeof parsed.body === 'string' ? parsed.body : '';
          const now = new Date().toISOString();
          let createdId = '';
          const payload = persist(filePath, (src) => {
            const r = createNote(src, { kind, start, end, body, at: now, type });
            createdId = r.id;
            return r.output;
          });
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ...payload, createdId }));
        } catch (err) {
          sendError(res, err);
        }
        return;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/preview/server.test.ts`
Expected: PASS (new + existing server tests; comment creation still works because `type` defaults to `'comment'`).

- [ ] **Step 5: Commit**

```bash
git add src/preview/server.ts test/preview/server.test.ts
git commit -m "$(cat <<'EOF'
feat(server): accept type on /api/note + add discard route

POST /api/note takes an optional type (comment|delete); new
POST /api/note/:id/discard erases a note via discardNote.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Client — Delete gesture, delete card, × discard

**Files:**
- Modify: `src/preview/assets/app.js` (snippet for delete, × control + confirm in `renderRail`, `createDelete`, Delete `keydown`)
- Modify: `src/preview/assets/app.css` (×, confirm styling)

Browser JS is verified manually + Playwright (the M3a precedent; jsdom selection support is too weak to unit-test the gesture). Steps 1-5 are edits; Step 6 is the verification gate; Step 7 commits.

- [ ] **Step 1: Delete-card excerpt — update `noteSnippet`**

In `src/preview/assets/app.js`, replace the `noteSnippet` function (lines 41-47) with this. For a delete it reads the struck text straight from the rendered doc span, so the card is meaningful even with an empty thread.

```javascript
  function noteSnippet(note) {
    if (note.type === 'insert' || note.type === 'replace') {
      return note.text ? '"' + note.text + '"' : '';
    }
    if (note.type === 'delete') {
      var el = docEl.querySelector(idSel(note.id));
      var txt = el ? el.textContent : '';
      return txt ? '"' + txt + '"' : '';
    }
    var last = note.thread[note.thread.length - 1];
    return last ? last.body : '';
  }
```

- [ ] **Step 2: Add the `createDelete` function**

In `src/preview/assets/app.js`, add this function just before `function openDraft(target) {` (line 428). It POSTs a delete suggestion (no body) and repaints via `load()`, activating the new note.

```javascript
  // Pressing Delete on a selection proposes deleting that span. No body (a comment is optional and
  // can be added later via the card's Reply). The text stays in the file; the agent removes it.
  function createDelete(target) {
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    fetch('/api/note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'delete', kind: 'span', start: target.start, end: target.end }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Delete failed'); });
        return r.json();
      })
      .then(function (data) {
        if (data && data.createdId) activeId = data.createdId;
        return load();
      })
      .catch(function (err) { showToast(err.message || 'Delete failed'); });
  }
```

- [ ] **Step 3: Add the discard (×) control + on-card confirm**

In `src/preview/assets/app.js`, inside `renderRail`, immediately after `card.appendChild(head);` (line 102), add the × control for delete notes:

```javascript
      if (note.type === 'delete') {
        const discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.className = 'mw-card-discard';
        discardBtn.title = 'Discard this suggestion';
        discardBtn.setAttribute('aria-label', 'Discard this suggestion');
        discardBtn.textContent = '×';
        discardBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          openDiscardConfirm(card, note.id, discardBtn);
        });
        head.appendChild(discardBtn);
      }
```

Then add the `openDiscardConfirm` helper. Put it just before `function renderRail(notes) {` (line 90):

```javascript
  // The × on a delete card: reveal an inline "Remove this suggestion?" confirm (never a browser
  // confirm() dialog). Remove -> discard the note (restores the prose); Cancel/Esc -> back out.
  function openDiscardConfirm(card, id, discardBtn) {
    if (card.querySelector('.mw-discard-confirm')) return;
    discardBtn.style.visibility = 'hidden';
    var confirm = document.createElement('div');
    confirm.className = 'mw-discard-confirm';
    var q = document.createElement('span');
    q.className = 'mw-discard-q';
    q.textContent = 'Remove this suggestion?';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mw-discard-cancel';
    cancel.textContent = 'Cancel';
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mw-discard-remove';
    remove.textContent = 'Remove';

    function close() {
      confirm.remove();
      discardBtn.style.visibility = '';
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }
    cancel.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    remove.addEventListener('click', function (e) {
      e.stopPropagation();
      remove.disabled = true;
      // send() POSTs then reloads; on success the discarded card is gone, on failure the rail repaints.
      send('/api/note/' + encodeURIComponent(id) + '/discard', null);
    });
    confirm.appendChild(q);
    confirm.appendChild(cancel);
    confirm.appendChild(remove);
    card.insertBefore(confirm, card.querySelector('.mw-thread'));
    document.addEventListener('keydown', onKey, true);
  }
```

- [ ] **Step 4: Wire the Delete / Backspace gesture**

In `src/preview/assets/app.js`, add this `keydown` handler just after the `mouseup` trigger block (after line 541, before the `dblclick` block):

```javascript
  // Pressing Delete or Backspace on a non-collapsed selection proposes deleting that span. Ignored
  // while focus is in a textarea/input (so editing a draft or reply with Backspace is never
  // hijacked). A collapsed caret + Delete is a no-op in this slice (it is the future insert gesture).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;
    var target = spanTargetFromSelection();
    if (!target) return; // collapsed or non-mappable selection: let the key behave normally
    e.preventDefault();
    clearPill();
    createDelete(target);
  });
```

- [ ] **Step 5: Add the CSS**

Append to `src/preview/assets/app.css`:

```css
/* Discard (×) on a delete suggestion card, and its inline confirm. */
.mw-card-discard {
  margin-left: auto;
  border: none;
  background: none;
  color: var(--mw-muted);
  font-size: 17px;
  line-height: 1;
  padding: 0 4px;
  border-radius: 6px;
  cursor: pointer;
}
.mw-card-discard:hover { color: var(--mw-ink); background: var(--mw-hover-tint); }
.mw-card-discard:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--mw-focus-ring); }

.mw-discard-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--mw-muted);
}
.mw-discard-q { margin-right: auto; }
.mw-discard-confirm button {
  border: 1px solid var(--mw-line);
  background: var(--mw-surface);
  color: var(--mw-ink);
  border-radius: 8px;
  padding: 4px 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.mw-discard-confirm button:hover { background: var(--mw-hover-tint); }
.mw-discard-confirm button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--mw-focus-ring); }
.mw-discard-remove { border-color: var(--mw-error); color: var(--mw-error); }
```

- [ ] **Step 6: Verify in the real preview (manual + Playwright)**

Build the assets and run the preview against a throwaway copy (never the shared `sample.md`):

```bash
npx tsc -p . && cp -r src/preview/assets dist/preview/ 2>/dev/null; cp playground.md /tmp/mw-delete-test.md
node dist/cli.js preview /tmp/mw-delete-test.md
```

(If the build copies assets differently, confirm `dist/preview/assets/app.js` and `app.css` reflect the edits before loading the page.) Then verify each, in **dark, light, and sepia** (pick the theme from the in-preview picker):

- Mouse-select a phrase, press **Delete** → the text shows struck-through and a `delete` card appears in the rail with the struck excerpt as its snippet. The file at `/tmp/mw-delete-test.md` still contains the text wrapped in `<!-- mw:.. -->` markers.
- Press **Backspace** on a selection → same result.
- Click the **×** on a delete card → "Remove this suggestion?" appears inline → **Remove** → the suggestion is gone and the prose is restored (no strikethrough; markers gone from the file). **Cancel** and **Esc** back out without discarding.
- Open a card, type in its **Reply** box, press **Backspace** → it edits the textarea and does NOT create a delete (focus guard).
- Double-click a gap (collapsed caret) and press **Delete** → nothing happens.
- The **Comment pill** still appears on a selection and still creates a comment.
- Confirm `node dist/cli.js lint /tmp/mw-delete-test.md` reports no errors after a create and after a discard.

Fix any issue found and re-verify before committing.

- [ ] **Step 7: Commit**

```bash
git add src/preview/assets/app.js src/preview/assets/app.css
git commit -m "$(cat <<'EOF'
feat(preview): suggest-delete on Delete key + card discard (undo)

Press Delete/Backspace on a mouse selection to propose a deletion
(struck-through inline, delete card with the excerpt). A x on the card
opens an inline confirm that discards the suggestion and restores the
prose. Focus guard keeps Backspace editing draft/reply text.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Decision-log reframing (D42 + create-note spec)

**Files:**
- Modify: `DECISIONS.md` (append after the last decision, D41)
- Modify: `docs/superpowers/specs/2026-06-04-previewer-create-note-design.md:28`

- [ ] **Step 1: Append D42 to `DECISIONS.md`**

Add this entry at the end of `DECISIONS.md` (after D41), preceded by a `* * *` separator to match the file's style:

```markdown
* * *
### D42 - Reviewers may author typed suggestions; suggesting is precise intent, not direct editing (2026-06-07)
Extends D5/D31. The previewer lets a reviewer originate `delete` (first slice) and later `insert`/`replace` suggestions, not only `comment`s. A suggestion is the reviewer stating intent precisely - it is not the reviewer editing the prose. The agent still applies the suggestion, repairs the seam, and may decline or ask for clarification (D31/D32/D11); the thread remains authoritative for intent (D18). Records are byte-identical to agent-authored ones; origin is carried by `thread[0].by` as before. Supersedes the create-note spec's "the reviewer never picks insert/delete/replace," which was a v0 authoring simplification.
```

- [ ] **Step 2: Update create-note spec line 28**

In `docs/superpowers/specs/2026-06-04-previewer-create-note-design.md`, replace line 28:

```markdown
- **Reviewer states intent; the agent revises prose** (D5 / D31). Every reviewer-created note is a plain `comment` anchored to the selection. The reviewer never picks `insert` / `delete` / `replace`; they write what they mean ("add a line about X here", "cut this", "reword to Y") and the agent interprets intent.
```

with:

```markdown
- **Reviewer states intent; the agent revises prose** (D5 / D31). At the time of this slice every reviewer-created note was a plain `comment`. Superseded by **D42**: a reviewer may now also *suggest* `delete` / `insert` / `replace` as a precise statement of intent. Either way the reviewer never edits the prose directly - the agent applies the suggestion, repairs the seam, and may decline (D31/D32).
```

- [ ] **Step 3: Commit**

```bash
git add DECISIONS.md docs/superpowers/specs/2026-06-04-previewer-create-note-design.md
git commit -m "$(cat <<'EOF'
docs(decisions): D42 - reviewers may author typed suggestions

Reframes the v0 "reviewer never picks a type" line: suggesting is
precise intent, not direct editing; the agent still does the prose work.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all green, including the pre-existing suite (no regressions). The new tests from Tasks 1-3 pass.

- [ ] **Step 2: Type-check / build**

Run: `npx tsc -p .`
Expected: no type errors (the widened `createNote` signature and the `discardNote` export type-check; the server's `type` union is sound).

- [ ] **Step 3: Final real-preview smoke (all three themes)**

Re-run the Task 4 Step 6 verification once more end-to-end on a fresh `/tmp` copy in dark, light, and sepia, confirming: create a delete (strikethrough + card + file intact), discard it (prose restored), comment still works, lint clean throughout. This is the success-criteria check from the spec.

---

## Self-Review (completed while writing)

**Spec coverage:** trigger (Task 4 Step 4) · immediate strikethrough + card (Tasks 1, 4) · comment-optional empty thread (Task 1) · text stays in file (Tasks 1, 3 tests) · × discard = undo (Task 4 Step 3) · inline confirm, no browser dialog (Task 4 Step 3) · focus guard (Task 4 Step 4) · collapsed-caret no-op (Task 4 Step 4) · pill coexistence (unchanged; checked in Task 4 Step 6) · `discardNote` ≠ resolve / no archive (Task 2) · server `type` + discard route (Task 3) · D42 + spec line 28 (Task 5) · all-themes verification (Tasks 4, 6).

**Placeholder scan:** none — every code step shows complete code; every run step gives the command and expected result.

**Type consistency:** `createNote` opts use `type?: 'comment' | 'delete'`; the server narrows `rawType` to the same union before calling; `discardNote(source, id)` signature matches its call in the route. Client posts `{type:'delete', kind:'span', start, end}` matching the server's read. `noteSnippet`, `createDelete`, `openDiscardConfirm` names are used consistently across Task 4 steps.
