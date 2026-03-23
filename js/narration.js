/* AP -- Narration / TTS
 * Preview-mode only. Click text to start from that word.
 * Toggle button enables/disables click-to-narrate.
 * Play button starts from current scroll position.
 */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
  var LS_VOICE = 'ap_narr_voice';
  var LS_RATE  = 'ap_narr_rate';
  var LS_ACTIVE = 'ap_narr_active';
  var DEFAULT_CPM = 0.015;
  var TIMER_MS = 50;

  var synth = window.speechSynthesis || null;
  var voices = [];
  var voice = null;
  var rate = 1.0;
  var active = false; // click-to-narrate enabled

  var state = 'stopped';
  var genId = 0;
  var chunks = [];
  var chunkIdx = 0;

  var tMap = [];
  var fText = '';
  var root = null;
  var ov = null;
  var bFired = false;

  var tmr = null;
  var wSched = [];
  var tStart = 0;
  var pDur = 0;
  var pStart = 0;
  var lastW = -1;
  var cpm = DEFAULT_CPM;

  var _click = null;

  function isSupported() { return !!synth; }

  function isBlock(el) {
    if (!el || el.nodeType !== 1) return false;
    var d = getComputedStyle(el).display;
    return d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item' || d === 'table';
  }
  function blockOf(n, r) {
    var e = n.parentElement;
    while (e && e !== r) { if (isBlock(e)) return e; e = e.parentElement; }
    return r;
  }
  function getEl() { return document.getElementById('editor-body'); }

  // ── voices ──
  function loadVoices() {
    if (!synth) return;
    var v = synth.getVoices(); if (!v.length) return;
    voices = v;
    var s = localStorage.getItem(LS_VOICE);
    voice = null;
    if (s) { for (var i = 0; i < v.length; i++) if (v[i].name === s) { voice = v[i]; break; } }
    if (!voice) {
      var en = [], loc = [];
      for (var j = 0; j < v.length; j++) {
        if (v[j].lang && v[j].lang.indexOf('en') === 0) { en.push(v[j]); if (v[j].localService) loc.push(v[j]); }
      }
      voice = loc[0] || en[0] || v[0] || null;
    }
    var sel = document.getElementById('narr-voice'); if (!sel) return;
    sel.innerHTML = '';
    for (var k = 0; k < v.length; k++) {
      var o = document.createElement('option'); o.value = v[k].name;
      o.textContent = v[k].name.replace(/\s*\(.*?\)/, '').substring(0, 28);
      if (voice && v[k].name === voice.name) o.selected = true;
      sel.appendChild(o);
    }
  }

  // ── text map ──
  function buildMap(r) {
    var map = [], off = 0, lb = null;
    var w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        while (p && p !== r) {
          var t = p.tagName;
          if (t === 'BUTTON' || t === 'SVG' || t === 'SCRIPT' || t === 'STYLE' ||
              t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return NodeFilter.FILTER_REJECT;
          if (p.classList.contains('narr-bar') || p.classList.contains('narr-word-overlay')) return NodeFilter.FILTER_REJECT;
          if (getComputedStyle(p).display === 'none') return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nd;
    while ((nd = w.nextNode())) {
      var len = (nd.textContent || '').length; if (!len) continue;
      var b = blockOf(nd, r);
      if (lb && b !== lb && off > 0) off++;
      lb = b;
      map.push({ node: nd, start: off, end: off + len });
      off += len;
    }
    return map;
  }

  function buildText(map) {
    var s = '';
    for (var i = 0; i < map.length; i++) {
      if (i > 0 && map[i].start > map[i - 1].end) s += ' ';
      s += map[i].node.textContent || '';
    }
    return s;
  }

  function findNode(ci) {
    var lo = 0, hi = tMap.length - 1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (ci < tMap[m].start) hi = m - 1;
      else if (ci >= tMap[m].end) lo = m + 1;
      else return tMap[m];
    }
    return null;
  }

  // ── Find char index of first visible text in scroll viewport ──
  function findFirstVisibleChar(el) {
    var map = buildMap(el);
    if (!map.length) return 0;
    var rect = el.getBoundingClientRect();
    var topEdge = rect.top + 10; // small offset below top edge
    for (var i = 0; i < map.length; i++) {
      try {
        var range = document.createRange();
        range.setStart(map[i].node, 0);
        range.setEnd(map[i].node, Math.min(1, map[i].node.textContent.length));
        var rr = range.getBoundingClientRect();
        if (rr.top >= topEdge) return map[i].start;
      } catch (e) { /* skip */ }
    }
    return 0; // fallback to beginning
  }

  // ── chunking ──
  function chunkify(txt, off) {
    off = off || 0; var res = [], st = 0;
    for (var i = 0; i < txt.length; i++) {
      var c = txt[i];
      if ((c === '.' || c === '!' || c === '?') && (i + 1 >= txt.length || /\s/.test(txt[i + 1]))) {
        var e = i + 1; while (e < txt.length && /\s/.test(txt[e])) e++;
        var ch = txt.slice(st, e); if (ch.trim()) res.push({ text: ch, sc: off + st }); st = e;
      }
    }
    if (st < txt.length) { var rm = txt.slice(st); if (rm.trim()) res.push({ text: rm, sc: off + st }); }
    var mg = [];
    for (var j = 0; j < res.length; j++) {
      if (mg.length && res[j].text.trim().length < 20) mg[mg.length - 1].text += res[j].text;
      else mg.push({ text: res[j].text, sc: res[j].sc });
    }
    return mg.length ? mg : [{ text: txt, sc: off }];
  }

  function wordSched(txt, sc) {
    var s = [], re = /\S+/g, m;
    while ((m = re.exec(txt)) !== null) s.push({ ci: sc + m.index, cl: m[0].length, t: m.index / (cpm * rate) });
    return s;
  }

  // ── overlay ──
  function ensureOv() {
    if (!ov) { ov = document.createElement('div'); ov.className = 'narr-word-overlay'; }
    if (root && ov.parentElement !== root) {
      var p = getComputedStyle(root).position;
      if (!p || p === 'static') root.style.position = 'relative';
      root.appendChild(ov);
    }
    return ov;
  }

  function hlWord(ci, cl) {
    var e = findNode(ci); if (!e) return;
    var lo = ci - e.start, nt = e.node.textContent || '', we = lo + (cl || 0);
    if (!cl || cl <= 0) { we = lo; while (we < nt.length && !/\s/.test(nt[we])) we++; }
    if (we > nt.length) we = nt.length; if (lo >= nt.length) return;
    try {
      var rng = document.createRange(); rng.setStart(e.node, lo); rng.setEnd(e.node, we);
      var rr = rng.getBoundingClientRect(); if (!rr.width && !rr.height) return;
      var rR = root.getBoundingClientRect(), o = ensureOv();
      o.style.top = (rr.top - rR.top + root.scrollTop) + 'px';
      o.style.left = (rr.left - rR.left + root.scrollLeft) + 'px';
      o.style.width = rr.width + 'px'; o.style.height = rr.height + 'px'; o.style.display = 'block';
      if (rr.top < rR.top + 40 || rr.bottom > rR.bottom - 60)
        e.node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (x) {}
  }

  function hideOv() { if (ov) ov.style.display = 'none'; }

  // ── timer fallback ──
  function startTmr() {
    stopTmr(); tStart = Date.now(); pDur = 0; lastW = -1;
    tmr = setInterval(function () {
      if (bFired) { stopTmr(); return; }
      if (state !== 'playing') return;
      var el = Date.now() - tStart - pDur, idx = -1;
      for (var i = wSched.length - 1; i >= 0; i--) if (wSched[i].t <= el) { idx = i; break; }
      if (idx >= 0 && idx !== lastW) { lastW = idx; hlWord(wSched[idx].ci, wSched[idx].cl); }
    }, TIMER_MS);
  }
  function stopTmr() { if (tmr) { clearInterval(tmr); tmr = null; } }

  // ── playback ──
  function startFrom(r, from) {
    if (!synth) return;
    stopNarration();
    root = r; tMap = buildMap(r); fText = buildText(tMap);
    if (!fText.trim()) return;
    from = from || 0;
    var txt = fText.substring(from); if (!txt.trim()) return;
    chunks = chunkify(txt, from); chunkIdx = 0;
    genId++; bFired = false; cpm = DEFAULT_CPM;
    state = 'playing'; updBtn(); speakNext();
  }

  function speakNext() {
    if (state === 'stopped' || chunkIdx >= chunks.length) { onDone(); return; }
    var id = genId, ch = chunks[chunkIdx], t0 = Date.now();
    wSched = wordSched(ch.text, ch.sc);
    var u = new SpeechSynthesisUtterance(ch.text);
    u.rate = rate; u.pitch = 1; if (voice) u.voice = voice;
    u.onboundary = function (e) {
      if (id !== genId) return;
      if (e.name === 'word') {
        if (!bFired) { bFired = true; stopTmr(); }
        hlWord(ch.sc + e.charIndex, e.charLength || 0);
      }
    };
    u.onend = function () {
      if (id !== genId) return; stopTmr();
      var el = Date.now() - t0 - pDur;
      if (el > 100 && ch.text.length > 5) cpm = ch.text.length / el;
      chunkIdx++;
      if (chunkIdx < chunks.length) speakNext(); else onDone();
    };
    u.onerror = function () { if (id === genId) onDone(); };
    if (!bFired) startTmr();
    synth.speak(u);
  }

  function stopNarration() {
    genId++; state = 'stopped'; stopTmr(); hideOv();
    if (synth) { synth.cancel(); synth.cancel(); }
    chunks = []; chunkIdx = 0; tMap = []; fText = ''; root = null; updBtn();
  }

  function onDone() { stopTmr(); hideOv(); state = 'stopped'; chunks = []; chunkIdx = 0; updBtn(); }

  function updBtn() {
    var b = document.getElementById('narr-play'); if (!b) return;
    b.textContent = state === 'playing' ? '⏸' : '▶';
    b.title = state === 'playing' ? 'Pause' : (active ? 'Play from here' : 'Play from top');
  }

  // ── toggle click-to-narrate ──
  function toggleActive() {
    active = !active;
    localStorage.setItem(LS_ACTIVE, active ? '1' : '0');
    _updateToggle();
    if (active) {
      setupClickHandler();
    } else {
      stopNarration();
      removeClickHandler();
    }
  }

  function _updateToggle() {
    var btn = document.getElementById('narr-toggle');
    if (!btn) return;
    btn.textContent = active ? '🔊' : '🔇';
    btn.title = active ? 'Disable click-to-narrate' : 'Enable click-to-narrate';
    if (active) btn.classList.add('active');
    else btn.classList.remove('active');
  }

  // ── click to start ──
  function setupClickHandler() {
    removeClickHandler();
    var t = getEl();
    if (!t || !synth || !active) return;
    if (!(AP.preview && AP.preview.isPreview())) return;

    _click = function (e) {
      if (!active) return;
      if (e.target.closest('button, a, select, label, .narr-bar, .preview-kc-option')) return;

      hideOv();
      var rng = null;
      if (document.caretRangeFromPoint) rng = document.caretRangeFromPoint(e.clientX, e.clientY);
      else if (document.caretPositionFromPoint) {
        var p = document.caretPositionFromPoint(e.clientX, e.clientY);
        if (p && p.offsetNode) { rng = document.createRange(); rng.setStart(p.offsetNode, p.offset); }
      }
      if (!rng) return;

      var cn = rng.startContainer, co = rng.startOffset;
      if (cn.nodeType !== 3) {
        if (cn.childNodes && cn.childNodes[co]) {
          var tw = document.createTreeWalker(cn.childNodes[co], NodeFilter.SHOW_TEXT);
          var f = tw.nextNode(); if (f) { cn = f; co = 0; } else return;
        } else {
          var tw2 = document.createTreeWalker(cn, NodeFilter.SHOW_TEXT);
          var ls = null, nd; while ((nd = tw2.nextNode())) ls = nd;
          if (ls) { cn = ls; co = ls.textContent.length; } else return;
        }
      }

      var tm = buildMap(t), entry = null;
      for (var i = 0; i < tm.length; i++) if (tm[i].node === cn) { entry = tm[i]; break; }
      if (!entry) return;

      var cp = entry.start + co, ft = buildText(tm);
      while (cp > 0 && !/\s/.test(ft[cp - 1])) cp--;

      if (state !== 'stopped') { stopNarration(); setTimeout(function () { startFrom(t, cp); }, 60); }
      else startFrom(t, cp);
    };

    t.addEventListener('click', _click);
    t.style.cursor = 'text';
  }

  function removeClickHandler() {
    var t = getEl();
    if (t && _click) { t.removeEventListener('click', _click); t.style.cursor = ''; }
    _click = null;
  }

  // ── mode change (called by editor.js) ──
  function onModeChange() {
    var isPrev = AP.preview && AP.preview.isPreview();
    var bar = document.getElementById('narr-bar');
    if (bar) {
      if (isPrev) bar.classList.add('open');
      else bar.classList.remove('open');
    }
    if (isPrev && active) {
      setupClickHandler();
    } else {
      stopNarration();
      removeClickHandler();
    }
    _updateToggle();
  }

  // ── init ──
  function init() {
    if (!synth) return;
    var sr = parseFloat(localStorage.getItem(LS_RATE));
    if (sr && !isNaN(sr)) rate = sr;
    active = localStorage.getItem(LS_ACTIVE) === '1';

    loadVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

    var rs = document.getElementById('narr-rate');
    if (rs) {
      rs.innerHTML = '';
      RATES.forEach(function (r) {
        var o = document.createElement('option'); o.value = r; o.textContent = r + 'x';
        if (r === rate) o.selected = true; rs.appendChild(o);
      });
    }

    _updateToggle();

    // Wire toggle
    var toggleBtn = document.getElementById('narr-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleActive);

    // Wire play — starts from current scroll position (first visible text)
    var playBtn = document.getElementById('narr-play');
    if (playBtn) playBtn.addEventListener('click', function () {
      if (state === 'stopped') {
        var t = getEl(); if (!t) return;
        var from = findFirstVisibleChar(t);
        startFrom(t, from);
      }
      else if (state === 'paused') { synth.resume(); state = 'playing'; pDur += Date.now() - pStart; updBtn(); }
      else { synth.pause(); state = 'paused'; pStart = Date.now(); updBtn(); }
    });

    var stopBtn = document.getElementById('narr-stop');
    if (stopBtn) stopBtn.addEventListener('click', stopNarration);

    var voiceSel = document.getElementById('narr-voice');
    if (voiceSel) voiceSel.addEventListener('change', function () {
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].name === this.value) { voice = voices[i]; localStorage.setItem(LS_VOICE, this.value); break; }
      }
    });

    if (rs) rs.addEventListener('change', function () {
      rate = parseFloat(this.value) || 1; localStorage.setItem(LS_RATE, String(rate));
    });
  }

  AP.narration = {
    init: init,
    isSupported: isSupported,
    stop: stopNarration,
    setupClickHandler: setupClickHandler,
    removeClickHandler: removeClickHandler,
    onModeChange: onModeChange
  };
})();
