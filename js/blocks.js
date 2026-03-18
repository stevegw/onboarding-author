/* AP -- Content Block Editor */
/* Renders and edits content blocks matching the OB schema exactly */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var BLOCK_TYPES = [
    { type: 'paragraph',        label: '¶ Paragraph',       icon: '¶' },
    { type: 'heading',          label: 'H Heading',         icon: 'H' },
    { type: 'callout',          label: '💡 Callout',        icon: '💡' },
    { type: 'comparison-table', label: '⊞ Table',           icon: '⊞' },
    { type: 'reveal-cards',     label: '🃏 Reveal Cards',   icon: '🃏' },
    { type: 'interactive-match',label: '⇌ Match',           icon: '⇌' },
    { type: 'interactive-sort', label: '↕ Sort',            icon: '↕' },
    { type: 'image',            label: '🖼 Image',          icon: '🖼' },
    { type: 'exercise',         label: '🔧 Exercise',       icon: '🔧' }
  ];

  // Build a default block object for a given type
  function defaultBlock(type) {
    var ts = {
      'paragraph':         { type: 'paragraph', text: '' },
      'heading':           { type: 'heading', level: 2, text: '' },
      'callout':           { type: 'callout', variant: 'info', text: '' },
      'comparison-table':  { type: 'comparison-table', headers: ['Column A', 'Column B', 'Column C'], rows: [['', '', '']] },
      'reveal-cards':      { type: 'reveal-cards', cards: [{ front: '', back: '' }] },
      'interactive-match': { type: 'interactive-match', prompt: '', pairs: [{ left: '', right: '' }] },
      'interactive-sort':  { type: 'interactive-sort', prompt: '', items: ['', '', ''] },
      'image':             { type: 'image', src: '', alt: '', caption: '', size: 'medium' },
      'exercise':          { type: 'exercise', exerciseId: '', title: '', objective: '', tasks: [{ id: 'task1', title: '', steps: [{ action: '', detail: '', hint: null }] }] }
    };
    return ts[type] || { type: type };
  }

  // ── Render a single block into an element ──
  function renderBlock(block, idx, onChanged, onDelete, onMoveUp, onMoveDown) {
    var wrap = AP.ui.el('div', { class: 'content-block', 'data-block-idx': idx });
    wrap.draggable = true;

    // Badge class
    var badgeClass = 'block-type-badge';
    if (block.type === 'heading') badgeClass += ' type-heading';
    else if (block.type === 'callout') badgeClass += ' type-callout';
    else if (block.type === 'image') badgeClass += ' type-image';
    else if (block.type === 'exercise') badgeClass += ' type-exercise';

    // Header
    var header = AP.ui.el('div', { class: 'block-header' });
    header.innerHTML = [
      '<span class="block-drag" title="Drag to reorder">⠿</span>',
      '<span class="' + badgeClass + '">' + block.type + '</span>',
      '<span class="block-spacer"></span>',
      '<div class="block-actions">',
        '<button class="block-btn" title="Move up">↑</button>',
        '<button class="block-btn" title="Move down">↓</button>',
        '<button class="block-btn danger" title="Remove block">✕</button>',
      '</div>'
    ].join('');

    var btns = header.querySelectorAll('.block-btn');
    btns[0].onclick = function () { if (onMoveUp) onMoveUp(idx); };
    btns[1].onclick = function () { if (onMoveDown) onMoveDown(idx); };
    btns[2].onclick = function () { if (onDelete) onDelete(idx); };
    wrap.appendChild(header);

    // Body
    var body = AP.ui.el('div', { class: 'block-body' });
    body.appendChild(_buildBlockEditor(block, onChanged));
    wrap.appendChild(body);

    return wrap;
  }

  function _buildBlockEditor(block, onChange) {
    switch (block.type) {
      case 'paragraph': return _paragraphEditor(block, onChange);
      case 'heading': return _headingEditor(block, onChange);
      case 'callout': return _calloutEditor(block, onChange);
      case 'comparison-table': return _tableEditor(block, onChange);
      case 'reveal-cards': return _revealCardsEditor(block, onChange);
      case 'interactive-match': return _matchEditor(block, onChange);
      case 'interactive-sort': return _sortEditor(block, onChange);
      case 'image': return _imageEditor(block, onChange);
      case 'exercise': return _exerciseEditor(block, onChange);
      default:
        var d = document.createElement('div');
        d.style.color = 'var(--text-dim)';
        d.style.fontSize = '12px';
        d.textContent = 'Unsupported block type: ' + block.type;
        return d;
    }
  }

  // ── Block editors ──

  function _paragraphEditor(block, onChange) {
    var wrap = AP.ui.el('div', {});
    var ta = document.createElement('textarea');
    ta.className = 'block-textarea';
    ta.placeholder = 'Paragraph text… (HTML: <strong>, <em>, <code>, <br> supported)';
    ta.value = block.text || '';
    ta.rows = 4;
    ta.oninput = function () { block.text = ta.value; if (onChange) onChange(); };
    wrap.appendChild(ta);
    return wrap;
  }

  function _headingEditor(block, onChange) {
    var wrap = AP.ui.el('div', {});
    var row = AP.ui.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px' });
    var lbl = AP.ui.el('label', { style: 'font-size:11px;color:var(--text-dim);white-space:nowrap' });
    lbl.textContent = 'Level:';
    var sel = AP.ui.el('select', { class: 'block-select' });
    [2, 3].forEach(function (l) {
      var o = document.createElement('option');
      o.value = l; o.textContent = 'H' + l;
      if (block.level === l) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { block.level = parseInt(sel.value); if (onChange) onChange(); };
    row.appendChild(lbl); row.appendChild(sel);
    wrap.appendChild(row);

    var inp = document.createElement('input');
    inp.className = 'block-input';
    inp.placeholder = 'Heading text';
    inp.value = block.text || '';
    inp.oninput = function () { block.text = inp.value; if (onChange) onChange(); };
    wrap.appendChild(inp);
    return wrap;
  }

  function _calloutEditor(block, onChange) {
    var wrap = AP.ui.el('div', {});
    var row = AP.ui.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px' });
    var lbl = AP.ui.el('label', { style: 'font-size:11px;color:var(--text-dim)' });
    lbl.textContent = 'Variant:';
    var sel = AP.ui.el('select', { class: 'block-select' });
    ['info', 'tip', 'warning', 'insight'].forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (block.variant === v) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { block.variant = sel.value; if (onChange) onChange(); };
    row.appendChild(lbl); row.appendChild(sel);
    wrap.appendChild(row);

    var ta = document.createElement('textarea');
    ta.className = 'block-textarea';
    ta.placeholder = 'Callout text…';
    ta.value = block.text || '';
    ta.rows = 3;
    ta.oninput = function () { block.text = ta.value; if (onChange) onChange(); };
    wrap.appendChild(ta);
    return wrap;
  }

  function _tableEditor(block, onChange) {
    var container = AP.ui.el('div', {});
    block.headers = block.headers || ['Column A', 'Column B'];
    block.rows = block.rows || [['', '']];

    function rebuild() {
      container.innerHTML = '';
      // Header row
      var hRow = AP.ui.el('div', { style: 'display:flex;gap:6px;margin-bottom:4px;align-items:center' });
      var hLbl = AP.ui.el('span', { style: 'font-size:11px;color:var(--text-dim);width:50px;flex-shrink:0' });
      hLbl.textContent = 'Headers';
      hRow.appendChild(hLbl);
      block.headers.forEach(function (h, hi) {
        var inp = document.createElement('input');
        inp.className = 'block-input';
        inp.value = h;
        inp.style.flex = '1';
        inp.oninput = function () { block.headers[hi] = inp.value; if (onChange) onChange(); };
        hRow.appendChild(inp);
      });
      var addColBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-xs', style: 'flex-shrink:0' });
      addColBtn.textContent = '+ Col';
      addColBtn.onclick = function () {
        block.headers.push('Column');
        block.rows.forEach(function (r) { r.push(''); });
        if (onChange) onChange();
        rebuild();
      };
      hRow.appendChild(addColBtn);
      container.appendChild(hRow);

      // Data rows
      block.rows.forEach(function (row, ri) {
        var rEl = AP.ui.el('div', { style: 'display:flex;gap:6px;margin-bottom:4px;align-items:center' });
        var rLbl = AP.ui.el('span', { style: 'font-size:10px;color:var(--text-dim);width:50px;flex-shrink:0' });
        rLbl.textContent = 'Row ' + (ri + 1);
        rEl.appendChild(rLbl);
        row.forEach(function (cell, ci) {
          var inp = document.createElement('input');
          inp.className = 'block-input';
          inp.value = cell;
          inp.style.flex = '1';
          inp.oninput = function () { block.rows[ri][ci] = inp.value; if (onChange) onChange(); };
          rEl.appendChild(inp);
        });
        var delBtn = AP.ui.el('button', { class: 'btn btn-danger btn-xs', style: 'flex-shrink:0' });
        delBtn.textContent = '✕';
        delBtn.onclick = function () { block.rows.splice(ri, 1); if (onChange) onChange(); rebuild(); };
        rEl.appendChild(delBtn);
        container.appendChild(rEl);
      });

      var addRowBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-xs' });
      addRowBtn.textContent = '+ Add Row';
      addRowBtn.onclick = function () {
        block.rows.push(block.headers.map(function () { return ''; }));
        if (onChange) onChange();
        rebuild();
      };
      container.appendChild(addRowBtn);
    }
    rebuild();
    return container;
  }

  function _revealCardsEditor(block, onChange) {
    block.cards = block.cards || [{ front: '', back: '' }];
    var container = AP.ui.el('div', {});

    function rebuild() {
      container.innerHTML = '';
      block.cards.forEach(function (card, ci) {
        var cardEl = AP.ui.el('div', { style: 'border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px' });
        var hdr = AP.ui.el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' });
        var lbl = AP.ui.el('span', { style: 'font-size:10px;color:var(--text-dim)' });
        lbl.textContent = 'Card ' + (ci + 1);
        var del = AP.ui.el('button', { class: 'btn btn-danger btn-xs' });
        del.textContent = '✕';
        del.onclick = function () { block.cards.splice(ci, 1); if (onChange) onChange(); rebuild(); };
        hdr.appendChild(lbl); hdr.appendChild(del);
        cardEl.appendChild(hdr);

        ['front', 'back'].forEach(function (side) {
          var lbl2 = AP.ui.el('label', { style: 'font-size:10px;color:var(--text-dim);display:block;margin-bottom:2px' });
          lbl2.textContent = side === 'front' ? 'Front (title)' : 'Back (explanation)';
          var ta = document.createElement('textarea');
          ta.className = 'block-textarea';
          ta.placeholder = side === 'front' ? 'Card title' : 'Detailed explanation';
          ta.value = card[side] || '';
          ta.rows = side === 'front' ? 1 : 3;
          ta.style.marginBottom = '6px';
          ta.oninput = function () { card[side] = ta.value; if (onChange) onChange(); };
          cardEl.appendChild(lbl2);
          cardEl.appendChild(ta);
        });
        container.appendChild(cardEl);
      });

      var addBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-sm' });
      addBtn.textContent = '+ Add Card';
      addBtn.onclick = function () { block.cards.push({ front: '', back: '' }); if (onChange) onChange(); rebuild(); };
      container.appendChild(addBtn);
    }
    rebuild();
    return container;
  }

  function _matchEditor(block, onChange) {
    block.pairs = block.pairs || [{ left: '', right: '' }];
    var container = AP.ui.el('div', {});

    var pInp = document.createElement('input');
    pInp.className = 'block-input';
    pInp.placeholder = 'Prompt (e.g. Match each capability to its description)';
    pInp.value = block.prompt || '';
    pInp.style.marginBottom = '10px';
    pInp.oninput = function () { block.prompt = pInp.value; if (onChange) onChange(); };
    container.appendChild(pInp);

    function rebuild() {
      var existing = container.querySelector('.pairs-list');
      if (existing) existing.remove();
      var list = AP.ui.el('div', { class: 'pairs-list' });
      block.pairs.forEach(function (pair, pi) {
        var row = AP.ui.el('div', { style: 'display:flex;gap:6px;margin-bottom:6px;align-items:center' });
        var lbl = AP.ui.el('span', { style: 'font-size:10px;color:var(--text-dim);width:30px;flex-shrink:0' });
        lbl.textContent = pi + 1 + '.';
        var lInp = document.createElement('input');
        lInp.className = 'block-input'; lInp.placeholder = 'Left item'; lInp.value = pair.left || '';
        lInp.style.flex = '1';
        lInp.oninput = function () { pair.left = lInp.value; if (onChange) onChange(); };
        var rInp = document.createElement('input');
        rInp.className = 'block-input'; rInp.placeholder = 'Right match'; rInp.value = pair.right || '';
        rInp.style.flex = '1';
        rInp.oninput = function () { pair.right = rInp.value; if (onChange) onChange(); };
        var del = AP.ui.el('button', { class: 'btn btn-danger btn-xs' });
        del.textContent = '✕';
        del.onclick = function () { block.pairs.splice(pi, 1); if (onChange) onChange(); rebuild(); };
        row.appendChild(lbl); row.appendChild(lInp); row.appendChild(rInp); row.appendChild(del);
        list.appendChild(row);
      });
      var addBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-sm' });
      addBtn.textContent = '+ Add Pair';
      addBtn.onclick = function () { block.pairs.push({ left: '', right: '' }); if (onChange) onChange(); rebuild(); };
      list.appendChild(addBtn);
      container.appendChild(list);
    }
    rebuild();
    return container;
  }

  function _sortEditor(block, onChange) {
    block.items = block.items || ['', '', ''];
    var container = AP.ui.el('div', {});

    var pInp = document.createElement('input');
    pInp.className = 'block-input';
    pInp.placeholder = 'Prompt (e.g. Arrange phases in correct order)';
    pInp.value = block.prompt || '';
    pInp.style.marginBottom = '10px';
    pInp.oninput = function () { block.prompt = pInp.value; if (onChange) onChange(); };
    container.appendChild(pInp);

    var note = AP.ui.el('p', { style: 'font-size:10px;color:var(--text-dim);margin-bottom:6px' });
    note.textContent = 'Enter items in correct order — the renderer will shuffle them.';
    container.appendChild(note);

    function rebuild() {
      var existing = container.querySelector('.items-list');
      if (existing) existing.remove();
      var list = AP.ui.el('div', { class: 'items-list' });
      block.items.forEach(function (item, ii) {
        var row = AP.ui.el('div', { style: 'display:flex;gap:6px;margin-bottom:6px;align-items:center' });
        var lbl = AP.ui.el('span', { style: 'font-size:10px;color:var(--text-dim);width:20px;flex-shrink:0' });
        lbl.textContent = ii + 1 + '.';
        var inp = document.createElement('input');
        inp.className = 'block-input'; inp.placeholder = 'Item ' + (ii + 1); inp.value = item || '';
        inp.style.flex = '1';
        inp.oninput = function () { block.items[ii] = inp.value; if (onChange) onChange(); };
        var del = AP.ui.el('button', { class: 'btn btn-danger btn-xs' });
        del.textContent = '✕';
        del.onclick = function () { block.items.splice(ii, 1); if (onChange) onChange(); rebuild(); };
        row.appendChild(lbl); row.appendChild(inp); row.appendChild(del);
        list.appendChild(row);
      });
      var addBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-sm' });
      addBtn.textContent = '+ Add Item';
      addBtn.onclick = function () { block.items.push(''); if (onChange) onChange(); rebuild(); };
      list.appendChild(addBtn);
      container.appendChild(list);
    }
    rebuild();
    return container;
  }

  function _imageEditor(block, onChange) {
    var container = AP.ui.el('div', {});

    var zone = AP.ui.el('div', { class: 'image-drop-zone' + (block.src ? ' has-image' : '') });

    function renderZone() {
      zone.innerHTML = '';
      if (block.src) {
        var img = document.createElement('img');
        img.className = 'image-preview';
        img.src = block.src;
        img.alt = block.alt || '';
        zone.appendChild(img);
        var changeBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-xs' });
        changeBtn.textContent = 'Change image';
        changeBtn.onclick = function () { fileInput.click(); };
        zone.appendChild(changeBtn);
      } else {
        zone.innerHTML = '<div style="font-size:24px;margin-bottom:8px">🖼</div><div>Click or drag an image here</div><div style="font-size:11px;margin-top:4px">PNG, JPG, GIF, WebP</div>';
        zone.onclick = function () { fileInput.click(); };
      }
    }

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = function () {
      var file = fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        block.src = e.target.result; // base64 data URL
        block.alt = block.alt || file.name;
        zone.classList.add('has-image');
        renderZone();
        if (onChange) onChange();
      };
      reader.readAsDataURL(file);
    };

    // Drag over
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; });
    zone.addEventListener('dragleave', function () { zone.style.borderColor = ''; });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); zone.style.borderColor = '';
      var file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        block.src = ev.target.result;
        block.alt = block.alt || file.name;
        zone.classList.add('has-image');
        renderZone();
        if (onChange) onChange();
      };
      reader.readAsDataURL(file);
    });

    renderZone();
    container.appendChild(zone);
    container.appendChild(fileInput);

    // Alt / caption / size fields
    var fields = AP.ui.el('div', { class: 'image-fields' });

    [
      { field: 'alt', placeholder: 'Alt text (accessibility)' },
      { field: 'caption', placeholder: 'Caption (optional)' }
    ].forEach(function (f) {
      var inp = document.createElement('input');
      inp.className = 'block-input';
      inp.placeholder = f.placeholder;
      inp.value = block[f.field] || '';
      inp.oninput = function () { block[f.field] = inp.value; if (onChange) onChange(); };
      fields.appendChild(inp);
    });

    var sizeRow = AP.ui.el('div', { style: 'display:flex;align-items:center;gap:8px' });
    var sLbl = AP.ui.el('label', { style: 'font-size:11px;color:var(--text-dim)' });
    sLbl.textContent = 'Size:';
    var sSel = AP.ui.el('select', { class: 'block-select' });
    ['small', 'medium', 'large', 'full'].forEach(function (s) {
      var o = document.createElement('option');
      o.value = s; o.textContent = s;
      if (block.size === s) o.selected = true;
      sSel.appendChild(o);
    });
    sSel.onchange = function () { block.size = sSel.value; if (onChange) onChange(); };
    sizeRow.appendChild(sLbl); sizeRow.appendChild(sSel);
    fields.appendChild(sizeRow);

    container.appendChild(fields);
    return container;
  }

  function _exerciseEditor(block, onChange) {
    block.tasks = block.tasks || [{ id: 'task1', title: '', steps: [{ action: '', detail: '', hint: null }] }];
    var container = AP.ui.el('div', {});

    // Exercise meta
    var metaFields = [
      { field: 'exerciseId', placeholder: 'Exercise ID (e.g. set-up-your-environment)' },
      { field: 'title', placeholder: 'Exercise title' },
      { field: 'objective', placeholder: 'Objective — what the learner will accomplish' }
    ];
    metaFields.forEach(function (f) {
      var inp = document.createElement('input');
      inp.className = 'block-input';
      inp.placeholder = f.placeholder;
      inp.value = block[f.field] || '';
      inp.style.marginBottom = '6px';
      inp.oninput = function () { block[f.field] = inp.value; if (onChange) onChange(); };
      container.appendChild(inp);
    });

    var tasksHeader = AP.ui.el('p', { style: 'font-size:11px;font-weight:600;color:var(--text-dim);margin:10px 0 6px' });
    tasksHeader.textContent = 'Tasks';
    container.appendChild(tasksHeader);

    function rebuildTasks() {
      var existing = container.querySelector('.tasks-container');
      if (existing) existing.remove();
      var tasksEl = AP.ui.el('div', { class: 'tasks-container' });

      block.tasks.forEach(function (task, ti) {
        var taskEl = AP.ui.el('div', { style: 'border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:10px' });
        var tHdr = AP.ui.el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' });
        var tLbl = AP.ui.el('span', { style: 'font-size:11px;font-weight:600;color:var(--text-dim)' });
        tLbl.textContent = 'Task ' + (ti + 1);
        var tDel = AP.ui.el('button', { class: 'btn btn-danger btn-xs' });
        tDel.textContent = '✕ Remove task';
        tDel.onclick = function () { block.tasks.splice(ti, 1); if (onChange) onChange(); rebuildTasks(); };
        var tInp = document.createElement('input');
        tInp.className = 'block-input'; tInp.placeholder = 'Task title'; tInp.value = task.title || '';
        tInp.style.flex = '1';
        tInp.oninput = function () { task.title = tInp.value; if (onChange) onChange(); };
        tHdr.appendChild(tLbl); tHdr.appendChild(tInp); tHdr.appendChild(tDel);
        taskEl.appendChild(tHdr);

        var stepsLbl = AP.ui.el('p', { style: 'font-size:10px;color:var(--text-dim);margin-bottom:4px' });
        stepsLbl.textContent = 'Steps';
        taskEl.appendChild(stepsLbl);

        task.steps.forEach(function (step, si) {
          var stepEl = AP.ui.el('div', { style: 'border-left:2px solid var(--border);padding-left:10px;margin-bottom:8px' });
          var sHdr = AP.ui.el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px' });
          var sLbl = AP.ui.el('span', { style: 'font-size:10px;color:var(--text-dim)' });
          sLbl.textContent = 'Step ' + (si + 1);
          var sDel = AP.ui.el('button', { class: 'btn btn-danger btn-xs' });
          sDel.textContent = '✕';
          sDel.onclick = function () { task.steps.splice(si, 1); if (onChange) onChange(); rebuildTasks(); };
          sHdr.appendChild(sLbl); sHdr.appendChild(sDel);
          stepEl.appendChild(sHdr);

          [
            { field: 'action', placeholder: 'Action (imperative: "Open the tracker and…")', rows: 2 },
            { field: 'detail', placeholder: 'Detail — context and explanation', rows: 2 },
            { field: 'hint', placeholder: 'Hint (optional)', rows: 1 }
          ].forEach(function (sf) {
            var ta = document.createElement('textarea');
            ta.className = 'block-textarea';
            ta.placeholder = sf.placeholder;
            ta.value = step[sf.field] || '';
            ta.rows = sf.rows;
            ta.style.marginBottom = '4px';
            ta.oninput = function () {
              step[sf.field] = ta.value || (sf.field === 'hint' ? null : '');
              if (onChange) onChange();
            };
            stepEl.appendChild(ta);
          });

          taskEl.appendChild(stepEl);
        });

        var addStepBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-xs' });
        addStepBtn.textContent = '+ Add Step';
        addStepBtn.onclick = function () {
          task.steps.push({ action: '', detail: '', hint: null });
          if (onChange) onChange(); rebuildTasks();
        };
        taskEl.appendChild(addStepBtn);
        tasksEl.appendChild(taskEl);
      });

      var addTaskBtn = AP.ui.el('button', { class: 'btn btn-secondary btn-sm' });
      addTaskBtn.textContent = '+ Add Task';
      addTaskBtn.onclick = function () {
        var n = block.tasks.length + 1;
        block.tasks.push({ id: 'task' + n, title: '', steps: [{ action: '', detail: '', hint: null }] });
        if (onChange) onChange(); rebuildTasks();
      };
      tasksEl.appendChild(addTaskBtn);
      container.appendChild(tasksEl);
    }

    rebuildTasks();
    return container;
  }

  // ── Public ──
  function buildPalette(onAdd) {
    var palette = AP.ui.el('div', { class: 'add-block-palette' });
    var lbl = AP.ui.el('label');
    lbl.textContent = 'Add block:';
    palette.appendChild(lbl);
    BLOCK_TYPES.forEach(function (bt) {
      var btn = AP.ui.el('button', { class: 'add-block-btn' });
      btn.textContent = bt.label;
      btn.onclick = function () { if (onAdd) onAdd(bt.type); };
      palette.appendChild(btn);
    });
    return palette;
  }

  AP.blocks = {
    renderBlock: renderBlock,
    defaultBlock: defaultBlock,
    buildPalette: buildPalette
  };
})();
