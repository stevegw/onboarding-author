/* AP -- Editor: Module Tree Panel */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var _project = null;
  var _activeTopicId = null;
  var _dragSrc = null;

  function renderTree(project) {
    _project = project;
    var tree = AP.ui.qs('#module-tree');
    if (!tree) return;
    tree.innerHTML = '';

    (project.modules || []).forEach(function (mod, mIdx) {
      var group = _buildModuleGroup(mod, mIdx);
      tree.appendChild(group);
    });

    // Add module button
    var addBtn = AP.ui.el('button', { class: 'tree-add-btn' });
    addBtn.textContent = '+ Add Module';
    addBtn.onclick = function () {
      AP.ui.prompt('New Module Title', 'e.g. Advanced Configuration', function (title) {
        AP.state.commitChange(function (p) {
          var mIdx = p.modules.length + 1;
          p.modules.push({
            id: 'm' + Date.now(),
            title: title,
            description: '',
            estimatedMinutes: 0,
            topics: []
          });
        }, 'add-module');
        renderTree(AP.state.getCurrentProject());
        AP.ui.toast('Module added', 'success');
      });
    };
    tree.appendChild(addBtn);
  }

  function _buildModuleGroup(mod, mIdx) {
    var group = AP.ui.el('div', { class: 'module-group', 'data-module-id': mod.id });
    group.draggable = true;

    var header = AP.ui.el('div', { class: 'module-header expanded' });
    header.innerHTML = [
      '<span class="drag-handle">⠿</span>',
      '<span class="module-arrow">▶</span>',
      '<span class="module-title">' + AP.ui.escapeHtml(mod.title) + '</span>',
      '<span class="module-actions">',
        '<button class="module-icon-btn rename-mod" title="Rename">✎</button>',
        '<button class="module-icon-btn add-topic" title="Add Topic">+</button>',
        '<button class="module-icon-btn delete-mod" title="Delete" style="color:var(--danger)">✕</button>',
      '</span>'
    ].join('');

    // Select module heading click
    header.addEventListener('click', function (e) {
      if (e.target.closest('.module-actions')) return;
      header.classList.toggle('expanded');
      topicList.classList.toggle('open');
    });
    header.classList.add('expanded');

    // Rename
    header.querySelector('.rename-mod').onclick = function (e) {
      e.stopPropagation();
      AP.ui.prompt('Rename Module', 'Module title', function (newTitle) {
        AP.state.commitChange(function (p) {
          var m = p.modules.find(function (x) { return x.id === mod.id; });
          if (m) m.title = newTitle;
        }, 'rename-module');
        renderTree(AP.state.getCurrentProject());
      }, mod.title);
    };

    // Add topic
    header.querySelector('.add-topic').onclick = function (e) {
      e.stopPropagation();
      AP.ui.prompt('New Topic Title', 'e.g. Understanding Trackers', function (title) {
        AP.state.commitChange(function (p) {
          var m = p.modules.find(function (x) { return x.id === mod.id; });
          if (!m) return;
          var tId = mod.id + 't' + Date.now();
          m.topics.push({ id: tId, title: title, estimatedMinutes: 0, content: [], keyTakeaways: [] });
        }, 'add-topic');
        renderTree(AP.state.getCurrentProject());
        AP.ui.toast('Topic added', 'success');
      });
    };

    // Delete module
    header.querySelector('.delete-mod').onclick = function (e) {
      e.stopPropagation();
      AP.ui.confirm(
        'Delete "' + mod.title + '"?',
        'All topics in this module will be removed.',
        function () {
          AP.state.commitChange(function (p) {
            p.modules = p.modules.filter(function (x) { return x.id !== mod.id; });
          }, 'delete-module');
          if (_activeTopicId && (mod.topics || []).find(function (t) { return t.id === _activeTopicId; })) {
            _activeTopicId = null;
            AP.editor.showPlaceholder();
          }
          renderTree(AP.state.getCurrentProject());
          AP.ui.toast('Module deleted', 'info');
        },
        true
      );
    };

    group.appendChild(header);

    // Topics list
    var topicList = AP.ui.el('div', { class: 'topic-list open' });
    (mod.topics || []).forEach(function (topic) {
      var item = _buildTopicItem(topic, mod);
      topicList.appendChild(item);
    });

    group.appendChild(topicList);

    // Module drag/drop for reorder
    group.addEventListener('dragstart', function (e) {
      _dragSrc = { type: 'module', id: mod.id };
      e.dataTransfer.effectAllowed = 'move';
      group.style.opacity = '0.4';
    });
    group.addEventListener('dragend', function () {
      group.style.opacity = '';
    });
    group.addEventListener('dragover', function (e) {
      if (_dragSrc && _dragSrc.type === 'module') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        group.classList.add('drop-target-highlight');
      }
    });
    group.addEventListener('dragleave', function () {
      group.classList.remove('drop-target-highlight');
    });
    group.addEventListener('drop', function (e) {
      e.preventDefault();
      group.classList.remove('drop-target-highlight');
      if (!_dragSrc || _dragSrc.type !== 'module' || _dragSrc.id === mod.id) return;
      AP.state.commitChange(function (p) {
        var fromIdx = p.modules.findIndex(function (x) { return x.id === _dragSrc.id; });
        var toIdx   = p.modules.findIndex(function (x) { return x.id === mod.id; });
        if (fromIdx === -1 || toIdx === -1) return;
        var moved = p.modules.splice(fromIdx, 1)[0];
        p.modules.splice(toIdx, 0, moved);
      }, 'reorder-module');
      _dragSrc = null;
      renderTree(AP.state.getCurrentProject());
    });

    return group;
  }

  function _buildTopicItem(topic, mod) {
    var isExercise = !!topic.isExercise;
    var item = AP.ui.el('div', {
      class: 'topic-item' + (isExercise ? ' exercise-topic' : '') + (_activeTopicId === topic.id ? ' active' : ''),
      'data-topic-id': topic.id
    });
    item.draggable = true;
    var hasCont = (topic.content || []).length > 0;
    item.innerHTML = [
      '<span class="topic-icon">' + (isExercise ? '🔧' : '📄') + '</span>',
      '<span class="topic-label">' + AP.ui.escapeHtml(topic.title) + '</span>',
      '<span class="topic-fill-dot' + (hasCont ? ' filled' : '') + '" title="' + (hasCont ? 'Has content' : 'Empty') + '"></span>',
      '<span class="topic-actions">',
        '<button class="module-icon-btn delete-topic" title="Delete">✕</button>',
      '</span>'
    ].join('');

    // Select topic
    item.addEventListener('click', function (e) {
      if (e.target.closest('.topic-actions')) return;
      selectTopic(topic.id, mod.id);
    });

    // Delete topic
    item.querySelector('.delete-topic').onclick = function (e) {
      e.stopPropagation();
      AP.ui.confirm(
        'Delete "' + topic.title + '"?',
        'All content in this topic will be removed.',
        function () {
          AP.state.commitChange(function (p) {
            var m = p.modules.find(function (x) { return x.id === mod.id; });
            if (m) m.topics = m.topics.filter(function (t) { return t.id !== topic.id; });
          }, 'delete-topic');
          if (_activeTopicId === topic.id) {
            _activeTopicId = null;
            AP.editor.showPlaceholder();
          }
          renderTree(AP.state.getCurrentProject());
          AP.ui.toast('Topic deleted', 'info');
        },
        true
      );
    };

    // Topic drag/drop reorder within module
    item.addEventListener('dragstart', function (e) {
      _dragSrc = { type: 'topic', id: topic.id, moduleId: mod.id };
      e.dataTransfer.effectAllowed = 'move';
      item.style.opacity = '0.4';
      e.stopPropagation();
    });
    item.addEventListener('dragend', function () { item.style.opacity = ''; });
    item.addEventListener('dragover', function (e) {
      if (_dragSrc && _dragSrc.type === 'topic' && _dragSrc.moduleId === mod.id) {
        e.preventDefault(); e.stopPropagation();
        item.classList.add('drop-target-highlight');
      }
    });
    item.addEventListener('dragleave', function () { item.classList.remove('drop-target-highlight'); });
    item.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      item.classList.remove('drop-target-highlight');
      if (!_dragSrc || _dragSrc.type !== 'topic' || _dragSrc.id === topic.id || _dragSrc.moduleId !== mod.id) return;
      AP.state.commitChange(function (p) {
        var m = p.modules.find(function (x) { return x.id === mod.id; });
        if (!m) return;
        var fi = m.topics.findIndex(function (t) { return t.id === _dragSrc.id; });
        var ti = m.topics.findIndex(function (t) { return t.id === topic.id; });
        var moved = m.topics.splice(fi, 1)[0];
        m.topics.splice(ti, 0, moved);
      }, 'reorder-topic');
      _dragSrc = null;
      renderTree(AP.state.getCurrentProject());
    });

    return item;
  }

  function selectTopic(topicId, moduleId) {
    _activeTopicId = topicId;
    // Highlight active in tree
    AP.ui.qsa('.topic-item').forEach(function (el) { el.classList.remove('active'); });
    var el = AP.ui.qs('[data-topic-id="' + topicId + '"]');
    if (el) el.classList.add('active');
    // Load into content editor
    AP.editor.loadTopic(topicId, moduleId);
  }

  function getActiveTopicId() { return _activeTopicId; }

  AP.tree = {
    render: renderTree,
    selectTopic: selectTopic,
    getActiveTopicId: getActiveTopicId
  };
})();
