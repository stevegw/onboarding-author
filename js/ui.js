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

  function toast(msg, type, duration, onUndo) {
    var container = getToastContainer();
    if (!container) return;
    type = type || 'info';
    duration = duration || 2800;

    var icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    var t = el('div', { class: 'toast toast-' + type });
    t.innerHTML = '<span>' + icons[type] + '</span> ' + escapeHtml(msg);

    if (onUndo) {
      var undoBtn = el('button', { class: 'toast-undo-btn' });
      undoBtn.textContent = 'Undo';
      undoBtn.onclick = function () {
        t.classList.add('hiding');
        setTimeout(function () { t.remove(); }, 250);
        onUndo();
      };
      t.appendChild(undoBtn);
      duration = Math.max(duration, 5000); // give more time when undo available
    }

    container.appendChild(t);

    var timer = setTimeout(function () {
      t.classList.add('hiding');
      setTimeout(function () { t.remove(); }, 250);
    }, duration);

    // Hovering pauses the auto-dismiss when undo is available
    if (onUndo) {
      t.addEventListener('mouseenter', function () { clearTimeout(timer); });
      t.addEventListener('mouseleave', function () {
        timer = setTimeout(function () {
          t.classList.add('hiding');
          setTimeout(function () { t.remove(); }, 250);
        }, 2000);
      });
    }
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

  // ── Undo system ──
  var _undoBar;
  var _suppressUndoBar = false;

  // Central undo/redo functions — used by toast buttons, bar buttons, and Ctrl+Z/Y
  function performUndo() {
    var restored = AP.state.undo();
    if (!restored) return false;
    _suppressUndoBar = true;
    AP.editor.reload(restored);
    AP.tree.render(restored);
    _suppressUndoBar = false;
    _updateUndoBar();
    return true;
  }

  function performRedo() {
    var restored = AP.state.redo();
    if (!restored) return false;
    _suppressUndoBar = true;
    AP.editor.reload(restored);
    AP.tree.render(restored);
    _suppressUndoBar = false;
    _updateUndoBar();
    return true;
  }

  function _updateUndoBar() {
    if (!_undoBar) return;
    _undoBar.querySelector('#undo-count').textContent = AP.state.canUndo() ? '↩' : '';
    var undoBtn = _undoBar.querySelector('#undo-btn');
    var redoBtn = _undoBar.querySelector('#redo-btn');
    if (undoBtn) undoBtn.disabled = !AP.state.canUndo();
    if (redoBtn) redoBtn.disabled = !AP.state.canRedo();
  }

  function initUndoBar() {
    _undoBar = document.getElementById('undo-bar');
    var undoTimer;

    AP.state.onUndoChange(function (canUndo, canRedo, histLen) {
      if (!_undoBar || _suppressUndoBar) return;
      _updateUndoBar();

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
      if (performUndo()) toast('Undone', 'info');
    };
    qs('#redo-btn').onclick = function () {
      if (performRedo()) toast('Redone', 'info');
    };

    // Auto-show toast with undo button on structural changes
    var _labelMap = {
      'add-module': 'Module added', 'rename-module': 'Module renamed',
      'add-topic': 'Topic added', 'delete-module': 'Module deleted',
      'delete-topic': 'Topic deleted', 'reorder-module': 'Module reordered',
      'reorder-topic': 'Topic reordered', 'add-block': 'Block added',
      'delete-block': 'Block deleted', 'move-block-up': 'Block moved',
      'move-block-down': 'Block moved', 'add-takeaway': 'Takeaway added',
      'delete-takeaway': 'Takeaway deleted', 'toggle-exercise': 'Exercise toggled',
      'edit-title': 'Title updated', 'edit-minutes': 'Minutes updated',
      'edit-module-desc': 'Description updated', 'rename': 'Project renamed',
      'edit-content': 'Content updated', 'edit-takeaway': 'Takeaway updated'
    };
    // Quiet labels: frequent text edits — undo bar only, no toast
    var _quietLabels = { 'edit-content': 1, 'edit-takeaway': 1, 'edit-title': 1, 'edit-minutes': 1, 'edit-module-desc': 1 };

    AP.state.onCommit(function (label) {
      if (_quietLabels[label]) return;
      var msg = _labelMap[label] || 'Change recorded';
      toastUndo(msg);
    });
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

    // ── Sidebar resize (restore saved width) ──
    var LS_SB_WIDTH = 'ap_sidebar_width';
    var savedSbWidth = localStorage.getItem(LS_SB_WIDTH);
    if (savedSbWidth && sidebar) {
      sidebar.style.width = savedSbWidth + 'px';
    }
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

  function isMobile() {
    return window.innerWidth <= 860;
  }

  // Toast with undo button
  function toastUndo(msg) {
    toast(msg, 'success', 5000, function () {
      performUndo();
    });
  }

  AP.ui = {
    qs: qs, qsa: qsa, el: el,
    escapeHtml: escapeHtml,
    initTheme: initTheme,
    toggleTheme: toggleTheme,
    toast: toast,
    toastUndo: toastUndo,
    confirm: confirm,
    prompt: prompt,
    initUndoBar: initUndoBar,
    initPanelResize: initPanelResize,
    performUndo: performUndo,
    performRedo: performRedo,
    downloadJson: downloadJson,
    formatDate: formatDate,
    isMobile: isMobile
  };
})();
