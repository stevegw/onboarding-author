/* AP -- State & Undo
 *
 * Storage: dual-write to localStorage (fast reads, undo) + server files (portable).
 * On startup, syncs server → localStorage so copied directories just work.
 *
 * Undo model:
 *   _history[] holds JSON strings of past project states (max MAX_UNDO).
 *   _future[] holds JSON strings for redo.
 *   commitChange(fn, label): snapshot → mutate → persist
 *   snapshotBeforeEdit(): snapshot once per edit session (before in-place mutation)
 *   persistOnly(): save without undo entry (after debounced text edits)
 */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var LS_REGISTRY = 'ap_projects';
  var MAX_UNDO = 10;

  // ── localStorage helpers (fast, sync) ──
  function lsGetRegistry() {
    try { return JSON.parse(localStorage.getItem(LS_REGISTRY) || '{}'); }
    catch (e) { return {}; }
  }
  function lsSetRegistry(reg) {
    localStorage.setItem(LS_REGISTRY, JSON.stringify(reg));
  }
  function lsGetProject(id) {
    try { return JSON.parse(localStorage.getItem('ap_project_' + id) || 'null'); }
    catch (e) { return null; }
  }
  function lsSetProject(id, data) {
    localStorage.setItem('ap_project_' + id, JSON.stringify(data));
  }
  function lsRemoveProject(id) {
    localStorage.removeItem('ap_project_' + id);
  }

  // ── Server helpers (persistent, async fire-and-forget) ──
  function serverSaveRegistry(reg) {
    try {
      fetch('/api/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reg)
      });
    } catch (e) { /* offline — localStorage still has it */ }
  }

  function serverSaveProject(id, data) {
    try {
      fetch('/api/projects/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) { /* offline */ }
  }

  function serverDeleteProject(id) {
    try {
      fetch('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
    } catch (e) { /* offline */ }
  }

  // ── Combined persist ──
  function saveRegistry(reg) {
    lsSetRegistry(reg);
    serverSaveRegistry(reg);
  }

  function saveProject(id, data) {
    lsSetProject(id, data);
    serverSaveProject(id, data);
  }

  // ── Sync: merge localStorage ↔ server on startup ──
  // 1. Push any localStorage-only projects to server (migration)
  // 2. Pull any server-only projects to localStorage (copied directory)
  function syncFromServer(callback) {
    fetch('/api/registry')
      .then(function (r) { return r.json(); })
      .then(function (serverReg) {
        if (!serverReg || typeof serverReg !== 'object') serverReg = {};

        var localReg = lsGetRegistry();
        var merged = {};
        var pushIds = []; // localStorage → server
        var pullIds = []; // server → localStorage

        // Find projects only in localStorage (push to server)
        Object.keys(localReg).forEach(function (id) {
          merged[id] = localReg[id];
          if (!serverReg[id]) pushIds.push(id);
        });

        // Find projects only on server (pull to localStorage)
        Object.keys(serverReg).forEach(function (id) {
          if (!merged[id]) merged[id] = serverReg[id];
          // Use newer version if both exist
          if (localReg[id] && serverReg[id]) {
            var localDate = new Date(localReg[id].updatedAt || 0);
            var serverDate = new Date(serverReg[id].updatedAt || 0);
            if (serverDate > localDate) {
              merged[id] = serverReg[id];
              pullIds.push(id);
            }
          }
          if (!localReg[id]) pullIds.push(id);
        });

        // Save merged registry to both
        lsSetRegistry(merged);
        serverSaveRegistry(merged);

        // Count total async operations
        var total = pushIds.length + pullIds.length;
        if (total === 0) { callback(); return; }

        var done = 0;
        function tick() { done++; if (done === total) callback(); }

        // Push localStorage projects to server
        pushIds.forEach(function (id) {
          var data = lsGetProject(id);
          if (data) {
            serverSaveProject(id, data);
            // fire-and-forget, count as done immediately
          }
          tick();
        });

        // Pull server projects to localStorage
        pullIds.forEach(function (id) {
          fetch('/api/projects/' + encodeURIComponent(id))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
              if (data) lsSetProject(id, data);
              tick();
            })
            .catch(function () { tick(); });
        });
      })
      .catch(function () {
        // Server not available — use localStorage as-is
        callback();
      });
  }

  // ── Undo Stack ──
  var _history = [];
  var _future  = [];
  var _current = null;
  var _readOnly = false;
  var _undoCallback = null;
  var _commitCallback = null;
  var _editDirty = false;

  function _snap() {
    return _current ? JSON.stringify(_current) : null;
  }

  function _pushHistory(s) {
    if (!s) return;
    _history.push(s);
    if (_history.length > MAX_UNDO) _history.shift();
    _future = [];
  }

  function canUndo() { return _history.length > 0; }
  function canRedo() { return _future.length > 0; }

  function undo() {
    if (!canUndo()) return false;
    _future.push(_snap());
    _current = JSON.parse(_history.pop());
    _editDirty = false;
    _persist();
    _notify();
    return _current;
  }

  function redo() {
    if (!canRedo()) return false;
    _history.push(_snap());
    _current = JSON.parse(_future.pop());
    _editDirty = false;
    _persist();
    _notify();
    return _current;
  }

  function _persist() {
    if (!_current) return;
    var reg = lsGetRegistry();
    if (!reg[_current.id]) return;
    reg[_current.id].updatedAt = new Date().toISOString();
    saveRegistry(reg);
    saveProject(_current.id, _current);
  }

  function _notify() {
    if (_undoCallback) _undoCallback(canUndo(), canRedo(), _history.length);
  }

  // ── Project CRUD ──
  function createProject(name, product, skeleton) {
    var id = 'proj_' + Date.now();
    var now = new Date().toISOString();
    var project = JSON.parse(JSON.stringify(skeleton));
    project.id = id;
    project.title = name;
    project._authorMeta = { name: name, product: product, createdAt: now, updatedAt: now };
    var reg = lsGetRegistry();
    reg[id] = { id: id, name: name, product: product, createdAt: now, updatedAt: now };
    saveRegistry(reg);
    saveProject(id, project);
    return project;
  }

  function openProject(id) {
    _current = lsGetProject(id);
    _readOnly = false;
    _history = [];
    _future  = [];
    _editDirty = false;
    _notify();
    return _current;
  }

  function deleteProject(id) {
    var reg = lsGetRegistry();
    delete reg[id];
    saveRegistry(reg);
    lsRemoveProject(id);
    serverDeleteProject(id);
  }

  function setReadOnlyProject(data) {
    _current = data;
    _readOnly = true;
    _history = [];
    _future = [];
    _editDirty = false;
    _notify();
  }

  function isReadOnly() { return _readOnly; }
  function getCurrentProject() { return _current; }

  function commitChange(mutatorFn, label) {
    if (!_current || _readOnly) return;
    _pushHistory(_snap());
    _editDirty = false;
    mutatorFn(_current);
    _current._authorMeta = _current._authorMeta || {};
    _current._authorMeta.updatedAt = new Date().toISOString();
    _current._authorMeta.lastAction = label || 'edit';
    _persist();
    _notify();
    if (_commitCallback) _commitCallback(label);
  }

  function snapshotBeforeEdit() {
    if (!_current || _readOnly || _editDirty) return;
    _pushHistory(_snap());
    _editDirty = true;
    _notify();
  }

  function persistOnly() {
    if (_readOnly) return;
    _persist();
    _editDirty = false;
  }

  function getAllProjects() {
    var reg = lsGetRegistry();
    return Object.values(reg).sort(function (a, b) {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  AP.state = {
    syncFromServer: syncFromServer,
    createProject: createProject,
    openProject: openProject,
    deleteProject: deleteProject,
    getAllProjects: getAllProjects,
    getCurrentProject: getCurrentProject,
    setReadOnlyProject: setReadOnlyProject,
    isReadOnly: isReadOnly,
    commitChange: commitChange,
    snapshotBeforeEdit: snapshotBeforeEdit,
    persistOnly: persistOnly,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    onUndoChange: function (cb) { _undoCallback = cb; },
    onCommit: function (cb) { _commitCallback = cb; }
  };
})();
