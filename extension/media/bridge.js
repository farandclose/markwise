// Markwise webview transport shim. This runs BEFORE the unmodified previewer client (app.js) and
// adapts its three browser touchpoints to the VS Code webview, so app.js itself is reused verbatim
// (one previewer, no fork - R2/R10):
//
//   1. Network: app.js does `fetch('/api/...')`. There is no HTTP server here (KTD1), so we replace
//      window.fetch with a postMessage round-trip to the extension host, presenting the reply as a
//      minimal Response (ok / status / json()). Every previewer call - load, revalidate, the
//      apiPost mutations, and the handoff doorbell - flows through this one seam.
//   2. Theme: app.js persists the chosen theme via localStorage. A webview's localStorage is not a
//      durable store, so we route the one `mw-theme` key to the webview's getState/setState and apply
//      the saved theme before first paint (this script is loaded in <head>).
//   3. Refresh: the host signals an external file change with a `refresh` message; we turn it into the
//      same `focus` event app.js already revalidates on, reusing its version-diff repaint guard.
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();

  // ---- Theme (getState/setState in place of localStorage) -------------------------------------
  try {
    var state = vscode.getState() || {};
    if (state.theme) document.documentElement.setAttribute('data-theme', state.theme);
  } catch (e) {
    /* default data-theme from the template stands */
  }

  // localStorage on a Storage instance is exotic (assigning localStorage.setItem stores a string
  // under the key "setItem"), so the only correct override is on Storage.prototype. We route just the
  // mw-theme key to webview state; every other key falls through to the real implementation.
  try {
    var realSet = Storage.prototype.setItem;
    var realGet = Storage.prototype.getItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mw-theme') {
        var s = {};
        try { s = vscode.getState() || {}; } catch (e) {}
        s.theme = value;
        try { vscode.setState(s); } catch (e) {}
        return;
      }
      return realSet.call(this, key, value);
    };
    Storage.prototype.getItem = function (key) {
      if (key === 'mw-theme') {
        try { return (vscode.getState() || {}).theme || null; } catch (e) { return null; }
      }
      return realGet.call(this, key);
    };
  } catch (e) {
    /* no localStorage in this webview - theme still works via the data-theme applied above */
  }

  // ---- Host -> webview messages ---------------------------------------------------------------
  var pending = Object.create(null);
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'apiResponse' && typeof msg.id === 'number') {
      var resolve = pending[msg.id];
      if (resolve) {
        delete pending[msg.id];
        resolve(msg);
      }
      return;
    }
    if (msg.type === 'refresh') {
      // Re-pull through the path app.js already uses on tab focus: revalidate() re-fetches /api/doc
      // (served fresh from disk by the host), repaints only on a real version change, and no-ops
      // while a draft/pill/compose is open - exactly the behavior we want for an external write.
      window.dispatchEvent(new Event('focus'));
      return;
    }
  });

  // ---- fetch shim (the only transport) -------------------------------------------------------
  var seq = 0;
  function headerValue(opts, name) {
    return opts && opts.headers ? opts.headers[name] : undefined;
  }

  window.fetch = function (input, opts) {
    opts = opts || {};
    var url = String(input);
    var id = ++seq;
    var body;
    if (opts.body) {
      try { body = JSON.parse(opts.body); } catch (e) { body = undefined; }
    }
    return new Promise(function (resolve) {
      pending[id] = function (res) {
        resolve({
          ok: !!res.ok,
          status: res.status,
          json: function () { return Promise.resolve(res.body); },
        });
      };
      vscode.postMessage({
        type: 'apiRequest',
        id: id,
        method: (opts.method || 'GET').toUpperCase(),
        url: url,
        version: headerValue(opts, 'x-mw-version'),
        handoff: headerValue(opts, 'x-mw-handoff') !== undefined,
        body: body,
      });
    });
  };
})();
