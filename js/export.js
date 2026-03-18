/* AP -- Export: Generate OB-compatible output */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  // Slugify a title for file names
  function slugify(str) {
    return (str || 'untitled').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Build course.json (OB format)
  function buildCourseJson(project) {
    var id = slugify(project.title);
    return {
      id: id,
      title: project.title || 'Untitled Course',
      description: project.description || '',
      prerequisite: null,
      modules: (project.modules || []).map(function (mod, idx) {
        var topics = mod.topics || [];
        var exerciseStart = topics.findIndex(function (t) { return t.isExercise; });
        var obj = {
          id: 'm' + (idx + 1),
          title: mod.title,
          description: mod.description || '',
          estimatedMinutes: topics.reduce(function (s, t) { return s + (t.estimatedMinutes || 0); }, 0),
          topicCount: topics.length,
          contentFile: 'modules/' + slugify(mod.title) + '.json',
          quizFile: 'quizzes/q' + (idx + 1) + '-' + slugify(mod.title) + '.json'
        };
        if (exerciseStart >= 0) obj.exerciseTopicStart = exerciseStart + 1;
        return obj;
      })
    };
  }

  // Build a module JSON (OB format)
  function buildModuleJson(mod, modIdx) {
    return {
      id: 'm' + (modIdx + 1),
      title: mod.title,
      description: mod.description || '',
      topics: (mod.topics || []).map(function (topic, tIdx) {
        var t = {
          id: 'm' + (modIdx + 1) + 't' + (tIdx + 1),
          title: topic.title,
          estimatedMinutes: topic.estimatedMinutes || 0,
          content: topic.content || [],
          keyTakeaways: topic.keyTakeaways || []
        };
        if (topic.isExercise) t.isExercise = true;
        return t;
      })
    };
  }

  // Build an empty quiz JSON
  function buildQuizJson(mod, modIdx) {
    return {
      moduleId: 'm' + (modIdx + 1),
      title: mod.title + ' Knowledge Check',
      questions: []
    };
  }

  // Build glossary JSON skeleton
  function buildGlossaryJson() {
    return { terms: [] };
  }

  // Download all files as a structured ZIP using JSZip if available,
  // otherwise fall back to individual JSON downloads
  function exportProject() {
    var project = AP.state.getCurrentProject();
    if (!project) { AP.ui.toast('No project open', 'error'); return; }

    var courseJson   = buildCourseJson(project);
    var courseId     = courseJson.id;
    var files        = {};

    files['course.json']   = JSON.stringify(courseJson, null, 2);
    files['glossary.json'] = JSON.stringify(buildGlossaryJson(), null, 2);

    (project.modules || []).forEach(function (mod, idx) {
      var slug = slugify(mod.title);
      files['modules/' + slug + '.json']            = JSON.stringify(buildModuleJson(mod, idx), null, 2);
      files['quizzes/q' + (idx + 1) + '-' + slug + '.json'] = JSON.stringify(buildQuizJson(mod, idx), null, 2);
    });

    // Try JSZip
    if (typeof JSZip !== 'undefined') {
      _downloadZip(courseId, files);
    } else {
      // Load JSZip then zip
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = function () { _downloadZip(courseId, files); };
      script.onerror = function () { _downloadIndividual(courseId, files); };
      document.head.appendChild(script);
    }
  }

  function _downloadZip(courseId, files) {
    var zip = new JSZip();
    var folder = zip.folder(courseId);
    Object.entries(files).forEach(function (entry) {
      folder.file(entry[0], entry[1]);
    });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a   = document.createElement('a');
      a.href  = url;
      a.download = courseId + '.zip';
      a.click();
      URL.revokeObjectURL(url);
      AP.ui.toast('Exported ' + courseId + '.zip', 'success', 3500);
    });
  }

  function _downloadIndividual(courseId, files) {
    // Fallback: download course.json + a combined manifest
    AP.ui.downloadJson(courseId + '-course.json', JSON.parse(files['course.json']));
    AP.ui.toast('JSZip unavailable — downloaded course.json only. Install JSZip for full export.', 'warning', 5000);
  }

  // Import a project JSON (AP internal format)
  function importProject(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data.modules) throw new Error('Not a valid project file');
        var name = data.title || 'Imported Project';
        var product = (data._authorMeta && data._authorMeta.product) || data.product || 'codebeamer';
        var project = AP.state.createProject(name, product, data);
        AP.ui.toast('Project imported!', 'success');
        AP.router.go('editor', project.id);
      } catch (err) {
        AP.ui.toast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  AP.exportMgr = {
    exportProject: exportProject,
    importProject: importProject
  };
})();
