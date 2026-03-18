/* AP -- State & Undo */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var STORAGE_KEY = 'ap_projects';
  var MAX_UNDO = 10;

  function loadRegistry() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveRegistry(reg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reg));
  }

  function loadProject(id) {
    try { return JSON.parse(localStorage.getItem('ap_project_' + id) || 'null'); }
    catch (e) { return null; }
  }

  function saveProject(id, data) {
    localStorage.setItem('ap_project_' + id, JSON.stringify(data));
  }

  function deleteProject(id) {
    var reg = loadRegistry();
    delete reg[id];
    saveRegistry(reg);
    localStorage.removeItem('ap_project_' + id);
  }

  // ── Undo Stack ──
  var _history = [];
  var _future  = [];
  var _current = null;
  var _undoCallback = null;
  var _lastSnapshot = null; // dedup: skip if nothing changed

  function _snapshotStr() {
    return _current ? JSON.stringify(_current) : null;
  }

  function snapshot() {
    if (!_current) return;
    var s = _snapshotStr();
    if (s === _lastSnapshot) return; // nothing changed — skip
    _history.push(s);
    if (_history.length > MAX_UNDO) _history.shift();
    _future = [];
    _lastSnapshot = s;
    _notifyUndo();
  }

  function canUndo() { return _history.length > 0; }
  function canRedo() { return _future.length > 0; }

  function undo() {
    if (!canUndo()) return false;
    _future.push(_snapshotStr());
    var prev = _history.pop();
    _current = JSON.parse(prev);
    _lastSnapshot = prev;
    _persist();
    _notifyUndo();
    return _current;
  }

  function redo() {
    if (!canRedo()) return false;
    _history.push(_snapshotStr());
    var next = _future.pop();
    _current = JSON.parse(next);
    _lastSnapshot = next;
    _persist();
    _notifyUndo();
    return _current;
  }

  function _persist() {
    if (!_current) return;
    var reg = loadRegistry();
    if (!reg[_current.id]) return; // deleted project
    reg[_current.id].updatedAt = new Date().toISOString();
    saveRegistry(reg);
    saveProject(_current.id, _current);
  }

  function _notifyUndo() {
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

    var reg = loadRegistry();
    reg[id] = { id: id, name: name, product: product, createdAt: now, updatedAt: now };
    saveRegistry(reg);
    saveProject(id, project);
    return project;
  }

  function openProject(id) {
    _current = loadProject(id);
    _history = [];
    _future  = [];
    _lastSnapshot = _snapshotStr();
    _notifyUndo();
    return _current;
  }

  function getCurrentProject() { return _current; }

  // commitChange: snapshot BEFORE mutation, then mutate, then persist.
  // Skips snapshot if content hasn't changed (dedup via _lastSnapshot).
  function commitChange(mutatorFn, label) {
    if (!_current) return;
    snapshot(); // snapshot pre-mutation state
    mutatorFn(_current);
    _current._authorMeta = _current._authorMeta || {};
    _current._authorMeta.updatedAt = new Date().toISOString();
    _current._authorMeta.lastAction = label || 'edit';
    _lastSnapshot = _snapshotStr(); // update so next call can dedup
    _persist();
  }

  // persistOnly: save current state without recording undo entry.
  // Use for auto-save of in-place text edits that are already captured
  // by a prior snapshot.
  function persistOnly() {
    _persist();
  }

  function getAllProjects() {
    var reg = loadRegistry();
    return Object.values(reg).sort(function (a, b) {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  AP.state = {
    createProject: createProject,
    openProject: openProject,
    deleteProject: deleteProject,
    getAllProjects: getAllProjects,
    getCurrentProject: getCurrentProject,
    commitChange: commitChange,
    persistOnly: persistOnly,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    onUndoChange: function (cb) { _undoCallback = cb; }
  };
})();
