/* AP -- Export: Generate OB-compatible output + OB ZIP import */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  // Slugify a title for file names
  function slugify(str) {
    return (str || 'untitled').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ── JSZip loader (shared by export + import) ──

  function _ensureJSZip(callback, onError) {
    if (typeof JSZip !== 'undefined') { callback(); return; }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = callback;
    script.onerror = onError || function () {
      AP.ui.toast('Failed to load JSZip library', 'error');
    };
    document.head.appendChild(script);
  }

  // ── Product auto-detection from course ID / title ──

  function _detectProduct(courseJson) {
    var id = (courseJson.id || '').toLowerCase();
    var title = (courseJson.title || '').toLowerCase();
    if (/^cb-/.test(id)) return 'codebeamer';
    if (/^wc/.test(id))  return 'windchill';
    if (/^creo/.test(id)) return 'creo';
    if (title.indexOf('codebeamer') >= 0) return 'codebeamer';
    if (title.indexOf('windchill') >= 0)  return 'windchill';
    if (title.indexOf('creo') >= 0)       return 'creo';
    return 'codebeamer';
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
        var topics = (mod.topics || []).filter(function (t) { return !_isKnowledgeCheckTopic(t); });
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
  // Knowledge Check topics are excluded — their questions go into the quiz JSON instead
  function buildModuleJson(mod, modIdx) {
    var contentTopics = (mod.topics || []).filter(function (topic) {
      return !_isKnowledgeCheckTopic(topic);
    });
    return {
      id: 'm' + (modIdx + 1),
      title: mod.title,
      description: mod.description || '',
      topics: contentTopics.map(function (topic, tIdx) {
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

  // Check if a topic is a Knowledge Check (contains only knowledge-check blocks)
  function _isKnowledgeCheckTopic(topic) {
    var content = topic.content || [];
    return content.length > 0 && content.every(function (b) { return b.type === 'knowledge-check'; });
  }

  // Build quiz JSON — extract from knowledge-check topic blocks, fall back to _quizzes, then empty stub
  function buildQuizJson(project, mod, modIdx) {
    var moduleId = 'm' + (modIdx + 1);

    // First: look for knowledge-check blocks in topics (authorable source of truth)
    var questions = [];
    (mod.topics || []).forEach(function (topic) {
      (topic.content || []).forEach(function (block) {
        if (block.type === 'knowledge-check' && block.questions) {
          questions = questions.concat(block.questions);
        }
      });
    });
    if (questions.length) {
      return { moduleId: moduleId, title: mod.title + ' Knowledge Check', questions: questions };
    }

    // Fall back to stored _quizzes (from original import)
    if (project._quizzes) {
      var match = project._quizzes.find(function (q) {
        return q.moduleId === mod.id || q.moduleId === moduleId;
      });
      if (match) return { moduleId: moduleId, title: match.title, questions: match.questions || [] };
    }
    return { moduleId: moduleId, title: mod.title + ' Knowledge Check', questions: [] };
  }

  // Build glossary JSON — use stored glossary data if available, otherwise empty stub
  function buildGlossaryJson(project) {
    if (project._glossary && project._glossary.terms && project._glossary.terms.length) {
      return project._glossary;
    }
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
    files['glossary.json'] = JSON.stringify(buildGlossaryJson(project), null, 2);

    (project.modules || []).forEach(function (mod, idx) {
      var slug = slugify(mod.title);
      files['modules/' + slug + '.json']            = JSON.stringify(buildModuleJson(mod, idx), null, 2);
      files['quizzes/q' + (idx + 1) + '-' + slug + '.json'] = JSON.stringify(buildQuizJson(project, mod, idx), null, 2);
    });

    _ensureJSZip(
      function () { _downloadZip(courseId, files); },
      function () { _downloadIndividual(courseId, files); }
    );
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

  // ── Import: detect ZIP vs JSON and branch ──

  function importProject(file) {
    var name = (file.name || '').toLowerCase();
    if (name.endsWith('.zip')) {
      _importObZip(file);
    } else {
      _importJson(file);
    }
  }

  // Import a single project JSON (AP internal format — existing behavior)
  function _importJson(file) {
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

  // ── OB ZIP import: reassemble course.json + modules/*.json ──
  // Supports two ZIP formats:
  //   1. Raw course ZIP: course.json + modules/ + quizzes/ + glossary.json
  //   2. Standalone PWA ZIP: courses/{id}/bundles/en.js with OB._courseBundle

  function _importObZip(file) {
    _ensureJSZip(function () {
      JSZip.loadAsync(file).then(function (zip) {
        _locateCourseJson(zip).then(function (result) {
          if (!result) {
            // Try standalone PWA bundle format
            return _extractFromBundle(zip).then(function (bundleResult) {
              if (!bundleResult) {
                AP.ui.toast('No course data found — is this an OB course export?', 'error');
                return;
              }
              _reassembleFromBundle(bundleResult);
            });
          }
          _reassembleCourse(zip, result.courseJson, result.basePath);
        });
      }).catch(function () {
        AP.ui.toast('Not a valid ZIP file', 'error');
      });
    }, function () {
      AP.ui.toast('ZIP import requires JSZip (CDN unreachable)', 'error');
    });
  }

  // Find course.json at root or one level deep
  function _locateCourseJson(zip) {
    // Try root first
    var rootFile = zip.file('course.json');
    if (rootFile) {
      return rootFile.async('string').then(function (txt) {
        return { courseJson: JSON.parse(txt), basePath: '' };
      });
    }
    // Try one level deep: {folder}/course.json
    var files = Object.keys(zip.files);
    for (var i = 0; i < files.length; i++) {
      var parts = files[i].split('/');
      if (parts.length === 2 && parts[1] === 'course.json') {
        var folder = parts[0];
        return zip.file(files[i]).async('string').then(function (txt) {
          return { courseJson: JSON.parse(txt), basePath: folder + '/' };
        });
      }
    }
    return Promise.resolve(null);
  }

  // Extract course data from a standalone PWA bundle (courses/{id}/bundles/en.js)
  // The bundle wraps all JSON in: OB._courseBundle = { "course.json": {...}, "modules/...": {...}, ... }
  function _extractFromBundle(zip) {
    var files = Object.keys(zip.files);
    var bundlePath = null;
    for (var i = 0; i < files.length; i++) {
      if (/\/bundles\/en\.js$/.test(files[i])) {
        bundlePath = files[i];
        break;
      }
    }
    if (!bundlePath) return Promise.resolve(null);

    return zip.file(bundlePath).async('string').then(function (js) {
      // Extract the JSON object from: OB._courseBundle = { ... };
      // The IIFE wrapper is (function(){ ... })(); — its close is })()" not "};"
      // So the last "};" in the file IS the bundle object close
      var start = js.indexOf('_courseBundle');
      if (start < 0) return null;
      var braceStart = js.indexOf('{', start);
      if (braceStart < 0) return null;
      var bundleEnd = js.lastIndexOf('};');
      if (bundleEnd <= braceStart) return null;
      var jsonStr = js.substring(braceStart, bundleEnd + 1);
      var bundle = JSON.parse(jsonStr);
      return bundle;
    }).catch(function () { return null; });
  }

  // Reassemble a project from a parsed bundle object (keys are file paths like "course.json", "modules/m1-slug.json")
  function _reassembleFromBundle(bundle) {
    var courseJson = bundle['course.json'];
    if (!courseJson) {
      AP.ui.toast('Bundle missing course.json', 'error');
      return;
    }

    var modules = courseJson.modules || [];
    if (!modules.length) {
      AP.ui.toast('course.json contains no modules', 'error');
      return;
    }

    var flatModules = [];
    var skipped = 0;
    var quizzes = [];
    var quizTopicCount = 0;

    modules.forEach(function (courseMod) {
      var modData = bundle[courseMod.contentFile];
      if (!modData) { skipped++; return; }
      var topics = (modData.topics || []).map(function (topic) {
        var t = {
          id: topic.id,
          title: topic.title,
          estimatedMinutes: topic.estimatedMinutes || 0,
          content: topic.content || [],
          keyTakeaways: topic.keyTakeaways || []
        };
        if (topic.isExercise) t.isExercise = true;
        return t;
      });

      // Append Knowledge Check topic from quiz data
      var quizData = bundle[courseMod.quizFile];
      if (quizData && quizData.questions && quizData.questions.length) {
        quizzes.push(quizData);
        var kcTopic = _quizToTopic(quizData, modData.id || courseMod.id);
        if (kcTopic) { topics.push(kcTopic); quizTopicCount++; }
      }

      flatModules.push({
        id: modData.id || courseMod.id,
        title: modData.title || courseMod.title,
        description: modData.description || courseMod.description || '',
        estimatedMinutes: courseMod.estimatedMinutes || 0,
        topics: topics
      });
    });

    if (!flatModules.length) {
      AP.ui.toast('No module data could be read from bundle', 'error');
      return;
    }

    var skeleton = {
      title: courseJson.title || 'Imported Course',
      description: courseJson.description || '',
      modules: flatModules
    };

    if (quizzes.length) skeleton._quizzes = quizzes;

    var glossaryData = bundle['glossary.json'];
    if (glossaryData && glossaryData.terms && glossaryData.terms.length) {
      skeleton._glossary = glossaryData;
    }

    skeleton._obMeta = {
      courseId: courseJson.id,
      prerequisite: courseJson.prerequisite || null
    };

    var product = _detectProduct(courseJson);
    var project = AP.state.createProject(courseJson.title || 'Imported Course', product, skeleton);

    var msg = 'Imported ' + flatModules.length + ' modules';
    if (quizTopicCount) msg += ', ' + quizTopicCount + ' knowledge checks';
    if (glossaryData && glossaryData.terms && glossaryData.terms.length) {
      msg += ', ' + glossaryData.terms.length + ' glossary terms';
    }
    if (skipped) msg += ' (' + skipped + ' modules skipped — data missing)';
    AP.ui.toast(msg, 'success', 4000);
    AP.router.go('editor', project.id);
  }

  // Read a ZIP file as parsed JSON, returning null on failure
  function _readZipJson(zip, path) {
    var f = zip.file(path);
    if (!f) return Promise.resolve(null);
    return f.async('string').then(function (txt) {
      return JSON.parse(txt);
    }).catch(function () { return null; });
  }

  // Convert quiz data into a Knowledge Check topic appended to a module
  function _quizToTopic(quizData, moduleId) {
    if (!quizData || !quizData.questions || !quizData.questions.length) return null;
    return {
      id: moduleId + '-kc',
      title: quizData.title || 'Knowledge Check',
      estimatedMinutes: Math.max(5, quizData.questions.length * 2),
      content: [{
        type: 'knowledge-check',
        questions: quizData.questions.map(function (q) {
          return {
            id: q.id || '',
            question: q.question || '',
            options: q.options || [],
            answerIndex: q.answerIndex || 0,
            rationale: q.rationale || '',
            topic: q.topic || ''
          };
        })
      }],
      keyTakeaways: []
    };
  }

  // Reassemble the multi-file OB structure into a flat internal project
  function _reassembleCourse(zip, courseJson, basePath) {
    var modules = courseJson.modules || [];
    if (!modules.length) {
      AP.ui.toast('course.json contains no modules', 'error');
      return;
    }

    // Read all module files + glossary + quizzes in parallel
    var modulePromises = modules.map(function (mod) {
      return _readZipJson(zip, basePath + mod.contentFile);
    });
    var quizPromises = modules.map(function (mod) {
      return mod.quizFile ? _readZipJson(zip, basePath + mod.quizFile) : Promise.resolve(null);
    });
    var glossaryPromise = _readZipJson(zip, basePath + 'glossary.json');

    Promise.all([
      Promise.all(modulePromises),
      Promise.all(quizPromises),
      glossaryPromise
    ]).then(function (results) {
      var moduleDataArr = results[0];
      var quizDataArr   = results[1];
      var glossaryData  = results[2];

      // Build flat module array from loaded module JSONs
      var flatModules = [];
      var skipped = 0;
      var quizTopicCount = 0;
      modules.forEach(function (courseMod, idx) {
        var modData = moduleDataArr[idx];
        if (!modData) { skipped++; return; }
        var topics = (modData.topics || []).map(function (topic) {
          var t = {
            id: topic.id,
            title: topic.title,
            estimatedMinutes: topic.estimatedMinutes || 0,
            content: topic.content || [],
            keyTakeaways: topic.keyTakeaways || []
          };
          if (topic.isExercise) t.isExercise = true;
          return t;
        });

        // Append Knowledge Check topic from quiz data
        var quizData = quizDataArr[idx];
        var kcTopic = _quizToTopic(quizData, modData.id || courseMod.id);
        if (kcTopic) { topics.push(kcTopic); quizTopicCount++; }

        flatModules.push({
          id: modData.id || courseMod.id,
          title: modData.title || courseMod.title,
          description: modData.description || courseMod.description || '',
          estimatedMinutes: courseMod.estimatedMinutes || 0,
          topics: topics
        });
      });

      if (!flatModules.length) {
        AP.ui.toast('No module files could be read from ZIP', 'error');
        return;
      }

      // Build the skeleton for createProject
      var skeleton = {
        title: courseJson.title || 'Imported Course',
        description: courseJson.description || '',
        modules: flatModules
      };

      // Preserve raw quiz data for round-trip export
      var quizzes = quizDataArr.filter(function (q) { return q && q.questions && q.questions.length; });
      if (quizzes.length) skeleton._quizzes = quizzes;

      // Preserve glossary data for round-trip
      if (glossaryData && glossaryData.terms && glossaryData.terms.length) {
        skeleton._glossary = glossaryData;
      }

      // Preserve OB metadata for round-trip
      skeleton._obMeta = {
        courseId: courseJson.id,
        prerequisite: courseJson.prerequisite || null
      };

      var product = _detectProduct(courseJson);
      var project = AP.state.createProject(courseJson.title || 'Imported Course', product, skeleton);

      var msg = 'Imported ' + flatModules.length + ' modules';
      if (quizTopicCount) msg += ', ' + quizTopicCount + ' knowledge checks';
      if (glossaryData && glossaryData.terms && glossaryData.terms.length) {
        msg += ', ' + glossaryData.terms.length + ' glossary terms';
      }
      if (skipped) msg += ' (' + skipped + ' modules skipped — files missing)';
      AP.ui.toast(msg, 'success', 4000);
      AP.router.go('editor', project.id);
    }).catch(function (err) {
      AP.ui.toast('Import failed: ' + (err.message || err), 'error');
    });
  }

  AP.exportMgr = {
    exportProject: exportProject,
    importProject: importProject,
    // Exposed for PWA export
    buildCourseJson: buildCourseJson,
    buildModuleJson: buildModuleJson,
    buildQuizJson: buildQuizJson,
    buildGlossaryJson: buildGlossaryJson,
    slugify: slugify,
    ensureJSZip: _ensureJSZip
  };
})();
