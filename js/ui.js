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

  // ── Panel Resize ──
  function initPanelResize() {
    // ── Sidebar (leftmost) collapse ──
    var sidebar = document.getElementById('sidebar');
    var sbBtn = document.getElementById('sidebar-collapse-btn');
    var LS_SB_COLLAPSED = 'ap_sidebar_collapsed';

    var overlay = document.getElementById('sidebar-overlay');
    var menuBtn = document.getElementById('mobile-menu-btn');

    if (sidebar && sbBtn) {
      if (localStorage.getItem(LS_SB_COLLAPSED) === '1') {
        sidebar.classList.add('collapsed');
        sbBtn.textContent = '▶';
      }
      sbBtn.onclick = function () {
        var collapsed = sidebar.classList.toggle('collapsed');
        sbBtn.textContent = collapsed ? '▶' : '◀';
        localStorage.setItem(LS_SB_COLLAPSED, collapsed ? '1' : '0');
      };
    }

    // ── Mobile sidebar toggle ──
    function closeMobileSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('visible');
    }
    if (menuBtn && sidebar) {
      menuBtn.onclick = function () {
        var isOpen = sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('visible', isOpen);
      };
    }
    if (overlay) {
      overlay.onclick = closeMobileSidebar;
    }
    // Close sidebar when navigating on mobile
    if (sidebar) {
      sidebar.addEventListener('click', function (e) {
        if (e.target.closest('.sb-nav-item')) {
          setTimeout(closeMobileSidebar, 150);
        }
      });
    }

    // ── Module tree panel collapse + resize ──
    var panel = document.getElementById('editor-panel-left');
    var handle = document.getElementById('resize-handle');
    var btn = document.getElementById('panel-collapse-btn');
    if (!panel || !handle || !btn) return;

    var LS_COLLAPSED = 'ap_panel_collapsed';
    var LS_WIDTH = 'ap_panel_width';
    var MIN_W = 180;
    var MAX_W = 500;

    // Restore saved state
    var savedWidth = localStorage.getItem(LS_WIDTH);
    if (savedWidth) panel.style.setProperty('--panel-left-w', savedWidth + 'px');

    if (localStorage.getItem(LS_COLLAPSED) === '1') {
      panel.classList.add('collapsed');
      btn.textContent = '▶';
    }

    // Collapse toggle
    btn.onclick = function () {
      var collapsed = panel.classList.toggle('collapsed');
      btn.textContent = collapsed ? '▶' : '◀';
      localStorage.setItem(LS_COLLAPSED, collapsed ? '1' : '0');
    };

    // Drag resize
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      handle.classList.add('dragging');
      panel.style.transition = 'none';

      var onMove = function (e) {
        var rect = panel.getBoundingClientRect();
        var w = e.clientX - rect.left;
        w = Math.max(MIN_W, Math.min(MAX_W, w));
        panel.style.setProperty('--panel-left-w', w + 'px');
      };

      var onUp = function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.classList.remove('dragging');
        panel.style.transition = '';
        var finalW = parseInt(getComputedStyle(panel).width, 10);
        localStorage.setItem(LS_WIDTH, finalW);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
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
    initPanelResize: initPanelResize,
    downloadJson: downloadJson,
    formatDate: formatDate
  };
})();
