// Markwise previewer - browser app. No build step, no framework: it fetches the
// server-rendered document payload, drops the HTML into the reading column, builds the notes rail,
// and wires the clean<->revealed toggle plus one-at-a-time, bidirectional note activation.
// Mutations (reply / resolve) POST to the server and repaint via a single load() path.

(function () {
  'use strict';

  const body = document.body;
  const docEl = document.querySelector('.mw-doc');
  const railEl = document.querySelector('.mw-rail');
  const titleEl = document.querySelector('.mw-doctitle');
  const counterBtn = document.querySelector('.mw-counter');
  const countEl = document.querySelector('.mw-count');
  const handoffBtn = document.querySelector('.mw-handoff');
  const themeBtn = document.querySelector('.mw-theme');

  let activeId = null;
  let pendingTarget = null; // { kind:'span'|'point', start, end? } awaiting a draft
  let replaceCompose = null; // { target:{start,end}, fieldEl, wrapEl } while typing a replacement in place
  let insertCompose = null; // { fieldEl, target } while typing an insertion in place
  let pillEl = null;
  let handoff = null; // latest /api/doc handoff bundle { path, waitingCount, text }
  let docVersion = null; // fingerprint of the file content this page rendered; echoed on every POST
  let anchorEls = []; // highlight rectangles over the text a draft is anchored to
  let caretEl = null; // the synthetic caret overlay (created lazily, lives inside .mw-doc)
  let caretRaf = 0; // pending selectionchange -> updateCaret animation frame (0 = none)

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- Synthetic caret (Op2) ------------------------------------------------------------------
  // An overlay bar that shows where the collapsed selection sits in the prose. It never enters
  // the text flow (position:absolute in .mw-doc, pointer-events:none), so the document cannot
  // move (Principle 1). load() wipes .mw-doc's children; ensureCaretEl re-appends on demand.
  function ensureCaretEl() {
    if (!caretEl || !caretEl.isConnected) {
      caretEl = document.createElement('span');
      caretEl.className = 'mw-caret';
      caretEl.setAttribute('aria-hidden', 'true');
      docEl.appendChild(caretEl);
    }
    return caretEl;
  }

  function hideCaret() {
    if (caretEl) caretEl.classList.remove('mw-caret-on');
  }

  // Position the caret at the collapsed selection point, or hide it (non-collapsed selection,
  // selection outside the doc, compose open). Rects are viewport-space, translated into .mw-doc's
  // box, so page scroll needs no listener. A collapsed range can report a zero rect at soft
  // line-wraps and text-node boundaries; probe one character around the caret for an edge instead
  // - the caret must never simply vanish while the selection is inside the doc (spec section 4).
  function updateCaret() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || replaceCompose || insertCompose) {
      hideCaret();
      return;
    }
    var node = sel.focusNode;
    if (!node || !docEl.contains(node) || (caretEl && node === caretEl)) {
      hideCaret();
      return;
    }
    var range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    var r = range.getBoundingClientRect();
    var rect = { left: r.left, top: r.top, height: r.height };
    if (r.width === 0 && r.height === 0 && node.nodeType === 3) {
      var probe = document.createRange();
      var off = Math.min(sel.focusOffset, node.length);
      if (off < node.length) {
        probe.setStart(node, off);
        probe.setEnd(node, off + 1);
        var pr = probe.getBoundingClientRect();
        rect = { left: pr.left, top: pr.top, height: pr.height };
      } else if (off > 0) {
        probe.setStart(node, off - 1);
        probe.setEnd(node, off);
        var pl = probe.getBoundingClientRect();
        rect = { left: pl.right, top: pl.top, height: pl.height };
      }
    }
    if (!rect.height) {
      hideCaret();
      return;
    }
    var host = docEl.getBoundingClientRect();
    var c = ensureCaretEl();
    c.style.left = (rect.left - host.left) + 'px';
    c.style.top = (rect.top - host.top) + 'px';
    c.style.height = rect.height + 'px';
    c.classList.add('mw-caret-on');
  }

  // One pending frame max: selectionchange fires in bursts (mouse drags, Selection.modify calls)
  // and resize fires continuously during a window drag. This single re-sync point also covers
  // clicks placing a caret, selections collapsing, Esc clearing the selection, and load() wiping
  // the column.
  function scheduleCaret() {
    if (caretRaf) return;
    caretRaf = window.requestAnimationFrame(function () {
      caretRaf = 0;
      updateCaret();
    });
  }
  document.addEventListener('selectionchange', scheduleCaret);
  window.addEventListener('resize', scheduleCaret);

  function idSel(id) {
    const safe = window.CSS && CSS.escape ? CSS.escape(id) : id;
    return '[data-mw-id="' + safe + '"]';
  }

  function fmtTime(at) {
    // Show the stored timestamp verbatim if it does not parse; otherwise a short local form.
    const d = new Date(at);
    return isNaN(d.getTime()) ? at : d.toLocaleString();
  }

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

  function showToast(msg) {
    let t = document.querySelector('.mw-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'mw-toast';
      body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    window.setTimeout(function () { t.classList.remove('show'); }, 3000);
  }

  // Resolves true if the text reached the clipboard, false otherwise. writeText is initiated
  // synchronously from the click handler (the text is already in hand), so the user-gesture
  // context is preserved across browsers.
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return false; }
      );
    }
    return Promise.resolve(false);
  }

  // Every mutation goes through here: it carries the x-mw-version precondition (the server 409s
  // if the file changed since this page rendered, so a stale tab can never mis-anchor a note) and
  // surfaces failures as an Error with a `.status` for the catch handlers to inspect.
  function apiPost(url, bodyObj) {
    var headers = { 'x-mw-version': docVersion || '' };
    if (bodyObj) headers['content-type'] = 'application/json';
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (e) {
          var err = new Error(e.error || 'Request failed');
          err.status = r.status;
          throw err;
        });
      }
      return r.json();
    });
  }

  // Toast an API failure. Returns true for a stale-version rejection (409, or 428 missing header)
  // so the caller knows to repaint from the server - the page was acting on text that moved.
  function apiErrorToast(err, fallbackMsg) {
    var stale = !!(err && (err.status === 409 || err.status === 428));
    showToast(
      stale
        ? 'Document changed - view refreshed. Please redo that action.'
        : (err && err.message) || fallbackMsg
    );
    return stale;
  }

  function send(url, bodyObj) {
    return apiPost(url, bodyObj)
      .then(function () { return load(); })
      .catch(function (err) {
        if (apiErrorToast(err, 'Action failed')) return load();
      });
  }

  // The x on a card opens a card-scoped confirm: a slight scrim over the card's own content
  // with the prompt centered on top (no reflow of the doc or other cards; never a browser confirm()
  // dialog). Remove -> discard the note (restores the prose); Cancel/Esc -> back out. `noun` is
  // "comment" or "suggestion" so the copy names what is being erased.
  function openDiscardConfirm(card, id, noun) {
    if (card.querySelector('.mw-discard-overlay')) return;
    var overlay = document.createElement('div');
    overlay.className = 'mw-discard-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-label', 'Remove this ' + noun + '?');
    var q = document.createElement('p');
    q.className = 'mw-discard-q';
    q.textContent = 'Remove this ' + noun + '?';
    var actions = document.createElement('div');
    actions.className = 'mw-discard-actions';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mw-discard-cancel';
    cancel.textContent = 'Cancel';
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mw-discard-remove';
    remove.textContent = 'Remove';

    function close() {
      overlay.remove();
      card.classList.remove('mw-confirming');
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }
    // Clicks on the scrim stay contained (don't bubble to the card's activate handler).
    overlay.addEventListener('click', function (e) { e.stopPropagation(); });
    cancel.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    remove.addEventListener('click', function (e) {
      e.stopPropagation();
      // Dismiss the overlay (and deregister the Escape listener) before send() -> load() repaints the
      // rail and discards this DOM, which would otherwise leak the capture-phase keydown listener.
      close();
      send('/api/note/' + encodeURIComponent(id) + '/discard', null);
    });
    actions.appendChild(cancel);
    actions.appendChild(remove);
    overlay.appendChild(q);
    overlay.appendChild(actions);
    card.classList.add('mw-confirming');
    card.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    cancel.focus(); // focus the safe (non-destructive) action; Esc also cancels
  }

  function renderRail(notes) {
    railEl.innerHTML = '';
    notes.forEach(function (note) {
      const card = document.createElement('section');
      card.className = 'mw-card mw-type-' + note.type;
      card.dataset.mwId = note.id;

      const head = document.createElement('header');
      head.className = 'mw-card-head';
      head.innerHTML =
        '<span class="mw-card-type">' + esc(note.type) + '</span>' +
        '<span class="mw-card-snippet">' + esc(noteSnippet(note)) + '</span>';
      card.appendChild(head);

      const noun = note.type === 'comment' ? 'comment' : 'suggestion';
      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'mw-card-discard';
      discardBtn.title = 'Discard this ' + noun;
      discardBtn.setAttribute('aria-label', 'Discard this ' + noun);
      discardBtn.textContent = '×';
      discardBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openDiscardConfirm(card, note.id, noun);
      });
      head.appendChild(discardBtn);

      const threadEl = document.createElement('div');
      threadEl.className = 'mw-thread';
      note.thread.forEach(function (m) {
        const msg = document.createElement('div');
        msg.className = 'mw-msg mw-by-' + m.by;
        msg.innerHTML =
          '<div class="mw-msg-meta"><span class="mw-msg-by">' + esc(m.by) + '</span>' +
          '<span class="mw-msg-at">' + esc(fmtTime(m.at)) + '</span></div>' +
          '<div class="mw-msg-body">' + esc(m.body) + '</div>';
        threadEl.appendChild(msg);
      });
      card.appendChild(threadEl);

      const actions = document.createElement('div');
      actions.className = 'mw-card-actions';

      const ta = document.createElement('textarea');
      ta.className = 'mw-reply';
      ta.placeholder = 'Reply...';
      ta.addEventListener('click', function (e) { e.stopPropagation(); });

      const verbs = document.createElement('div');
      verbs.className = 'mw-verbs';

      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'mw-reply-btn';
      replyBtn.textContent = 'Reply';
      replyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const text = ta.value.trim();
        if (!text) return;
        replyBtn.disabled = true;
        send('/api/note/' + encodeURIComponent(note.id) + '/reply', { body: text })
          .finally(function () { replyBtn.disabled = false; });
      });

      const resolveBtn = document.createElement('button');
      resolveBtn.type = 'button';
      resolveBtn.className = 'mw-resolve-btn';
      resolveBtn.textContent = 'Resolve';
      resolveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        resolveBtn.disabled = true;
        // Resolve reward: let the card play a quiet slide-out before the repaint removes it. On a
        // failed resolve, load() rebuilds the rail so the (now classless) card simply returns.
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.classList.add('mw-resolving');
        window.setTimeout(function () {
          send('/api/note/' + encodeURIComponent(note.id) + '/resolve', null)
            .finally(function () { resolveBtn.disabled = false; });
        }, reduce ? 0 : 200);
      });

      verbs.appendChild(replyBtn);
      verbs.appendChild(resolveBtn);
      actions.appendChild(ta);
      actions.appendChild(verbs);
      card.appendChild(actions);

      card.addEventListener('click', function () {
        activate(note.id);
      });
      railEl.appendChild(card);
    });
    if (!notes.length) {
      const empty = document.createElement('p');
      empty.className = 'mw-rail-empty';
      empty.textContent = 'Select text to comment, press Delete to suggest a deletion, or click and type to suggest an insertion.';
      railEl.appendChild(empty);
    }
  }

  function activate(id) {
    activeId = id;
    if (id != null && body.classList.contains('mw-clean')) reveal(true);
    document.querySelectorAll('.active').forEach(function (el) {
      el.classList.remove('active');
    });
    if (id == null) return;
    document.querySelectorAll(idSel(id)).forEach(function (el) {
      el.classList.add('active');
    });
    const activeCard = railEl.querySelector('.mw-card' + idSel(id));
    if (activeCard) activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function reveal(on) {
    body.classList.toggle('mw-clean', !on);
    body.classList.toggle('mw-revealed', on);
    counterBtn.setAttribute('aria-pressed', String(on));
    if (!on) { activate(null); clearAnchor(); }
  }

  function clearPill() {
    if (pillEl) { pillEl.remove(); pillEl = null; }
  }

  // Remove the highlight rectangles drawn over the text a draft is anchored to.
  function clearAnchor() {
    anchorEls.forEach(function (el) { el.remove(); });
    anchorEls = [];
  }

  // Light the text a draft is anchored to, so the composer is visibly tied to its source. Uses the
  // selection's per-line client rects (falling back to the captured bounding rect), positioned in
  // page coordinates so the highlight scrolls with the document while the reviewer types.
  function drawAnchor(range, fallbackRect) {
    clearAnchor();
    var rects = [];
    if (range) {
      var list = range.getClientRects();
      for (var i = 0; i < list.length; i++) rects.push(list[i]);
    }
    if (!rects.length && fallbackRect && fallbackRect.width > 0) rects.push(fallbackRect);
    rects.forEach(function (r) {
      if (r.width < 1 || r.height < 1) return;
      var hl = document.createElement('div');
      hl.className = 'mw-anchor';
      hl.style.left = r.left + window.scrollX + 'px';
      hl.style.top = r.top + window.scrollY + 'px';
      hl.style.width = r.width + 'px';
      hl.style.height = r.height + 'px';
      body.appendChild(hl);
      anchorEls.push(hl);
    });
  }

  // Map a DOM (textNode, offset) to an absolute source offset via the enclosing breadcrumb run.
  // NOTE: the DOM char offset equals the source offset only for plain text; a run containing an
  // HTML entity (&amp; etc.) would skew a point-click offset. Rare in prose; a thin-slice known gap.
  function srcOffset(container, offset) {
    var el = container && container.nodeType === 3 ? container.parentElement : container;
    var run = el && el.closest ? el.closest('.mw-run') : null;
    if (!run) return null;
    return parseInt(run.getAttribute('data-s'), 10) + offset;
  }

  // A collapsed Range at a viewport point, across Chrome/Safari (caretRangeFromPoint) and
  // Firefox (caretPositionFromPoint).
  function caretRangeAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var cp = document.caretPositionFromPoint(x, y);
      if (!cp) return null;
      var r = document.createRange();
      r.setStart(cp.offsetNode, cp.offset);
      return r;
    }
    return null;
  }

  // The breadcrumb runs a selection overlaps, in document order. Uses precise boundary-point
  // comparison rather than Selection.containsNode, which over-reports a block-spanning selection
  // as touching the next block's run. A run is excluded only if the selection ends at/before the
  // run's start or begins at/after the run's end; everything else overlaps.
  function overlappingRuns(range) {
    return Array.prototype.filter.call(document.querySelectorAll('.mw-run'), function (run) {
      var rr = document.createRange();
      rr.selectNodeContents(run);
      var after = range.compareBoundaryPoints(Range.START_TO_END, rr) <= 0; // selection ends at/before run start
      var before = range.compareBoundaryPoints(Range.END_TO_START, rr) >= 0; // selection starts at/after run end
      return !after && !before;
    });
  }

  // Resolve one selection endpoint to a source offset within the given run. If the endpoint sits
  // inside the run, honor its exact character offset; otherwise the endpoint is a block boundary
  // outside any run (e.g. a triple-click whose end lands on the <p> element), so clamp to the run's
  // near edge: data-s for the start endpoint, data-e for the end endpoint.
  function runEndpointOffset(run, container, offset, edge) {
    var host = container.nodeType === 3 ? container.parentElement : container;
    var inRun = host && host.closest && host.closest('.mw-run') === run;
    if (inRun) return parseInt(run.getAttribute('data-s'), 10) + offset;
    return parseInt(run.getAttribute(edge === 'start' ? 'data-s' : 'data-e'), 10);
  }

  // Read the current selection into a span creation target, or null if it is collapsed or overlaps
  // no breadcrumb run. Drives the mouseup trigger (double-click, triple-click, or drag). Deriving
  // the span from the overlapped runs - not the raw endpoints - is what makes triple-click and
  // block-spanning drags work: their end boundary lands on a block element, not inside a run.
  function spanTargetFromSelection() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    var runs = overlappingRuns(range);
    if (!runs.length) return null;
    var first = runs[0];
    var last = runs[runs.length - 1];
    var s = runEndpointOffset(first, range.startContainer, range.startOffset, 'start');
    var en = runEndpointOffset(last, range.endContainer, range.endOffset, 'end');
    if (s != null && en != null && en > s) {
      return { kind: 'span', start: s, end: en, rect: range.getBoundingClientRect() };
    }
    return null;
  }

  // Read a collapsed caret into a point insert target, or null if there is no caret or it does not
  // map to a breadcrumb run. The collapsed-selection counterpart of spanTargetFromSelection; drives
  // the click+type insert gesture. A click in read-only-but-selectable prose leaves a collapsed
  // caret in the clicked text node, which no handler clears, so it survives to the keydown.
  function pointTargetFromCaret() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    var off = srcOffset(range.startContainer, range.startOffset);
    if (off == null) return null;
    return { kind: 'point', start: off };
  }

  function showPill(target) {
    clearPill();
    pendingTarget = target;
    pillEl = document.createElement('button');
    pillEl.type = 'button';
    pillEl.className = 'mw-pill';
    pillEl.textContent = '💬 Comment';
    var rect = target.rect;
    // .mw-pill is position:fixed, so viewport-relative getBoundingClientRect coords map directly.
    pillEl.style.left = rect.left + rect.width / 2 + 'px';
    pillEl.style.top = rect.top - 8 + 'px';
    pillEl.addEventListener('click', function (e) {
      e.stopPropagation();
      openDraft(pendingTarget);
    });
    body.appendChild(pillEl);
  }

  function wireProseActivation() {
    docEl.addEventListener('click', function (e) {
      const target = e.target.closest('[data-mw-id]');
      if (target) {
        activate(target.dataset.mwId);
        e.stopPropagation();
      } else {
        activate(null);
      }
    });
  }

  counterBtn.addEventListener('click', function () {
    reveal(body.classList.contains('mw-clean'));
  });

  if (handoffBtn) {
    handoffBtn.addEventListener('click', function () {
      if (!handoff || !handoff.text) return;
      copyToClipboard(handoff.text).then(function (ok) {
        showToast(
          ok
            ? 'Copied - paste into your agent to start the revision pass'
            : "Couldn't copy - check clipboard permissions"
        );
      });
    });
  }

  // Appearance: the toggle opens a small named picker (Dark / Light / Sepia). A direct pick beats
  // cycling once there are three themes. The OS-preference fallback applies only while the user has
  // made no explicit choice. Adding a theme later = one THEMES entry + its token block in app.css.
  const THEMES = [
    { id: 'dark', label: 'Dark', swatch: '#16171a' },
    { id: 'light', label: 'Light', swatch: '#ffffff' },
    { id: 'sepia', label: 'Sepia', swatch: '#e7d7b2' },
  ];
  let themeMenu = null;

  function setTheme(name, persist) {
    document.documentElement.setAttribute('data-theme', name);
    if (persist) { try { localStorage.setItem('mw-theme', name); } catch (e) {} }
    if (themeBtn) themeBtn.title = 'Theme: ' + name;
    if (themeMenu) {
      Array.prototype.forEach.call(themeMenu.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-checked', String(b.dataset.themeId === name));
      });
    }
  }
  function closeThemeMenu() {
    if (!themeMenu || themeMenu.hidden) return;
    themeMenu.hidden = true;
    themeBtn.setAttribute('aria-expanded', 'false');
  }
  function openThemeMenu() {
    themeMenu.hidden = false; // unhide first so offsetWidth is measurable for clamping
    var r = themeBtn.getBoundingClientRect();
    themeMenu.style.top = r.bottom + 6 + 'px';
    var left = Math.min(r.left, window.innerWidth - themeMenu.offsetWidth - 8);
    themeMenu.style.left = Math.max(8, left) + 'px';
    themeBtn.setAttribute('aria-expanded', 'true');
  }

  if (themeBtn) {
    themeMenu = document.createElement('div');
    themeMenu.className = 'mw-theme-menu';
    themeMenu.setAttribute('role', 'menu');
    themeMenu.hidden = true;
    THEMES.forEach(function (t) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.dataset.themeId = t.id;
      item.innerHTML =
        '<span class="mw-theme-sw" style="background:' + t.swatch + '"></span>' +
        '<span>' + esc(t.label) + '</span>' +
        '<span class="mw-theme-tick" aria-hidden="true">✓</span>';
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        setTheme(t.id, true);
        closeThemeMenu();
        themeBtn.focus();
      });
      themeMenu.appendChild(item);
    });
    body.appendChild(themeMenu);

    setTheme(document.documentElement.getAttribute('data-theme') || 'dark', false);

    themeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (themeMenu.hidden) openThemeMenu(); else closeThemeMenu();
    });
    document.addEventListener('mousedown', function (e) {
      if (!themeMenu.hidden && e.target !== themeBtn && !themeMenu.contains(e.target)) closeThemeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !themeMenu.hidden) { closeThemeMenu(); themeBtn.focus(); }
    });
  }
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
        try { if (localStorage.getItem('mw-theme')) return; } catch (_) {}
        setTheme(e.matches ? 'light' : 'dark', false);
      });
    } catch (_) {}
  }

  // Pressing Delete on a selection proposes deleting that span. No body (a comment is optional and
  // can be added later via the card's Reply). The text stays in the file; the agent removes it.
  function createDelete(target) {
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    apiPost('/api/note', { type: 'delete', kind: 'span', start: target.start, end: target.end })
      .then(function (data) {
        if (data && data.createdId) activeId = data.createdId;
        return load();
      })
      .catch(function (err) {
        if (apiErrorToast(err, 'Delete failed')) return load();
      });
  }

  // Wrap the current selection's range in a strikethrough "replace target" span. Returns the wrapper
  // (or null if it cannot be wrapped). surroundContents handles the clean single-node case; the
  // extractContents fallback handles a selection crossing .mw-run / element boundaries and is marked
  // so cancel can repaint (the fallback can disturb the breadcrumb runs in that region). The wrap is
  // transient: load() repaints from the server on commit, so it never persists.
  function wrapReplaceTarget(range) {
    var wrap = document.createElement('span');
    wrap.className = 'mw-replace-target';
    try {
      range.surroundContents(wrap);
    } catch (e) {
      try {
        wrap.appendChild(range.extractContents());
        range.insertNode(wrap);
        wrap.dataset.mwFallback = '1';
      } catch (e2) {
        return null;
      }
    }
    return wrap;
  }

  // Select text and start typing to propose a replacement (Google-Docs Suggesting mode): the
  // selection renders struck-through and an inline editable field opens right after it, seeded with
  // the typed character. The original stays on screen so the reading column keeps reflecting the file.
  function startReplace(target, seed) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (body.classList.contains('mw-clean')) reveal(true);
    clearPill();
    var wrap = wrapReplaceTarget(range);
    if (!wrap) return; // could not wrap: let the key no-op
    sel.removeAllRanges();

    var field = document.createElement('span');
    field.className = 'mw-replace-field';
    field.setAttribute('contenteditable', 'true');
    field.textContent = seed;
    wrap.parentNode.insertBefore(field, wrap.nextSibling);
    replaceCompose = { target: target, fieldEl: field, wrapEl: wrap };

    field.focus();
    var r = document.createRange();
    r.selectNodeContents(field);
    r.collapse(false); // caret to the end of the seed character
    sel.removeAllRanges();
    sel.addRange(r);

    field.addEventListener('keydown', onReplaceFieldKey);
  }

  function onReplaceFieldKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitReplace(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelReplace(); }
  }

  // Commit the in-place replacement: POST a replace note carrying the typed text, then load()
  // repaints (original -> mw-type-replace style, replacement in the rail card) and wipes the
  // transient compose DOM. An empty/whitespace field is a cancel (an empty replacement is a delete).
  function commitReplace() {
    if (!replaceCompose) return;
    var c = replaceCompose;
    var text = c.fieldEl.textContent;
    if (!text || text.trim() === '') { cancelReplace(); return; }
    replaceCompose = null; // prevent re-entry; load()/catch handles the transient DOM
    createReplace(c.target, text);
  }

  function createReplace(target, text) {
    apiPost('/api/note', { type: 'replace', kind: 'span', start: target.start, end: target.end, text: text })
      .then(function (data) {
        if (data && data.createdId) activeId = data.createdId;
        return load();
      })
      .catch(function (err) { apiErrorToast(err, 'Replace failed'); return load(); });
  }

  // Cancel the in-place compose: remove the field, unwrap the struck target (restoring the original
  // text), clear the selection. If the wrap used the extractContents fallback, repaint from the
  // server to guarantee the breadcrumb runs in that region are pristine.
  function cancelReplace() {
    if (!replaceCompose) return;
    var c = replaceCompose;
    replaceCompose = null;
    c.fieldEl.removeEventListener('keydown', onReplaceFieldKey);
    if (c.fieldEl.parentNode) c.fieldEl.parentNode.removeChild(c.fieldEl);
    var wrap = c.wrapEl;
    var usedFallback = wrap && wrap.dataset && wrap.dataset.mwFallback === '1';
    if (wrap && wrap.parentNode) {
      while (wrap.firstChild) wrap.parentNode.insertBefore(wrap.firstChild, wrap);
      wrap.parentNode.removeChild(wrap);
    }
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    if (usedFallback) load();
  }

  // Click a point and type to propose an insertion (Google-Docs Suggesting mode): an inline editable
  // field opens at the caret, seeded with the typed character. Unlike replace there is no original to
  // strike; committing stores the text as an insert note at that point. The field is transient -
  // load() repaints from the server on commit/cancel, so it never persists.
  function startInsert(target, seed) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0).cloneRange();
    if (body.classList.contains('mw-clean')) reveal(true);
    clearPill();

    var field = document.createElement('span');
    field.className = 'mw-insert-field';
    field.setAttribute('contenteditable', 'true');
    field.textContent = seed;
    // Insert at the caret. Inside a text node this splits the node and places the field between the
    // halves, so it appears exactly at the insertion point inside the surrounding breadcrumb run.
    range.insertNode(field);
    insertCompose = { fieldEl: field, target: target };

    field.focus();
    var r = document.createRange();
    r.selectNodeContents(field);
    r.collapse(false); // caret to the end of the seed character
    sel.removeAllRanges();
    sel.addRange(r);

    field.addEventListener('keydown', onInsertFieldKey);
  }

  function onInsertFieldKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitInsert(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelInsert(); }
  }

  // Commit the in-place insertion: POST an insert note carrying the typed text, then load() repaints
  // (the text renders inline at the point, a card appears) and wipes the transient field. An
  // empty/whitespace field is a cancel.
  function commitInsert() {
    if (!insertCompose) return;
    var c = insertCompose;
    var text = c.fieldEl.textContent;
    if (!text || text.trim() === '') { cancelInsert(); return; }
    insertCompose = null; // prevent re-entry; load()/catch handles the transient DOM
    createInsert(c.target, text);
  }

  function createInsert(target, text) {
    apiPost('/api/note', { type: 'insert', kind: 'point', start: target.start, text: text })
      .then(function (data) {
        if (data && data.createdId) activeId = data.createdId;
        return load();
      })
      .catch(function (err) { apiErrorToast(err, 'Insert failed'); return load(); });
  }

  // Cancel the in-place insertion: remove the field and repaint from the server, which restores the
  // breadcrumb run that range.insertNode split when the field was placed.
  function cancelInsert() {
    if (!insertCompose) return;
    var c = insertCompose;
    insertCompose = null;
    c.fieldEl.removeEventListener('keydown', onInsertFieldKey);
    if (c.fieldEl.parentNode) c.fieldEl.parentNode.removeChild(c.fieldEl);
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    load(); // the field split a text node; repaint to restore pristine breadcrumbs
  }

  function openDraft(target) {
    // Capture the live selection range before clearing the pill or focusing the textarea, so the
    // anchor highlight can use precise per-line rects.
    var sel = window.getSelection();
    var liveRange = sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
    clearPill();
    if (body.classList.contains('mw-clean')) reveal(true);
    // Remove any existing draft first (one draft at a time), and the quiet empty-rail hint.
    var existing = railEl.querySelector('.mw-draft');
    if (existing) existing.remove();
    var emptyHint = railEl.querySelector('.mw-rail-empty');
    if (emptyHint) emptyHint.remove();

    // Light the source text (spans only; a point has no extent to highlight).
    if (target.kind === 'span') drawAnchor(liveRange, target.rect);

    var card = document.createElement('section');
    card.className = 'mw-draft';
    // Align the draft to the selection's vertical position (Google-Docs-style) when the rail is
    // otherwise empty; with existing notes present, keep it at the top to avoid overlap.
    if (target.rect && !railEl.querySelector('.mw-card')) {
      var offset = Math.max(0, Math.round(target.rect.top - railEl.getBoundingClientRect().top));
      card.style.marginTop = offset + 'px';
    }
    var ta = document.createElement('textarea');
    ta.placeholder = 'Write a comment…';
    var actions = document.createElement('div');
    actions.className = 'mw-draft-actions';
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mw-draft-cancel';
    cancel.textContent = 'Cancel';
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'mw-draft-add';
    add.textContent = 'Add';

    cancel.addEventListener('click', function () {
      card.remove();
      clearAnchor();
      var s = window.getSelection();
      if (s) s.removeAllRanges();
    });
    add.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) return;
      add.disabled = true;
      var payload = { kind: target.kind, start: target.start, body: text };
      if (target.kind === 'span') payload.end = target.end;
      apiPost('/api/note', payload)
        .then(function (data) {
          if (data && data.createdId) activeId = data.createdId; // activate the new note after repaint
          clearAnchor();
          return load();
        })
        .catch(function (err) {
          // Stale tab: the draft's offsets point into text that moved, so the draft cannot be
          // retried - repaint and let the reviewer re-select. Other errors keep the draft editable.
          if (apiErrorToast(err, 'Create failed')) {
            clearAnchor();
            return load();
          }
          add.disabled = false;
        });
    });

    actions.appendChild(cancel);
    actions.appendChild(add);
    card.appendChild(ta);
    card.appendChild(actions);
    railEl.insertBefore(card, railEl.firstChild);
    ta.focus();
  }

  function applyPayload(payload) {
    docVersion = payload.version || null;
    titleEl.textContent = payload.title || '';
    document.title = (payload.title ? payload.title + ' - ' : '') + 'Markwise Preview';
    docEl.innerHTML = payload.html || '';
    countEl.textContent = String(payload.openCount || 0);
    renderRail(payload.notes || []);
    handoff = payload.handoff || null;
    if (handoffBtn) {
      var waiting = !!(handoff && handoff.waitingCount > 0);
      handoffBtn.disabled = !waiting;
      handoffBtn.title = waiting ? '' : 'No notes waiting on the agent';
    }
    // Re-apply the active note if it survived the repaint; otherwise clear it.
    if (activeId != null && railEl.querySelector('.mw-card' + idSel(activeId))) {
      activate(activeId);
    } else {
      activeId = null;
    }
  }

  function load() {
    return fetch('/api/doc')
      .then(function (r) { return r.json(); })
      .then(applyPayload)
      .catch(function (err) {
        docEl.innerHTML = '<p class="mw-error">Could not load the document.</p>';
        console.error('[markwise] failed to load /api/doc', err);
      });
  }

  // True while transient UI (a pill, an open draft, an in-place compose, a discard confirm) would
  // be destroyed by a repaint - the focus revalidation must never eat work in progress.
  function hasTransientUi() {
    return !!(
      pillEl ||
      replaceCompose ||
      insertCompose ||
      railEl.querySelector('.mw-draft') ||
      document.querySelector('.mw-confirming')
    );
  }

  // Returning to the tab is the natural moment the file may have changed underneath the page (an
  // agent pass, an editor save). Revalidate quietly: repaint only when the version actually moved
  // and nothing transient is open; a stale POST would be refused (409) anyway - this just makes the
  // common case seamless.
  window.addEventListener('focus', function () {
    if (hasTransientUi()) return;
    fetch('/api/doc')
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        if (payload && payload.version && payload.version !== docVersion) applyPayload(payload);
      })
      .catch(function () { /* offline blip: keep the current view */ });
  });

  // A completed selection (double-click a word, triple-click a line, or drag a phrase) shows the
  // pill on mouse release. All three end with a mouseup while a non-collapsed selection exists.
  // Listen on the whole document (per the design spec), not just .mw-doc, so a drag that releases
  // over the rail, a scrollbar, or the margins still surfaces the pill. spanTargetFromSelection()
  // returns null when the selection's endpoints do not map to .mw-run source offsets, so a
  // selection outside the document content is a graceful no-op.
  document.addEventListener('mouseup', function (e) {
    // A release on the pill itself must not redraw it - let the pill's own click open the draft.
    if (pillEl && e.target === pillEl) return;
    var target = spanTargetFromSelection();
    if (target) showPill(target);
  });

  // ---- Keyboard ladder (Op2) ------------------------------------------------------------------
  // Arrow-key navigation over Selection.modify (spike-verified in this read-only doc). Plain
  // arrows move the caret; Shift extends the selection; Alt = word, Cmd+Left/Right = line
  // boundary (the macOS ladder). Only active once a click (or prior arrow) has the selection in
  // the prose - otherwise the keys are not intercepted and the page scrolls exactly as before.
  // The existing gesture handlers read the resulting selection unchanged: Shift+Arrow + Delete =
  // suggest-delete, Shift+Arrow + type = suggest-replace, moved caret + type = suggest-insert.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (replaceCompose || insertCompose) return; // the compose field owns its keys
    if (document.querySelector('.mw-confirming')) return; // a discard confirm is modal: arrows must not move the hidden selection
    if (e.ctrlKey) return; // Ctrl combos (incl. macOS Ctrl+arrows Spaces switching) pass through
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'BUTTON' || ae.isContentEditable)) return;
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || typeof sel.modify !== 'function') return;
    if (!sel.focusNode || !docEl.contains(sel.focusNode)) return; // keyboard not engaged: scroll as ever

    var horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    var granularity;
    if (e.metaKey) {
      if (!horizontal) return; // Cmd+Up/Down: browser default (out of scope per spec)
      granularity = 'lineboundary';
    } else if (e.altKey) {
      if (!horizontal) return; // Alt+Up/Down: not in the ladder
      granularity = 'word';
    } else {
      granularity = horizontal ? 'character' : 'line';
    }
    var direction = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? 'backward' : 'forward';
    e.preventDefault();
    sel.modify(e.shiftKey ? 'extend' : 'move', direction, granularity);
    updateCaret(); // immediate; the selectionchange re-sync would lag a frame
  });

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

  // Select text and type a printable character to propose a replacement (Google-Docs Suggesting
  // mode). Guards: a bare single character (no Cmd/Ctrl/Alt), focus not already in an editable field
  // (so typing in a reply/draft - or in the compose field itself - is never hijacked), a non-collapsed
  // selection mapping to a source span, and no compose already open. Otherwise the key behaves
  // normally, which in this read-only doc is a no-op.
  document.addEventListener('keydown', function (e) {
    if (replaceCompose || insertCompose) return;
    if (e.key == null || e.key.length !== 1) return; // printable single char only (not Enter/Tab/etc.)
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // let Cmd+C / Ctrl+A / etc. pass through
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return;
    var span = spanTargetFromSelection();
    if (span) { e.preventDefault(); startReplace(span, e.key); return; } // non-collapsed selection -> replace
    var point = pointTargetFromCaret();
    if (!point) return; // no mappable caret: the key no-ops
    e.preventDefault();
    startInsert(point, e.key); // collapsed caret -> insert
  });

  // Clicking outside the compose field commits it (Google-Docs behavior); an empty field cancels.
  document.addEventListener('mousedown', function (e) {
    if (replaceCompose && e.target !== replaceCompose.fieldEl && !replaceCompose.fieldEl.contains(e.target)) {
      commitReplace();
    }
  });

  document.addEventListener('mousedown', function (e) {
    if (insertCompose && e.target !== insertCompose.fieldEl && !insertCompose.fieldEl.contains(e.target)) {
      commitInsert();
    }
  });

  // A double-click that lands on a gap leaves the selection collapsed; offer a point comment there.
  // A double-click on a word is non-collapsed and is already handled by the mouseup trigger above.
  docEl.addEventListener('dblclick', function (e) {
    if (spanTargetFromSelection()) return;
    var pos = caretRangeAt(e.clientX, e.clientY);
    if (!pos) return;
    var off = srcOffset(pos.startContainer, pos.startOffset);
    if (off != null) {
      showPill({ kind: 'point', start: off, rect: { left: e.clientX, top: e.clientY, width: 0 } });
    }
  });

  // Esc dismisses a pending pill, or an open draft (with its anchor), and clears the selection.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (pillEl) {
      clearPill();
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      return;
    }
    var draft = railEl.querySelector('.mw-draft');
    if (draft) {
      draft.remove();
      clearAnchor();
      var s = window.getSelection();
      if (s) s.removeAllRanges();
      return;
    }
    // No pill, no draft: park the keyboard caret - clear any doc selection (the caret follows
    // via the selectionchange re-sync).
    var ds = window.getSelection();
    if (ds && ds.rangeCount > 0 && ds.focusNode && docEl.contains(ds.focusNode)) ds.removeAllRanges();
  });

  // Clicking elsewhere dismisses a pending pill.
  document.addEventListener('mousedown', function (e) {
    if (pillEl && e.target !== pillEl) clearPill();
  });

  wireProseActivation();
  load();
})();
