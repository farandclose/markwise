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

  let activeId = null;

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

  function send(url, bodyObj) {
    return fetch(url, {
      method: 'POST',
      headers: bodyObj ? { 'content-type': 'application/json' } : {},
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (e) { throw new Error(e.error || 'Request failed'); });
        }
        return r.json();
      })
      .then(function () { return load(); })
      .catch(function (err) { showToast(err.message || 'Action failed'); });
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
        send('/api/note/' + encodeURIComponent(note.id) + '/resolve', null)
          .finally(function () { resolveBtn.disabled = false; });
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

  function load() {
    return fetch('/api/doc')
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        titleEl.textContent = payload.title || '';
        document.title = (payload.title ? payload.title + ' - ' : '') + 'Markwise Preview';
        docEl.innerHTML = payload.html || '';
        countEl.textContent = String(payload.openCount || 0);
        renderRail(payload.notes || []);
        // Re-apply the active note if it survived the repaint; otherwise clear it.
        if (activeId != null && railEl.querySelector('.mw-card' + idSel(activeId))) {
          activate(activeId);
        } else {
          activeId = null;
        }
      })
      .catch(function (err) {
        docEl.innerHTML = '<p class="mw-error">Could not load the document.</p>';
        console.error('[markwise] failed to load /api/doc', err);
      });
  }

  wireProseActivation();
  load();
})();
