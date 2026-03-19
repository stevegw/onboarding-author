/* AP -- Editor: Content Area */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var _topicId  = null;
  var _moduleId = null;
  var _saveTimer = null;

  // ── Public API ──
  function loadTopic(topicId, moduleId) {
    _topicId  = topicId;
    _moduleId = moduleId;
    var project = AP.state.getCurrentProject();
    if (!project) return;
    var mod   = _getMod(project);
    var topic = mod && _getTopicFrom(mod);
    if (!topic) return;
    if (AP.preview && AP.preview.isPreview()) {
      _renderPreview(topic, mod);
    } else {
      _render(topic, mod);
    }
    _updateBreadcrumb(mod.title, topic.title);
  }

  function reload(project) {
    if (!_topicId || !_moduleId) { showPlaceholder(); return; }
    var mod   = _getMod(project);
    var topic = mod && _getTopicFrom(mod);
    if (!topic) { showPlaceholder(); return; }
    if (AP.preview && AP.preview.isPreview()) {
      _renderPreview(topic, mod);
    } else {
      _render(topic, mod);
    }
    _updateBreadcrumb(mod.title, topic.title);
  }

  function toggleMode() {
    if (!AP.preview) return;
    var newMode = AP.preview.isPreview() ? 'author' : 'preview';
    AP.preview.setMode(newMode);
    _updateToggleButton();
    // Re-render current topic in new mode
    if (_topicId && _moduleId) {
      var project = AP.state.getCurrentProject();
      if (project) {
        var mod = _getMod(project);
        var topic = mod && _getTopicFrom(mod);
        if (topic) {
          if (newMode === 'preview') {
            _renderPreview(topic, mod);
          } else {
            _render(topic, mod);
          }
        }
      }
    }
    return newMode;
  }

  function _updateToggleButton() {
    var btn = AP.ui.qs('#mode-toggle-btn');
    if (!btn) return;
    var isPrev = AP.preview && AP.preview.isPreview();
    btn.textContent = isPrev ? '✎ Author' : '👁 Preview';
    btn.title = isPrev ? 'Switch to Author mode' : 'Switch to Preview mode';
    if (isPrev) {
      btn.classList.add('mode-preview');
      btn.classList.remove('mode-author');
    } else {
      btn.classList.add('mode-author');
      btn.classList.remove('mode-preview');
    }
  }

  function _renderPreview(topic, mod) {
    var body = AP.ui.qs('#editor-body');
    if (!body) return;
    body.innerHTML = '';

    var tt = AP.ui.qs('#toolbar-title');
    if (tt) tt.textContent = topic.title || 'Untitled topic';

    var previewWrap = AP.ui.el('div', { class: 'preview-wrap' });
    previewWrap.innerHTML = AP.preview.renderTopic(topic, mod);
    body.appendChild(previewWrap);

    AP.preview.bindPreviewInteractions(body);
  }

  function showPlaceholder() {
    var body = AP.ui.qs('#editor-body');
    if (!body) return;
    body.innerHTML = [
      '<div class="editor-placeholder">',
        '<div class="editor-placeholder-icon">📄</div>',
        '<h3>Select a topic to edit</h3>',
        '<p>Choose a topic from the module tree on the left, or add a new one.</p>',
      '</div>'
    ].join('');
    _updateBreadcrumb('', '');
    var tt = AP.ui.qs('#toolbar-title');
    if (tt) tt.textContent = '';
  }

  // ── Internal ──
  function _getMod(project) {
    return (project.modules || []).find(function (m) { return m.id === _moduleId; });
  }

  function _getTopicFrom(mod) {
    return (mod.topics || []).find(function (t) { return t.id === _topicId; });
  }

  function _getTopic(project) {
    var mod = _getMod(project);
    return mod && _getTopicFrom(mod);
  }

  function _updateBreadcrumb(modTitle, topicTitle) {
    var bc = AP.ui.qs('#topbar-breadcrumb');
    if (!bc) return;
    bc.innerHTML = [
      '<span style="cursor:pointer" id="bc-catalog">Catalog</span>',
      modTitle  ? '<span class="bc-sep">›</span><span>' + AP.ui.escapeHtml(modTitle) + '</span>' : '',
      topicTitle? '<span class="bc-sep">›</span><span class="bc-current">' + AP.ui.escapeHtml(topicTitle) + '</span>' : ''
    ].join('');
    var cat = bc.querySelector('#bc-catalog');
    if (cat) cat.onclick = function () { AP.router.go('catalog'); };
  }

  function _render(topic, mod) {
    var body = AP.ui.qs('#editor-body');
    if (!body) return;
    body.innerHTML = '';

    var tt = AP.ui.qs('#toolbar-title');
    if (tt) tt.textContent = topic.title || 'Untitled topic';

    // ── Meta bar: title + minutes + exercise flag ──
    var metaBar = AP.ui.el('div', { class: 'topic-meta-bar' });

    var titleInp = AP.ui.el('input', { class: 'topic-title-input', type: 'text', placeholder: 'Topic title' });
    titleInp.value = topic.title || '';
    titleInp.oninput = function () {
      topic.title = titleInp.value; // mutate in-place immediately
      var tt2 = AP.ui.qs('#toolbar-title');
      if (tt2) tt2.textContent = titleInp.value;
      _debounceSave(function () {
        AP.state.commitChange(function (p) {
          var t = _getTopic(p);
          if (t) t.title = titleInp.value;
        }, 'edit-title');
        AP.tree.render(AP.state.getCurrentProject());
      });
    };
    metaBar.appendChild(titleInp);

    var minsField = AP.ui.el('div', { class: 'meta-field' });
    var minsLbl = AP.ui.el('label', { style: 'font-size:11px;color:var(--text-dim)' });
    minsLbl.textContent = 'Est. minutes:';
    var minsInp = AP.ui.el('input', { class: 'meta-input', type: 'number', min: '0', max: '120' });
    minsInp.value = topic.estimatedMinutes || 0;
    minsInp.oninput = function () {
      var v = parseInt(minsInp.value) || 0;
      topic.estimatedMinutes = v;
      _debounceSave(function () {
        AP.state.commitChange(function (p) {
          var t = _getTopic(p);
          if (t) t.estimatedMinutes = v;
        }, 'edit-minutes');
      });
    };
    minsField.appendChild(minsLbl);
    minsField.appendChild(minsInp);
    metaBar.appendChild(minsField);

    var exField = AP.ui.el('div', { class: 'meta-field' });
    var exLbl = AP.ui.el('label', { style: 'font-size:11px;color:var(--text-dim)' });
    exLbl.textContent = 'Exercise topic:';
    var exCheck = AP.ui.el('input', { class: 'meta-checkbox', type: 'checkbox' });
    exCheck.checked = !!topic.isExercise;
    exCheck.onchange = function () {
      AP.state.commitChange(function (p) {
        var t = _getTopic(p);
        if (!t) return;
        if (exCheck.checked) t.isExercise = true;
        else delete t.isExercise;
      }, 'toggle-exercise');
      AP.tree.render(AP.state.getCurrentProject());
    };
    exField.appendChild(exLbl);
    exField.appendChild(exCheck);
    metaBar.appendChild(exField);
    body.appendChild(metaBar);

    // ── Module description ──
    var descSect = AP.ui.el('div', { style: 'margin-bottom:20px' });
    var descLbl = AP.ui.el('p', { class: 'section-label' });
    descLbl.textContent = 'Module Description';
    descLbl.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-dim);margin-bottom:6px';
    var descTa = document.createElement('textarea');
    descTa.className = 'block-textarea';
    descTa.style.cssText = 'border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;background:var(--bg-input)';
    descTa.placeholder = 'One-sentence module summary shown in the sidebar and course overview…';
    descTa.value = mod.description || '';
    descTa.rows = 2;
    descTa.oninput = function () {
      mod.description = descTa.value;
      _debounceSave(function () {
        AP.state.commitChange(function (p) {
          var m = _getMod(p);
          if (m) m.description = descTa.value;
        }, 'edit-module-desc');
      });
    };
    descSect.appendChild(descLbl);
    descSect.appendChild(descTa);
    body.appendChild(descSect);

    // ── Content blocks ──
    var blocksLbl = AP.ui.el('p', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-dim);margin-bottom:10px' });
    blocksLbl.textContent = 'Content Blocks (' + (topic.content || []).length + ')';
    body.appendChild(blocksLbl);

    var blocksEl = AP.ui.el('div', { class: 'content-blocks', id: 'content-blocks' });
    _renderBlocks(topic.content || [], blocksEl);
    body.appendChild(blocksEl);

    // Add block palette
    body.appendChild(AP.blocks.buildPalette(function (type) {
      AP.state.commitChange(function (p) {
        var t = _getTopic(p);
        if (!t) return;
        t.content = t.content || [];
        t.content.push(AP.blocks.defaultBlock(type));
      }, 'add-block');
      loadTopic(_topicId, _moduleId);
      AP.ui.toast('Block added', 'success');
    }));

    // ── Key Takeaways ──
    var tkLbl = AP.ui.el('p', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-dim);margin:20px 0 8px' });
    tkLbl.textContent = 'Key Takeaways';
    body.appendChild(tkLbl);
    _renderTakeaways(topic.keyTakeaways || [], body);
  }

  function _renderBlocks(blocks, container) {
    container.innerHTML = '';
    blocks.forEach(function (block, idx) {
      var wrap = AP.blocks.renderBlock(
        block, idx,
        // onChange — persist without new undo entry (text is already snapshotted on block add)
        function () { _debounceSave(function () { AP.state.persistOnly(); }); },
        // onDelete
        function (i) {
          AP.state.commitChange(function (p) {
            var t = _getTopic(p);
            if (t) t.content.splice(i, 1);
          }, 'delete-block');
          loadTopic(_topicId, _moduleId);
        },
        // onMoveUp
        function (i) {
          if (i === 0) return;
          AP.state.commitChange(function (p) {
            var c = _getTopic(p).content;
            var tmp = c[i - 1]; c[i - 1] = c[i]; c[i] = tmp;
          }, 'move-block-up');
          loadTopic(_topicId, _moduleId);
        },
        // onMoveDown
        function (i) {
          AP.state.commitChange(function (p) {
            var c = _getTopic(p).content;
            if (i >= c.length - 1) return;
            var tmp = c[i + 1]; c[i + 1] = c[i]; c[i] = tmp;
          }, 'move-block-down');
          loadTopic(_topicId, _moduleId);
        }
      );
      container.appendChild(wrap);
    });
  }

  function _renderTakeaways(takeaways, body) {
    var list = AP.ui.el('div', { class: 'takeaways-list' });

    function rebuild() {
      list.innerHTML = '';
      takeaways.forEach(function (tk, i) {
        var row = AP.ui.el('div', { class: 'takeaway-item' });
        var inp = document.createElement('input');
        inp.placeholder = 'Key takeaway ' + (i + 1);
        inp.value = tk;
        inp.oninput = function () {
          takeaways[i] = inp.value;
          _debounceSave(function () { AP.state.persistOnly(); });
        };
        var del = AP.ui.el('button', { class: 'btn btn-danger btn-xs takeaway-remove' });
        del.title = 'Remove';
        del.textContent = '✕';
        del.onclick = function () {
          AP.state.commitChange(function (p) {
            var t = _getTopic(p);
            if (t) t.keyTakeaways.splice(i, 1);
          }, 'delete-takeaway');
          loadTopic(_topicId, _moduleId);
        };
        row.appendChild(inp);
        row.appendChild(del);
        list.appendChild(row);
      });

      var addBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-sm', style: 'margin-top:8px' });
      addBtn.textContent = '+ Add Takeaway';
      addBtn.onclick = function () {
        AP.state.commitChange(function (p) {
          var t = _getTopic(p);
          if (t) {
            t.keyTakeaways = t.keyTakeaways || [];
            t.keyTakeaways.push('');
          }
        }, 'add-takeaway');
        loadTopic(_topicId, _moduleId);
      };
      list.appendChild(addBtn);
    }

    rebuild();
    body.appendChild(list);
  }

  function _debounceSave(fn) {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(fn, 700);
  }

  AP.editor = {
    loadTopic: loadTopic,
    reload: reload,
    showPlaceholder: showPlaceholder,
    toggleMode: toggleMode
  };
})();
