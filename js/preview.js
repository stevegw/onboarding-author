/* AP -- Preview Renderer */
/* Renders topic content read-only, matching OB player appearance */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var _mode = 'author'; // 'author' | 'preview'

  function getMode() { return _mode; }

  function setMode(mode) {
    _mode = mode;
    document.body.setAttribute('data-editor-mode', mode);
  }

  function isPreview() { return _mode === 'preview'; }

  // ── Safe HTML: allows <strong>, <em>, <code>, <br> like OB player ──
  function safeHtml(str) {
    if (!str) return '';
    var txt = String(str);
    // Escape everything first
    txt = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Re-allow safe tags
    txt = txt.replace(/&lt;(\/?(strong|em|code|br)\s*\/?)&gt;/gi, '<$1>');
    return txt;
  }

  function esc(str) {
    return AP.ui.escapeHtml(str);
  }

  // ── Render full topic in preview mode ──
  function renderTopic(topic, mod) {
    var html = '';

    // Topic header
    html += '<div class="preview-topic-header">';
    html += '<h1 class="preview-topic-title">' + esc(topic.title) + '</h1>';
    html += '<div class="preview-topic-meta">';
    html += '<span class="preview-badge">' + esc(mod.title) + '</span>';
    html += '<span class="preview-est">~' + (topic.estimatedMinutes || 5) + ' min</span>';
    if (topic.isExercise) {
      html += '<span class="preview-badge preview-badge-exercise">Exercise</span>';
    }
    html += '</div>';
    html += '</div>';

    // Module description
    if (mod.description) {
      html += '<p class="preview-module-desc">' + safeHtml(mod.description) + '</p>';
    }

    // Content blocks
    html += '<div class="preview-content">';
    (topic.content || []).forEach(function (block) {
      html += renderBlock(block);
    });
    html += '</div>';

    // Key takeaways
    if (topic.keyTakeaways && topic.keyTakeaways.length > 0) {
      var hasTakeaways = topic.keyTakeaways.some(function (tk) { return tk && tk.trim(); });
      if (hasTakeaways) {
        html += '<div class="preview-takeaways">';
        html += '<h3>Key Takeaways</h3>';
        html += '<ul>';
        topic.keyTakeaways.forEach(function (tk) {
          if (tk && tk.trim()) {
            html += '<li>' + safeHtml(tk) + '</li>';
          }
        });
        html += '</ul>';
        html += '</div>';
      }
    }

    return html;
  }

  function renderBlock(block) {
    switch (block.type) {
      case 'heading':    return _heading(block);
      case 'paragraph':  return _paragraph(block);
      case 'callout':    return _callout(block);
      case 'comparison-table': return _table(block);
      case 'reveal-cards':     return _revealCards(block);
      case 'interactive-match': return _match(block);
      case 'interactive-sort':  return _sort(block);
      case 'image':      return _image(block);
      case 'exercise':   return _exercise(block);
      default: return '';
    }
  }

  function _heading(block) {
    var tag = block.level === 3 ? 'h3' : 'h2';
    return '<' + tag + ' class="preview-heading">' + safeHtml(block.text) + '</' + tag + '>';
  }

  function _paragraph(block) {
    if (!block.text) return '<p class="preview-paragraph preview-empty">Empty paragraph</p>';
    return '<p class="preview-paragraph">' + safeHtml(block.text) + '</p>';
  }

  function _callout(block) {
    var icons = { info: 'ℹ', tip: '★', warning: '⚠', insight: '💡' };
    var icon = icons[block.variant] || icons.info;
    return '<div class="preview-callout preview-callout-' + (block.variant || 'info') + '">' +
      '<span class="preview-callout-icon">' + icon + '</span>' +
      '<div class="preview-callout-body">' + safeHtml(block.text) + '</div>' +
      '</div>';
  }

  function _table(block) {
    var headers = block.headers || [];
    var rows = block.rows || [];
    if (!headers.length) return '<p class="preview-empty">Empty table</p>';
    var html = '<div class="preview-table-wrap"><table class="preview-table"><thead><tr>';
    headers.forEach(function (h) { html += '<th>' + safeHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      row.forEach(function (cell) { html += '<td>' + safeHtml(cell) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function _revealCards(block) {
    var cards = block.cards || [];
    if (!cards.length) return '';
    var html = '<div class="preview-reveal-grid">';
    cards.forEach(function (card, i) {
      html += '<div class="preview-reveal-card" data-preview-reveal="' + i + '">';
      html += '<div class="preview-reveal-front">' + safeHtml(card.front || 'Card ' + (i + 1)) + '</div>';
      html += '<div class="preview-reveal-hint">Click to reveal</div>';
      html += '<div class="preview-reveal-back">' + safeHtml(card.back) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function _match(block) {
    var pairs = block.pairs || [];
    if (!pairs.length) return '';
    var html = '<div class="preview-match">';
    if (block.prompt) {
      html += '<p class="preview-match-prompt">' + safeHtml(block.prompt) + '</p>';
    }
    html += '<div class="preview-match-columns">';
    html += '<div class="preview-match-col">';
    html += '<div class="preview-match-label">Items</div>';
    pairs.forEach(function (p) {
      html += '<div class="preview-match-item">' + safeHtml(p.left) + '</div>';
    });
    html += '</div>';
    html += '<div class="preview-match-col">';
    html += '<div class="preview-match-label">Matches</div>';
    // Show shuffled
    var shuffled = pairs.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    shuffled.forEach(function (p) {
      html += '<div class="preview-match-item">' + safeHtml(p.right) + '</div>';
    });
    html += '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function _sort(block) {
    var items = block.items || [];
    if (!items.length) return '';
    var html = '<div class="preview-sort">';
    if (block.prompt) {
      html += '<p class="preview-sort-prompt">' + safeHtml(block.prompt) + '</p>';
    }
    // Show shuffled
    var shuffled = items.map(function (item, i) { return { text: item, idx: i }; });
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    shuffled.forEach(function (s, si) {
      html += '<div class="preview-sort-item">';
      html += '<span class="preview-sort-handle">☰</span>';
      html += '<span class="preview-sort-num">' + (si + 1) + '</span>';
      html += '<span>' + safeHtml(s.text) + '</span>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function _image(block) {
    if (!block.src) return '<div class="preview-empty">No image set</div>';
    var sizeClass = block.size ? ' preview-image-' + block.size : '';
    var html = '<figure class="preview-image' + sizeClass + '">';
    html += '<img src="' + esc(block.src) + '" alt="' + esc(block.alt || '') + '">';
    if (block.caption) {
      html += '<figcaption>' + safeHtml(block.caption) + '</figcaption>';
    }
    html += '</figure>';
    return html;
  }

  function _exercise(block) {
    var tasks = block.tasks || [];
    var html = '<div class="preview-exercise">';

    // Objective
    if (block.objective) {
      html += '<div class="preview-exercise-objective">';
      html += '<div class="preview-exercise-label">Objective</div>';
      html += '<p>' + safeHtml(block.objective) + '</p>';
      html += '</div>';
    }

    // Tasks
    tasks.forEach(function (task, ti) {
      html += '<div class="preview-exercise-task">';
      html += '<h4>' + safeHtml(task.title || 'Task ' + (ti + 1)) + '</h4>';
      html += '<div class="preview-exercise-steps">';
      (task.steps || []).forEach(function (step, si) {
        html += '<div class="preview-exercise-step">';
        html += '<span class="preview-step-num">' + (si + 1) + '</span>';
        html += '<div class="preview-step-body">';
        html += '<div class="preview-step-action">' + safeHtml(step.action) + '</div>';
        if (step.detail) {
          html += '<div class="preview-step-detail">' + safeHtml(step.detail) + '</div>';
        }
        if (step.hint) {
          html += '<div class="preview-step-hint">Hint: ' + safeHtml(step.hint) + '</div>';
        }
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  // ── Bind interactive elements in preview ──
  function bindPreviewInteractions(container) {
    // Reveal cards: click to flip
    container.querySelectorAll('.preview-reveal-card').forEach(function (card) {
      card.addEventListener('click', function () {
        card.classList.toggle('flipped');
      });
    });
  }

  AP.preview = {
    getMode: getMode,
    setMode: setMode,
    isPreview: isPreview,
    renderTopic: renderTopic,
    renderBlock: renderBlock,
    bindPreviewInteractions: bindPreviewInteractions
  };
})();
