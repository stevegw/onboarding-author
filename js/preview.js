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
      case 'knowledge-check': return _knowledgeCheck(block);
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
    pairs.forEach(function (p, i) {
      html += '<div class="preview-match-item match-left" data-pair="' + i + '">' + safeHtml(p.left) + '</div>';
    });
    html += '</div>';
    html += '<div class="preview-match-col">';
    html += '<div class="preview-match-label">Matches</div>';
    // Show shuffled but track original pair index
    var shuffled = pairs.map(function (p, i) { return { right: p.right, idx: i }; });
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    shuffled.forEach(function (s) {
      html += '<div class="preview-match-item match-right" data-pair="' + s.idx + '">' + safeHtml(s.right) + '</div>';
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
      html += '<div class="preview-sort-item" draggable="true" data-correct="' + s.idx + '">';
      html += '<span class="preview-sort-handle">☰</span>';
      html += '<span class="preview-sort-num">' + (si + 1) + '</span>';
      html += '<span>' + safeHtml(s.text) + '</span>';
      html += '</div>';
    });
    html += '<button class="preview-sort-check" type="button">Check Order</button>';
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

  function _knowledgeCheck(block) {
    var questions = block.questions || [];
    if (!questions.length) return '<p class="preview-empty">No quiz questions</p>';
    var html = '<div class="preview-knowledge-check">';
    html += '<h3 class="preview-kc-title">Knowledge Check</h3>';
    questions.forEach(function (q, qi) {
      html += '<div class="preview-kc-question" data-kc-q="' + qi + '">';
      html += '<p class="preview-kc-q-text"><strong>Q' + (qi + 1) + '.</strong> ' + safeHtml(q.question) + '</p>';
      html += '<div class="preview-kc-options">';
      (q.options || []).forEach(function (opt, oi) {
        html += '<div class="preview-kc-option" data-kc-opt="' + oi + '" data-kc-correct="' + (oi === q.answerIndex) + '">';
        html += '<span class="preview-kc-radio"></span>';
        html += '<span>' + safeHtml(opt) + '</span>';
        html += '</div>';
      });
      html += '</div>';
      if (q.rationale) {
        html += '<div class="preview-kc-rationale">' + safeHtml(q.rationale) + '</div>';
      }
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

    // Knowledge check: click option to answer
    container.querySelectorAll('.preview-knowledge-check').forEach(function (kcEl) {
      var totalQs = kcEl.querySelectorAll('.preview-kc-question').length;
      var correctCount = 0;
      var answeredCount = 0;

      kcEl.querySelectorAll('.preview-kc-question').forEach(function (qEl) {
        var answered = false;
        qEl.querySelectorAll('.preview-kc-option').forEach(function (optEl) {
          optEl.addEventListener('click', function () {
            if (answered) return;
            answered = true;
            answeredCount++;
            var isCorrect = optEl.getAttribute('data-kc-correct') === 'true';
            if (isCorrect) correctCount++;
            optEl.classList.add(isCorrect ? 'kc-correct' : 'kc-incorrect');
            // Highlight the correct answer
            qEl.querySelectorAll('.preview-kc-option').forEach(function (o) {
              if (o.getAttribute('data-kc-correct') === 'true') o.classList.add('kc-correct');
            });
            // Show rationale
            var rat = qEl.querySelector('.preview-kc-rationale');
            if (rat) rat.classList.add('kc-visible');
            qEl.classList.add('kc-answered');

            // Check if all questions answered
            if (answeredCount === totalQs) {
              var pct = Math.round(correctCount / totalQs * 100);
              var msg = correctCount === totalQs ? '\uD83C\uDFC6 Great job!' : pct >= 75 ? '\u2B50 Good effort!' : '\uD83D\uDCDA Keep studying!';
              if (AP.ui && AP.ui.toast) AP.ui.toast(msg + ' ' + correctCount + '/' + totalQs + ' (' + pct + '%)', pct >= 75 ? 'success' : 'info');
            }
          });
        });
      });
    });

    // Interactive match: click left then right to match
    container.querySelectorAll('.preview-match').forEach(function (matchEl) {
      var selectedLeft = null;

      matchEl.querySelectorAll('.match-left').forEach(function (leftEl) {
        leftEl.addEventListener('click', function () {
          if (leftEl.classList.contains('match-done')) return;
          // Deselect previous
          if (selectedLeft) selectedLeft.classList.remove('match-selected');
          selectedLeft = leftEl;
          leftEl.classList.add('match-selected');
        });
      });

      matchEl.querySelectorAll('.match-right').forEach(function (rightEl) {
        rightEl.addEventListener('click', function () {
          if (!selectedLeft || rightEl.classList.contains('match-done')) return;
          var leftPair = selectedLeft.getAttribute('data-pair');
          var rightPair = rightEl.getAttribute('data-pair');
          var correct = leftPair === rightPair;

          var thisLeft = selectedLeft;
          thisLeft.classList.remove('match-selected');
          selectedLeft = null;
          if (correct) {
            thisLeft.classList.add('match-done', 'match-correct');
            rightEl.classList.add('match-done', 'match-correct');
            // Check if all matched
            var total = matchEl.querySelectorAll('.match-left').length;
            var done = matchEl.querySelectorAll('.match-left.match-done').length;
            if (done === total) {
              if (AP.ui && AP.ui.toast) AP.ui.toast('\u2713 All matched correctly!', 'success');
            }
          } else {
            thisLeft.classList.add('match-wrong');
            rightEl.classList.add('match-wrong');
            setTimeout(function () {
              thisLeft.classList.remove('match-wrong');
              rightEl.classList.remove('match-wrong');
            }, 800);
          }
        });
      });
    });

    // Interactive sort: drag to reorder
    container.querySelectorAll('.preview-sort').forEach(function (sortEl) {
      var dragItem = null;

      sortEl.querySelectorAll('.preview-sort-item').forEach(function (item) {
        item.addEventListener('dragstart', function (e) {
          dragItem = item;
          item.classList.add('sort-dragging');
          e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', function () {
          item.classList.remove('sort-dragging');
          dragItem = null;
          // Remove all drop indicators
          sortEl.querySelectorAll('.sort-over').forEach(function (el) {
            el.classList.remove('sort-over');
          });
          // Re-number items
          sortEl.querySelectorAll('.preview-sort-item').forEach(function (el, i) {
            var num = el.querySelector('.preview-sort-num');
            if (num) num.textContent = i + 1;
          });
        });

        item.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (item !== dragItem) {
            item.classList.add('sort-over');
          }
        });

        item.addEventListener('dragleave', function () {
          item.classList.remove('sort-over');
        });

        item.addEventListener('drop', function (e) {
          e.preventDefault();
          item.classList.remove('sort-over');
          if (dragItem && dragItem !== item) {
            // Insert dragged item before or after the drop target
            var items = Array.prototype.slice.call(sortEl.querySelectorAll('.preview-sort-item'));
            var dragIdx = items.indexOf(dragItem);
            var dropIdx = items.indexOf(item);
            if (dragIdx < dropIdx) {
              sortEl.insertBefore(dragItem, item.nextSibling);
            } else {
              sortEl.insertBefore(dragItem, item);
            }
          }
        });
      });

      // Check order button
      var checkBtn = sortEl.querySelector('.preview-sort-check');
      if (checkBtn) {
        checkBtn.addEventListener('click', function () {
          var allCorrect = true;
          sortEl.querySelectorAll('.preview-sort-item').forEach(function (el, i) {
            var correct = parseInt(el.getAttribute('data-correct'), 10) === i;
            el.classList.remove('sort-correct', 'sort-incorrect');
            el.classList.add(correct ? 'sort-correct' : 'sort-incorrect');
            if (!correct) allCorrect = false;
          });
          checkBtn.textContent = allCorrect ? '\u2713 Correct!' : 'Try again';
          checkBtn.classList.toggle('sort-check-correct', allCorrect);
        });
      }
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
