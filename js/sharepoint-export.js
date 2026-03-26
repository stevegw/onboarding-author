/* AP -- SharePoint Export
 * Single-page accordion: course header, then collapsible modules
 * with collapsible topics nested inside. All <details>/<summary>.
 * Zero JavaScript, zero anchor links, zero form elements.
 */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  function exportSharePoint(project) {
    if (!project) { AP.ui.toast('No project to export', 'error'); return; }

    var slug = AP.exportMgr.slugify(project.title);
    var courseJson = AP.exportMgr.buildCourseJson(project);

    var modulesData = [];
    (project.modules || []).forEach(function (mod, idx) {
      var modJson = AP.exportMgr.buildModuleJson(mod, idx);
      var quizJson = AP.exportMgr.buildQuizJson(project, mod, idx);
      modulesData.push({ course: courseJson.modules[idx], content: modJson, quiz: quizJson });
    });

    var html = _buildHTML(courseJson, modulesData);

    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = slug + '-sharepoint.html';
    a.click();
    URL.revokeObjectURL(url);
    AP.ui.toast('SharePoint file exported: ' + slug + '-sharepoint.html', 'success', 3500);
  }

  function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _safe(s) { if (!s) return ''; var t = _esc(s); return t.replace(/&lt;(\/?(?:strong|em|code|br)\s*\/?)&gt;/gi, '<$1>'); }

  // ── Block renderer ──
  function _renderBlock(b) {
    switch (b.type) {
      case 'heading':
        return '<' + (b.level === 3 ? 'h4' : 'h3') + ' class="bh">' + _safe(b.text) + '</' + (b.level === 3 ? 'h4' : 'h3') + '>';
      case 'paragraph':
        return b.text ? '<p class="bp">' + _safe(b.text) + '</p>' : '';
      case 'callout':
        var cv = b.variant || 'info';
        var ci = { info: '\u2139\uFE0F', tip: '\u2B50', warning: '\u26A0\uFE0F', insight: '\uD83D\uDCA1' };
        return '<div class="co co-' + _esc(cv) + '"><span class="co-i">' + (ci[cv] || ci.info) + '</span><div>' + _safe(b.text) + '</div></div>';
      case 'comparison-table':
        if (!(b.headers || []).length) return '';
        var h = '<div class="tw"><table class="dt"><thead><tr>';
        (b.headers || []).forEach(function (c) { h += '<th>' + _safe(c) + '</th>'; });
        h += '</tr></thead><tbody>';
        (b.rows || []).forEach(function (r) { h += '<tr>'; r.forEach(function (c) { h += '<td>' + _safe(c) + '</td>'; }); h += '</tr>'; });
        return h + '</tbody></table></div>';
      case 'reveal-cards':
        var cards = b.cards || [];
        if (!cards.length) return '';
        var h = '<div class="rc-g">';
        cards.forEach(function (c, i) {
          h += '<details class="rc"><summary class="rc-f">' + _safe(c.front || 'Card ' + (i + 1)) + '<span class="rc-hint">tap to reveal</span></summary>';
          h += '<div class="rc-b">' + _safe(c.back) + '</div></details>';
        });
        return h + '</div>';
      case 'interactive-match':
        var pairs = b.pairs || [];
        if (!pairs.length) return '';
        var h = '';
        if (b.prompt) h += '<p class="im-p">' + _safe(b.prompt) + '</p>';
        h += '<table class="dt"><thead><tr><th>Item</th><th>Match</th></tr></thead><tbody>';
        pairs.forEach(function (p) { h += '<tr><td>' + _safe(p.left) + '</td><td class="td-g">' + _safe(p.right) + '</td></tr>'; });
        return h + '</tbody></table>';
      case 'interactive-sort':
        var items = b.items || [];
        if (!items.length) return '';
        var h = '';
        if (b.prompt) h += '<p class="im-p">' + _safe(b.prompt) + '</p>';
        items.forEach(function (it, i) {
          h += '<div class="so-item"><span class="so-n">' + (i + 1) + '</span><span>' + _safe(it) + '</span></div>';
        });
        return h;
      case 'image':
        if (!b.src) return '';
        return '<figure class="fig"><img src="' + _esc(b.src) + '" alt="' + _esc(b.alt || '') + '">' + (b.caption ? '<figcaption>' + _safe(b.caption) + '</figcaption>' : '') + '</figure>';
      case 'exercise':
        var tasks = b.tasks || [];
        var h = '<div class="ex-box">';
        if (b.objective) h += '<div class="ex-lbl">OBJECTIVE</div><p class="ex-obj">' + _safe(b.objective) + '</p>';
        tasks.forEach(function (task, ti) {
          h += '<div class="ex-task"><h4>' + _safe(task.title || 'Task ' + (ti + 1)) + '</h4>';
          (task.steps || []).forEach(function (s, si) {
            h += '<div class="ex-step"><span class="ex-n">' + (si + 1) + '</span><div><div>' + _safe(s.action) + '</div>';
            if (s.detail) h += '<div class="ex-d">' + _safe(s.detail) + '</div>';
            if (s.hint) h += '<div class="ex-h">Hint: ' + _safe(s.hint) + '</div>';
            h += '</div></div>';
          });
          h += '</div>';
        });
        return h + '</div>';
      case 'knowledge-check':
        return _renderQuizBlock(b.questions || []);
      default:
        return '';
    }
  }

  function _renderQuizBlock(qs) {
    if (!qs.length) return '';
    var h = '<div class="kc"><div class="kc-hd">Knowledge Check</div>';
    qs.forEach(function (q, qi) {
      h += '<div class="kc-q"><p class="kc-qt"><strong>Q' + (qi + 1) + '.</strong> ' + _safe(q.question) + '</p>';
      // Options listed without revealing the answer
      (q.options || []).forEach(function (o, oi) {
        h += '<div class="kc-o"><span class="kc-letter">' + String.fromCharCode(65 + oi) + '.</span><span>' + _safe(o) + '</span></div>';
      });
      // Answer hidden behind click-to-reveal
      var correctLetter = String.fromCharCode(65 + (q.answerIndex || 0));
      var correctText = (q.options && q.options[q.answerIndex]) ? q.options[q.answerIndex] : '';
      h += '<details class="kc-ans"><summary>Show answer</summary><div class="kc-ans-body">';
      h += '<span class="kc-ans-badge">' + correctLetter + '</span> ' + _safe(correctText);
      if (q.rationale) h += '<p class="kc-ans-rat">' + _safe(q.rationale) + '</p>';
      h += '</div></details>';
      h += '</div>';
    });
    return h + '</div>';
  }

  function _buildHTML(courseJson, modulesData) {
    var totalTopics = 0, totalMin = 0;
    modulesData.forEach(function (m) {
      totalTopics += (m.content.topics || []).length;
      totalMin += m.course.estimatedMinutes || 0;
    });

    var h = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
    h += '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n';
    h += '<title>' + _esc(courseJson.title) + '</title>\n';
    h += '<style>\n' + _css() + '\n</style>\n';
    h += '</head>\n<body>\n';

    // ── Course header ──
    h += '<header class="hdr">';
    h += '<div class="hdr-label">PTC Training Course</div>';
    h += '<h1>' + _esc(courseJson.title) + '</h1>';
    if (courseJson.description) h += '<p class="hdr-desc">' + _safe(courseJson.description) + '</p>';
    h += '<div class="hdr-stats">';
    h += '<div class="hdr-stat"><span class="hdr-val">' + modulesData.length + '</span> Modules</div>';
    h += '<div class="hdr-stat"><span class="hdr-val">' + totalTopics + '</span> Topics</div>';
    h += '<div class="hdr-stat"><span class="hdr-val">~' + totalMin + '</span> Minutes</div>';
    h += '</div></header>\n';

    // ── Modules ──
    modulesData.forEach(function (m, mi) {
      h += '<details class="mod">';
      h += '<summary class="mod-hdr">';
      h += '<span class="mod-arrow">\u25B6</span>';
      h += '<div class="mod-info">';
      h += '<div class="mod-num">Module ' + (mi + 1) + '</div>';
      h += '<div class="mod-title">' + _esc(m.content.title) + '</div>';
      h += '</div>';
      h += '<div class="mod-meta">' + (m.content.topics || []).length + ' topics \u2022 ~' + (m.course.estimatedMinutes || 0) + ' min</div>';
      h += '</summary>';

      if (m.content.description) {
        h += '<div class="mod-desc">' + _safe(m.content.description) + '</div>';
      }

      // Topics
      (m.content.topics || []).forEach(function (t, ti) {
        h += '<details class="topic">';
        h += '<summary class="topic-hdr">';
        h += '<span class="topic-dot' + (t.isExercise ? ' topic-dot-ex' : '') + '"></span>';
        h += '<span class="topic-title">' + _esc(t.title) + '</span>';
        h += '<span class="topic-time">~' + (t.estimatedMinutes || 5) + ' min</span>';
        h += '</summary>';
        h += '<div class="topic-body">';

        (t.content || []).forEach(function (b) { h += _renderBlock(b); });

        if (t.keyTakeaways && t.keyTakeaways.length) {
          var has = t.keyTakeaways.some(function (k) { return k && k.trim(); });
          if (has) {
            h += '<div class="tka"><div class="tka-hd">Key Takeaways</div><ul>';
            t.keyTakeaways.forEach(function (k) { if (k && k.trim()) h += '<li><span class="dot dot-g"></span><span>' + _safe(k) + '</span></li>'; });
            h += '</ul></div>';
          }
        }

        h += '</div></details>\n';
      });

      // Quiz
      if (m.quiz && m.quiz.questions && m.quiz.questions.length) {
        h += '<details class="topic topic-quiz">';
        h += '<summary class="topic-hdr">';
        h += '<span class="topic-dot topic-dot-quiz"></span>';
        h += '<span class="topic-title">Knowledge Check</span>';
        h += '<span class="topic-time">' + m.quiz.questions.length + ' questions</span>';
        h += '</summary>';
        h += '<div class="topic-body">';
        h += '<p class="bp" style="margin-bottom:12px">Review your understanding. Correct answers are marked with \u2713</p>';
        h += _renderQuizBlock(m.quiz.questions);
        h += '</div></details>\n';
      }

      h += '</details>\n';
    });

    h += '<footer class="foot">Generated by PTC Authoring Platform</footer>';
    h += '</body></html>';
    return h;
  }

  function _css() {
    return [
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
      'html{scroll-behavior:smooth}',
      'body{font-family:"Segoe UI","Calibri",system-ui,sans-serif;background:#f4f4f2;color:#1c1c1c;line-height:1.6}',
      '',
      '/* ═══ HEADER ═══ */',
      '.hdr{background:#1a1a2e;color:#fff;padding:40px 48px 32px;margin-bottom:2px}',
      '.hdr-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;color:#00A850;margin-bottom:8px}',
      '.hdr h1{font-size:clamp(24px,3.5vw,40px);font-weight:700;line-height:1.15;margin-bottom:10px;max-width:700px}',
      '.hdr-desc{font-size:clamp(13px,1.5vw,16px);color:rgba(255,255,255,.5);max-width:600px;line-height:1.6;margin-bottom:20px}',
      '.hdr-stats{display:flex;gap:24px;flex-wrap:wrap}',
      '.hdr-stat{font-size:12px;color:rgba(255,255,255,.4)}',
      '.hdr-val{font-weight:700;color:#00A850;font-size:14px;margin-right:3px}',
      '',
      '/* ═══ MODULE ═══ */',
      '.mod{background:#fff;margin-bottom:2px;border-left:4px solid transparent;transition:border-color .15s}',
      '.mod[open]{border-left-color:#00A850}',
      '.mod-hdr{display:flex;align-items:center;gap:14px;padding:16px 24px;cursor:pointer;list-style:none;transition:background .12s}',
      '.mod-hdr::-webkit-details-marker{display:none}',
      '.mod-hdr::marker{display:none;content:""}',
      '.mod-hdr:hover{background:rgba(0,168,80,.03)}',
      '.mod-arrow{font-size:10px;color:#bbb;transition:transform .2s;flex-shrink:0;width:16px;text-align:center}',
      '.mod[open]>.mod-hdr .mod-arrow{transform:rotate(90deg);color:#00A850}',
      '.mod-info{flex:1;min-width:0}',
      '.mod-num{font-size:10px;font-weight:700;color:#00A850;letter-spacing:.8px;text-transform:uppercase;margin-bottom:1px}',
      '.mod-title{font-size:clamp(15px,1.8vw,19px);font-weight:600;color:#1c1c1c}',
      '.mod-meta{font-size:11px;color:#8a8d90;flex-shrink:0;white-space:nowrap}',
      '.mod-desc{padding:0 24px 12px 54px;font-size:13px;color:#6b6e72;line-height:1.6}',
      '',
      '/* ═══ TOPIC ═══ */',
      '.topic{margin:0 16px 2px 40px;border-radius:6px;border:1px solid #eee;overflow:hidden;transition:border-color .15s}',
      '.topic[open]{border-color:#00A850}',
      '.topic:last-child{margin-bottom:16px}',
      '.topic-hdr{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;list-style:none;font-size:13px;transition:background .12s}',
      '.topic-hdr::-webkit-details-marker{display:none}',
      '.topic-hdr::marker{display:none;content:""}',
      '.topic-hdr:hover{background:rgba(0,168,80,.04)}',
      '.topic[open]>.topic-hdr{background:rgba(0,168,80,.06);border-bottom:1px solid rgba(0,168,80,.12)}',
      '',
      '/* Topic dot */',
      '.topic-dot{width:8px;height:8px;border-radius:50%;background:#d8d8d4;flex-shrink:0;transition:background .15s}',
      '.topic[open]>.topic-hdr .topic-dot{background:#00A850}',
      '.topic-dot-ex{border-radius:2px}',
      '.topic-dot-quiz{border-radius:2px;background:#e6a817}',
      '.topic[open]>.topic-hdr .topic-dot-quiz{background:#b07000}',
      '',
      '.topic-title{flex:1;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.topic[open]>.topic-hdr .topic-title{font-weight:600;color:#00A850}',
      '.topic-time{font-size:10px;color:#aaa;flex-shrink:0}',
      '',
      '/* Topic content */',
      '.topic-body{padding:20px 24px;background:#fafaf8;border-top:none}',
      '',
      '/* ═══ CONTENT BLOCKS ═══ */',
      'h3.bh{font-size:clamp(15px,1.6vw,18px);font-weight:600;margin:16px 0 6px;color:#1c1c1c}',
      'h4.bh{font-size:clamp(13px,1.4vw,15px);font-weight:600;margin:12px 0 5px;color:#1c1c1c}',
      'p.bp{font-size:clamp(12px,1.3vw,14px);line-height:1.7;margin-bottom:10px;color:#3a3a3a}',
      '',
      '.co{display:flex;gap:10px;padding:12px 16px;border-radius:6px;margin:10px 0;font-size:clamp(11px,1.2vw,13px);line-height:1.6}',
      '.co-info{background:rgba(59,130,246,.06);border-left:3px solid #3b82f6}',
      '.co-tip{background:rgba(0,168,80,.06);border-left:3px solid #00A850}',
      '.co-warning{background:rgba(245,158,11,.06);border-left:3px solid #f59e0b}',
      '.co-insight{background:rgba(192,132,252,.06);border-left:3px solid #c084fc}',
      '.co-i{font-size:15px;flex-shrink:0}',
      '',
      '.tw{overflow-x:auto;margin:10px 0}',
      'table.dt{width:100%;border-collapse:collapse;font-size:clamp(11px,1.2vw,13px)}',
      'table.dt th{background:#1a1a2e;color:#fff;padding:8px 14px;text-align:left;font-weight:600;font-size:clamp(10px,1.1vw,12px)}',
      'table.dt td{padding:6px 14px;border-bottom:1px solid #e8e8e4;vertical-align:middle}',
      'table.dt tr:nth-child(even) td{background:#f0f0ec}',
      '.td-g{color:#00A850;font-weight:600}',
      '.im-p{font-size:clamp(12px,1.3vw,14px);font-weight:600;margin-bottom:8px;color:#3a3a3a}',
      '',
      '.rc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin:10px 0}',
      '.rc{background:#fff;border:1.5px solid #d8d8d4;border-radius:6px;overflow:hidden}',
      '.rc-f{padding:14px 16px;cursor:pointer;text-align:center;font-size:clamp(12px,1.2vw,14px);font-weight:600;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;list-style:none}',
      '.rc-f::-webkit-details-marker{display:none}',
      '.rc-f::marker{display:none;content:""}',
      '.rc-hint{display:block;font-size:8px;color:#aaa;margin-top:3px;font-weight:400;text-transform:uppercase;letter-spacing:.5px}',
      'details[open]>.rc-f .rc-hint{display:none}',
      '.rc-b{padding:10px 16px;font-size:clamp(11px,1.15vw,13px);color:#00A850;background:rgba(0,168,80,.04);border-top:1px solid #e8e8e4;line-height:1.5}',
      '',
      '.so-item{display:flex;align-items:center;gap:10px;padding:6px 12px;border:1px solid #e8e8e4;border-radius:4px;margin-bottom:4px;font-size:clamp(11px,1.2vw,13px);background:#fff}',
      '.so-n{font-weight:700;color:#00A850;width:18px;text-align:center;flex-shrink:0}',
      '',
      '.fig{margin:10px 0;text-align:center}',
      '.fig img{max-width:100%;border-radius:6px}',
      '.fig figcaption{font-size:11px;color:#8a8d90;margin-top:6px}',
      '',
      '.ex-box{margin:10px 0;padding:14px 18px;border:1.5px solid #d8d8d4;border-radius:6px;border-left:4px solid #00A850;background:#fff}',
      '.ex-lbl{font-size:10px;font-weight:700;color:#8a8d90;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}',
      '.ex-obj{font-size:clamp(12px,1.25vw,14px);line-height:1.5;margin-bottom:10px;color:#3a3a3a}',
      '.ex-task{margin-top:10px}',
      '.ex-task h4{font-size:clamp(12px,1.3vw,14px);font-weight:700;margin-bottom:6px}',
      '.ex-step{display:flex;gap:10px;margin-bottom:6px}',
      '.ex-n{font-weight:700;color:#00A850;font-size:13px;min-width:18px;text-align:center;flex-shrink:0}',
      '.ex-d{font-size:12px;color:#6b6e72;margin-top:2px}',
      '.ex-h{font-size:12px;color:#8a8d90;font-style:italic;margin-top:2px}',
      '',
      '.kc{margin:10px 0}',
      '.kc-hd{font-size:clamp(14px,1.5vw,17px);font-weight:700;color:#00A850;margin-bottom:12px}',
      '.kc-q{margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #e8e8e4}',
      '.kc-q:last-child{border:none;margin:0;padding:0}',
      '.kc-qt{font-size:clamp(12px,1.3vw,14px);margin-bottom:8px;color:#3a3a3a}',
      '.kc-o{display:flex;align-items:flex-start;gap:8px;padding:6px 12px;border:1px solid #e8e8e4;border-radius:4px;margin-bottom:4px;font-size:clamp(11px,1.2vw,13px)}',
      '.kc-letter{font-weight:700;color:#555;flex-shrink:0;width:18px}',
      '.kc-ans{margin-top:8px;font-size:12px}',
      '.kc-ans summary{cursor:pointer;color:#00A850;font-weight:600;font-size:12px;list-style:none;padding:6px 12px;border:1px dashed rgba(0,168,80,.3);border-radius:4px;display:inline-block}',
      '.kc-ans summary::-webkit-details-marker{display:none}',
      '.kc-ans summary::marker{display:none;content:""}',
      '.kc-ans summary:hover{background:rgba(0,168,80,.04)}',
      '.kc-ans-body{margin-top:6px;padding:10px 14px;background:rgba(0,168,80,.05);border-left:3px solid #00A850;border-radius:0 6px 6px 0;font-size:clamp(11px,1.2vw,13px);color:#1c1c1c;line-height:1.6}',
      '.kc-ans-badge{display:inline-block;background:#00A850;color:#fff;font-weight:700;font-size:11px;padding:1px 7px;border-radius:3px;margin-right:4px}',
      '.kc-ans-rat{margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,168,80,.12);font-size:clamp(11px,1.15vw,13px);color:#555;font-style:italic}',
      '',
      '.tka{margin-top:16px;padding:14px 18px;background:rgba(0,168,80,.04);border:1px solid rgba(0,168,80,.12);border-radius:6px}',
      '.tka-hd{font-size:clamp(12px,1.3vw,14px);font-weight:700;color:#00A850;margin-bottom:8px}',
      '.tka ul{list-style:none}',
      '.tka li{display:flex;align-items:flex-start;gap:8px;padding:3px 0;font-size:clamp(11px,1.2vw,13px);line-height:1.5;color:#3a3a3a}',
      '.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:5px}',
      '.dot-g{background:#00A850}',
      '',
      '.pill{display:inline-block;padding:2px 9px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.4px}',
      '.pill-g{background:#00A850;color:#fff}',
      '.pill-a{background:#b07000;color:#fff}',
      '',
      '.foot{text-align:center;padding:24px;font-size:11px;color:#8a8d90;margin-top:8px}',
      '',
      '/* Mobile */',
      '@media(max-width:600px){',
      '  .hdr{padding:24px 20px 20px}',
      '  .mod-hdr{padding:12px 16px}',
      '  .topic{margin-left:20px;margin-right:8px}',
      '  .topic-body{padding:14px 16px}',
      '  .mod-desc{padding-left:36px}',
      '  .rc-g{grid-template-columns:1fr}',
      '  .hdr-stats{gap:14px}',
      '}',
      '',
      '@media print{.mod,.topic{border:none!important}.mod[open]{break-inside:avoid}}'
    ].join('\n');
  }

  AP.spExport = { exportSharePoint: exportSharePoint };
})();
