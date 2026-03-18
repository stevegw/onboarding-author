/* AP -- UI Helpers */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  // ── DOM ──
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(function (kv) {
      if (kv[0] === 'class') e.className = kv[1];
      else if (kv[0].startsWith('on')) e.addEventListener(kv[0].slice(2), kv[1]);
      else e.setAttribute(kv[0], kv[1]);
    });
    if (typeof children === 'string') e.innerHTML = children;
    else if (Array.isArray(children)) children.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Theme ──
  function initTheme() {
    var saved = localStorage.getItem('ap_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    return saved;
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ap_theme', next);
    return next;
  }

  // ── Toast ──
  var _toastContainer;
  function getToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.getElementById('toast-container');
    }
    return _toastContainer;
  }

  function toast(msg, type, duration) {
    var container = getToastContainer();
    if (!container) return;
    type = type || 'info';
    duration = duration || 2800;

    var icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    var t = el('div', { class: 'toast toast-' + type });
    t.innerHTML = '<span>' + icons[type] + '</span> ' + escapeHtml(msg);
    container.appendChild(t);

    setTimeout(function () {
      t.classList.add('hiding');
      setTimeout(function () { t.remove(); }, 250);
    }, duration);
  }

  // ── Modal ──
  function confirm(title, msg, onConfirm, danger) {
    var overlay = el('div', { class: 'modal-overlay' });
    var modal = el('div', { class: 'modal' });
    modal.innerHTML = [
      '<h3>' + escapeHtml(title) + '</h3>',
      '<p>' + escapeHtml(msg) + '</p>',
      '<div class="modal-actions">',
        '<button class="btn btn-secondary" id="modal-cancel">Cancel</button>',
        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="modal-ok">' + (danger ? 'Delete' : 'Confirm') + '</button>',
      '</div>'
    ].join('');
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    modal.querySelector('#modal-cancel').onclick = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    modal.querySelector('#modal-ok').onclick = function () {
      close();
      if (onConfirm) onConfirm();
    };
  }

  function prompt(title, placeholder, onSubmit, defaultVal) {
    var overlay = el('div', { class: 'modal-overlay' });
    var modal = el('div', { class: 'modal' });
    modal.innerHTML = [
      '<h3>' + escapeHtml(title) + '</h3>',
      '<input class="modal-input" id="modal-input" type="text" placeholder="' + escapeHtml(placeholder || '') + '" value="' + escapeHtml(defaultVal || '') + '">',
      '<div class="modal-actions">',
        '<button class="btn btn-secondary" id="modal-cancel">Cancel</button>',
        '<button class="btn btn-primary" id="modal-ok">Save</button>',
      '</div>'
    ].join('');
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var input = modal.querySelector('#modal-input');
    setTimeout(function () { input.focus(); input.select(); }, 50);

    function close() { overlay.remove(); }
    function submit() {
      var val = input.value.trim();
      if (!val) return;
      close();
      if (onSubmit) onSubmit(val);
    }

    modal.querySelector('#modal-cancel').onclick = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    modal.querySelector('#modal-ok').onclick = submit;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  // ── Undo Bar ──
  var _undoBar;
  function initUndoBar() {
    _undoBar = document.getElementById('undo-bar');
    var undoTimer;

    AP.state.onUndoChange(function (canUndo, canRedo, histLen) {
      if (!_undoBar) return;
      _undoBar.querySelector('#undo-count').textContent = histLen + '/' + 10;

      clearTimeout(undoTimer);
      if (canUndo) {
        _undoBar.classList.add('visible');
        undoTimer = setTimeout(function () {
          _undoBar.classList.remove('visible');
        }, 4000);
      } else {
        _undoBar.classList.remove('visible');
      }
    });

    qs('#undo-btn').onclick = function () {
      var restored = AP.state.undo();
      if (restored) {
        AP.editor.reload(restored);
        toast('Undone', 'info');
      }
    };
    qs('#redo-btn').onclick = function () {
      var restored = AP.state.redo();
      if (restored) {
        AP.editor.reload(restored);
        toast('Redone', 'info');
      }
    };
  }

  // ── Export helpers ──
  function downloadJson(filename, data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  AP.ui = {
    qs: qs, qsa: qsa, el: el,
    escapeHtml: escapeHtml,
    initTheme: initTheme,
    toggleTheme: toggleTheme,
    toast: toast,
    confirm: confirm,
    prompt: prompt,
    initUndoBar: initUndoBar,
    downloadJson: downloadJson,
    formatDate: formatDate
  };
})();
