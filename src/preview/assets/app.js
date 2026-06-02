// Markwise previewer - read-only browser app. No build step, no framework: it fetches the
// server-rendered document payload, drops the HTML into the reading column, builds the notes rail,
// and wires the clean<->revealed toggle plus one-at-a-time, bidirectional note activation.
// Mutation (create / reply / resolve / handoff) is the next milestone; those controls render here
// disabled so the layout is real for review.

(function () {
  'use strict';

  const body = document.body;
  const docEl = document.querySelector('.mw-doc');
  const railEl = document.querySelector('.mw-rail');
  const titleEl = document.querySelector('.mw-doctitle');
  const counterBtn = document.querySelector('.mw-counter');
  const countEl = document.querySelector('.mw-count');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

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
    const last = note.thread[note.thread.length - 1];
    return last ? last.body : '';
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

      // Composition + verbs are disabled in the read-only milestone (shown for layout).
      const actions = document.createElement('div');
      actions.className = 'mw-card-actions';
      actions.innerHTML =
        '<textarea class="mw-reply" placeholder="Reply..." disabled></textarea>' +
        '<div class="mw-verbs">' +
        '<button type="button" class="mw-reply-btn" disabled>Reply</button>' +
        '<button type="button" class="mw-resolve-btn" disabled>Resolve</button>' +
        '</div>';
      card.appendChild(actions);

      card.addEventListener('click', function () {
        activate(note.id);
      });
      railEl.appendChild(card);
    });
  }

  function activate(id) {
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
    if (!on) activate(null);
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

  fetch('/api/doc')
    .then(function (r) { return r.json(); })
    .then(function (payload) {
      titleEl.textContent = payload.title || '';
      document.title = (payload.title ? payload.title + ' - ' : '') + 'Markwise Preview';
      docEl.innerHTML = payload.html || '';
      countEl.textContent = String(payload.openCount || 0);
      renderRail(payload.notes || []);
      wireProseActivation();
    })
    .catch(function (err) {
      docEl.innerHTML = '<p class="mw-error">Could not load the document.</p>';
      console.error('[markwise] failed to load /api/doc', err);
    });
})();
