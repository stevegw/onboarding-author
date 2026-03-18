/* AP -- Narration / TTS Preview */
/* Uses Web Speech API to narrate topic content for authoring preview */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var _synth    = window.speechSynthesis || null;
  var _voices   = [];
  var _enabled  = false;
  var _rate     = 1.0;
  var _voiceIdx = 0;

  function isSupported() { return !!_synth; }

  function init() {
    if (!isSupported()) return;

    // Render the narration panel into sidebar
    var sidebar = AP.ui.qs('#sidebar');
    if (!sidebar) return;

    var panel = AP.ui.el('div', { class: 'narration-panel', id: 'narration-panel' });
    panel.innerHTML = [
      '<div class="narration-panel-header">',
        '<span class="narration-label">Narration Preview</span>',
        '<button class="narr-btn" id="narr-toggle" title="Enable narration">🔇</button>',
      '</div>',
      '<div class="narration-controls" id="narr-controls" style="display:none">',
        '<button class="narr-btn" id="narr-play" title="Play">▶</button>',
        '<button class="narr-btn" id="narr-stop" title="Stop">■</button>',
        '<select class="narr-select" id="narr-voice" title="Voice"></select>',
        '<select class="narr-select" id="narr-rate" title="Speed">',
          '<option value="0.75">0.75×</option>',
          '<option value="1" selected>1×</option>',
          '<option value="1.25">1.25×</option>',
          '<option value="1.5">1.5×</option>',
        '</select>',
      '</div>'
    ].join('');
    sidebar.appendChild(panel);

    // Load voices (async in Chrome)
    function loadVoices() {
      _voices = _synth.getVoices().filter(function (v) {
        return v.lang.startsWith('en');
      });
      var sel = AP.ui.qs('#narr-voice');
      if (!sel) return;
      sel.innerHTML = '';
      _voices.forEach(function (v, i) {
        var o = document.createElement('option');
        o.value = i;
        o.textContent = v.name.replace(/\s*\(.*?\)/, '').substring(0, 22);
        sel.appendChild(o);
      });
    }

    loadVoices();
    if (_synth.onvoiceschanged !== undefined) {
      _synth.onvoiceschanged = loadVoices;
    }

    // Toggle enable
    AP.ui.qs('#narr-toggle').onclick = function () {
      _enabled = !_enabled;
      this.textContent = _enabled ? '🔊' : '🔇';
      AP.ui.qs('#narr-controls').style.display = _enabled ? 'flex' : 'none';
      if (!_enabled) _synth.cancel();
    };

    // Play
    AP.ui.qs('#narr-play').onclick = function () {
      if (!_enabled) return;
      _speak(_extractText());
    };

    // Stop
    AP.ui.qs('#narr-stop').onclick = function () {
      _synth.cancel();
    };

    // Voice select
    AP.ui.qs('#narr-voice').onchange = function () {
      _voiceIdx = parseInt(this.value) || 0;
    };

    // Rate select
    AP.ui.qs('#narr-rate').onchange = function () {
      _rate = parseFloat(this.value) || 1.0;
    };
  }

  function _speak(text) {
    if (!_synth || !text) return;
    _synth.cancel();
    var utt = new SpeechSynthesisUtterance(text);
    utt.rate = _rate;
    if (_voices[_voiceIdx]) utt.voice = _voices[_voiceIdx];
    _synth.speak(utt);
  }

  // Extract plain text from the current project's active topic
  function _extractText() {
    var project = AP.state.getCurrentProject();
    if (!project) return '';

    // Get active topic via editor state — walk all modules/topics
    var texts = [];
    (project.modules || []).forEach(function (mod) {
      (mod.topics || []).forEach(function (topic) {
        // We only want the currently visible topic — check if it's rendered
        var titleEl = AP.ui.qs('.topic-title-input');
        if (titleEl && titleEl.value === topic.title) {
          texts.push(topic.title + '.');
          (topic.content || []).forEach(function (block) {
            var t = _blockText(block);
            if (t) texts.push(t);
          });
          if (topic.keyTakeaways && topic.keyTakeaways.length) {
            texts.push('Key takeaways.');
            topic.keyTakeaways.forEach(function (tk) { if (tk) texts.push(tk + '.'); });
          }
        }
      });
    });
    return texts.join(' ') || 'No content to narrate.';
  }

  function _blockText(block) {
    if (!block) return '';
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return _stripHtml(block.text || '');
      case 'callout':
        return _stripHtml(block.text || '');
      case 'comparison-table':
        var rows = [block.headers ? block.headers.join(', ') : ''];
        (block.rows || []).forEach(function (r) { rows.push(r.join(', ')); });
        return rows.join('. ');
      case 'reveal-cards':
        return (block.cards || []).map(function (c) {
          return (c.front || '') + ': ' + (c.back || '');
        }).join('. ');
      case 'interactive-match':
        return (block.prompt || '') + '. ' + (block.pairs || []).map(function (p) {
          return p.left + ' matches ' + p.right;
        }).join('. ');
      case 'interactive-sort':
        return (block.prompt || '') + '. Items: ' + (block.items || []).join(', ');
      case 'exercise':
        var parts = [block.title || '', block.objective || ''];
        (block.tasks || []).forEach(function (task) {
          parts.push(task.title || '');
          (task.steps || []).forEach(function (s) { parts.push(s.action || ''); });
        });
        return parts.filter(Boolean).join('. ');
      default:
        return '';
    }
  }

  function _stripHtml(str) {
    return (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  AP.narration = { init: init, isSupported: isSupported };
})();
