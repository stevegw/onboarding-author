/* AP -- Publish: generate static JSON for GitHub Pages viewing */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var INDEX_PATH = 'published/index.json';
  var _cachedIndex = null;

  // Fetch the published index, caching the result
  function fetchIndex(callback) {
    if (_cachedIndex) { callback(null, _cachedIndex); return; }
    fetch(INDEX_PATH + '?t=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        _cachedIndex = data;
        callback(null, data);
      })
      .catch(function () {
        var empty = { version: 1, updatedAt: null, projects: [] };
        callback(null, empty);
      });
  }

  // Fetch an individual published project JSON
  function fetchProject(filePath, callback) {
    fetch(filePath + '?t=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { callback(null, data); })
      .catch(function (err) { callback(err.message || 'Failed to load project'); });
  }

  // Publish current project: generate ZIP with index + project JSON
  function publishProject() {
    var project = AP.state.getCurrentProject();
    if (!project) { AP.ui.toast('No project open', 'error'); return; }

    // Fetch existing index to preserve other published projects
    fetchIndex(function (err, existingIndex) {
      var index = existingIndex || { version: 1, updatedAt: null, projects: [] };

      // Deep-clone project and strip _authorMeta
      var data = JSON.parse(JSON.stringify(project));
      delete data._authorMeta;

      var stats = AP.catalog.countStats(project);
      var now = new Date().toISOString();
      var filePath = 'published/' + project.id + '.json';

      // Upsert into index
      var entry = {
        id: project.id,
        name: project.title || 'Untitled',
        product: (project._authorMeta && project._authorMeta.product) || project.product || '',
        description: project.description || '',
        publishedAt: now,
        stats: stats,
        file: filePath
      };

      var found = false;
      index.projects = index.projects.map(function (p) {
        if (p.id === project.id) { found = true; return entry; }
        return p;
      });
      if (!found) index.projects.push(entry);
      index.updatedAt = now;

      // Build ZIP
      _buildZip(index, filePath, data);
    });
  }

  function _buildZip(index, filePath, projectData) {
    if (typeof JSZip !== 'undefined') {
      _doZip(index, filePath, projectData);
    } else {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = function () { _doZip(index, filePath, projectData); };
      script.onerror = function () {
        AP.ui.toast('Failed to load JSZip — cannot generate publish ZIP', 'error');
      };
      document.head.appendChild(script);
    }
  }

  function _doZip(index, filePath, projectData) {
    var zip = new JSZip();
    zip.file(INDEX_PATH, JSON.stringify(index, null, 2));
    zip.file(filePath, JSON.stringify(projectData, null, 2));

    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'published-content.zip';
      a.click();
      URL.revokeObjectURL(url);

      // Clear cache so next fetch picks up new data
      _cachedIndex = null;

      AP.ui.toast('Download complete. Extract to repo root, commit & push to deploy.', 'success', 5000);
    });
  }

  AP.publish = {
    publishProject: publishProject,
    fetchIndex: fetchIndex,
    fetchProject: fetchProject
  };
})();
