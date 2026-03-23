/* AP -- PWA Export
 * Generates a self-contained course player as a ZIP.
 * The output is a mini OB player with:
 *   - Course dashboard with module cards + progress
 *   - Topic viewer with next/prev navigation + mark complete
 *   - Knowledge check quiz
 *   - Sidebar with progress tracking
 *   - Service worker for offline use
 *   - PWA manifest for installation
 */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  function exportPWA(project) {
    if (!project) { AP.ui.toast('No project to export', 'error'); return; }

    var slug = AP.exportMgr.slugify(project.title);
    var courseJson = AP.exportMgr.buildCourseJson(project);
    var glossaryJson = AP.exportMgr.buildGlossaryJson(project);

    // Build content files
    var files = {};
    files['content/course.json'] = JSON.stringify(courseJson, null, 2);
    files['content/glossary.json'] = JSON.stringify(glossaryJson, null, 2);

    (project.modules || []).forEach(function (mod, idx) {
      var modSlug = AP.exportMgr.slugify(mod.title);
      files['content/modules/' + modSlug + '.json'] = JSON.stringify(AP.exportMgr.buildModuleJson(mod, idx), null, 2);
      files['content/quizzes/q' + (idx + 1) + '-' + modSlug + '.json'] = JSON.stringify(AP.exportMgr.buildQuizJson(project, mod, idx), null, 2);
    });

    // Generate PWA shell
    files['manifest.json'] = JSON.stringify({
      name: 'PTC Training: ' + (courseJson.title || 'Course'),
      short_name: courseJson.title || 'Course',
      start_url: '.', display: 'standalone',
      background_color: '#1a1c1e', theme_color: '#69be28', icons: []
    }, null, 2);

    var allPaths = ['./','./index.html','./manifest.json'];
    Object.keys(files).forEach(function (p) {
      if (p !== 'manifest.json') allPaths.push('./' + p);
    });
    // Build content bundle — all JSON embedded for file:// compatibility
    var bundle = {};
    (project.modules || []).forEach(function (mod, idx) {
      var modSlug = AP.exportMgr.slugify(mod.title);
      bundle['modules/' + modSlug + '.json'] = AP.exportMgr.buildModuleJson(mod, idx);
      bundle['quizzes/q' + (idx + 1) + '-' + modSlug + '.json'] = AP.exportMgr.buildQuizJson(project, mod, idx);
    });
    bundle['glossary.json'] = glossaryJson;

    files['service-worker.js'] = _buildSW(allPaths);
    files['index.html'] = _buildPlayerHTML(courseJson, bundle);

    // ZIP
    AP.exportMgr.ensureJSZip(function () {
      var zip = new JSZip();
      var folder = zip.folder(slug);
      Object.keys(files).forEach(function (p) { folder.file(p, files[p]); });
      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = slug + '-pwa.zip'; a.click();
        URL.revokeObjectURL(url);
        AP.ui.toast('PWA exported: ' + slug + '-pwa.zip', 'success', 3500);
      });
    }, function () { AP.ui.toast('Failed to load JSZip', 'error'); });
  }

  function _buildSW(paths) {
    return "var C='ptc-v1',P=" + JSON.stringify(paths) + ";\n" +
      "self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(P)}));self.skipWaiting()});\n" +
      "self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==C}).map(function(x){return caches.delete(x)}))}));self.clients.claim()});\n" +
      "self.addEventListener('fetch',function(e){e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request)}))});";
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function _buildPlayerHTML(courseJson, bundle) {
    // The entire player is a single HTML file with inline CSS + JS
    // All content is embedded — works from file:// without a server
    return '<!DOCTYPE html>\n<html lang="en" data-theme="dark">\n<head>\n' +
      '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<title>' + _esc(courseJson.title) + '</title>\n' +
      '<link rel="manifest" href="manifest.json">\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700&family=Open+Sans:wght@400;500;600&display=swap" rel="stylesheet">\n' +
      '<style>\n' + _playerCSS() + '\n</style>\n</head>\n<body>\n' +
      '<div class="app">\n' +
      '  <aside class="sidebar" id="sidebar">\n' +
      '    <div class="sb-hdr"><h1>' + _esc(courseJson.title) + '</h1>\n' +
      '      <div class="sb-ctrls"><button class="icon-btn" id="theme-btn" title="Toggle theme">☽</button></div></div>\n' +
      '    <nav class="sb-nav" id="sb-nav"></nav>\n' +
      '    <div class="sb-progress" id="sb-progress"></div>\n' +
      '  </aside>\n' +
      '  <div class="sidebar-overlay" id="sb-overlay"></div>\n' +
      '  <div class="main-wrap">\n' +
      '    <div class="topbar"><button class="menu-btn" id="menu-btn">☰</button><div class="bc" id="bc"></div></div>\n' +
      '    <main class="main" id="main"></main>\n' +
      '  </div>\n' +
      '</div>\n' +
      '<script>\n' + _playerJS(courseJson, bundle) + '\n</script>\n' +
      '<script>if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js").catch(function(){});</script>\n' +
      '</body></html>';
  }

  // ── Inline CSS for the player ──
  function _playerCSS() {
    return [
      '*{margin:0;padding:0;box-sizing:border-box}',
      ':root{--font-d:"Raleway",sans-serif;--font-b:"Open Sans",system-ui,sans-serif;--r:8px}',
      '[data-theme="dark"]{--bg:#1a1c1e;--bg2:#27292b;--bg3:#2b332a;--bdr:#43474a;--tx:#ddddd9;--tx2:#b8b8b4;--tx3:#8a8d90;--tx4:#636669;--ac:#69be28;--acd:rgba(105,190,40,.12);--acg:rgba(105,190,40,.25);--on-ac:#1a1c1e;--dng:#ef4444;--inf:#3b82f6;--wrn:#f59e0b;--sh:0 4px 16px rgba(0,0,0,.4)}',
      '[data-theme="light"]{--bg:#f5f6f4;--bg2:#fff;--bg3:#edf7e0;--bdr:#e2e2e2;--tx:#2b2d2f;--tx2:#53565a;--tx3:#6b6e72;--tx4:#8a8d90;--ac:#4d8f1e;--acd:rgba(105,190,40,.1);--acg:rgba(105,190,40,.2);--on-ac:#fff;--dng:#dc2626;--inf:#2563eb;--wrn:#d97706;--sh:0 4px 16px rgba(0,0,0,.1)}',
      'body{font-family:var(--font-b);background:var(--bg);color:var(--tx);line-height:1.6}',
      'a{color:var(--ac);text-decoration:none}',
      // App layout
      '.app{display:flex;height:100vh}',
      '.sidebar{width:280px;background:var(--bg2);border-right:1px solid var(--bdr);display:flex;flex-direction:column;flex-shrink:0;z-index:50}',
      '.sb-hdr{padding:14px 16px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between}',
      '.sb-hdr h1{font-family:var(--font-d);font-size:13px;font-weight:700;color:var(--ac)}',
      '.sb-ctrls{display:flex;gap:4px}',
      '.icon-btn{width:28px;height:28px;border-radius:var(--r);border:1px solid var(--bdr);background:none;color:var(--tx3);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center}',
      '.icon-btn:hover{border-color:var(--ac);color:var(--ac)}',
      '.sb-nav{flex:1;overflow-y:auto;padding:8px 0}',
      '.sb-item{padding:7px 16px;font-size:12px;color:var(--tx3);cursor:pointer;display:flex;align-items:center;gap:8px}',
      '.sb-item:hover{background:var(--bg3);color:var(--tx)}',
      '.sb-item.active{background:var(--acd);color:var(--ac);font-weight:600}',
      '.sb-item .check{width:14px;font-size:11px;flex-shrink:0;color:var(--tx4)}',
      '.sb-item .check.done{color:var(--ac)}',
      '.sb-mod{margin-bottom:2px}',
      '.sb-mod-hdr{padding:8px 16px;font-size:12px;font-weight:600;color:var(--tx3);cursor:pointer;display:flex;align-items:center;gap:6px}',
      '.sb-mod-hdr:hover{background:var(--bg3);color:var(--tx)}',
      '.sb-mod-hdr .arr{font-size:8px;transition:transform .2s;flex-shrink:0}',
      '.sb-mod-hdr.open .arr{transform:rotate(90deg)}',
      '.sb-mod-hdr .cnt{margin-left:auto;font-size:10px;color:var(--tx4)}',
      '.sb-topics{display:none;padding-left:10px}',
      '.sb-mod-hdr.open+.sb-topics{display:block}',
      '.sb-dash{padding:8px 16px;font-size:12px;font-weight:600;color:var(--ac);cursor:pointer;border-bottom:1px solid var(--bdr);margin-bottom:4px}',
      '.sb-dash:hover{background:var(--acd)}',
      '.sb-progress{padding:10px 16px;border-top:1px solid var(--bdr);font-size:11px;color:var(--tx4)}',
      '.sb-progress-bar{height:4px;background:var(--bdr);border-radius:2px;margin-top:4px}',
      '.sb-progress-fill{height:100%;background:var(--ac);border-radius:2px;transition:width .3s}',
      '.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:40}',
      // Main
      '.main-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden}',
      '.topbar{display:none;padding:0 12px;height:44px;border-bottom:1px solid var(--bdr);align-items:center;gap:8px;background:var(--bg2)}',
      '.menu-btn{width:32px;height:32px;border:none;background:none;color:var(--tx);font-size:18px;cursor:pointer}',
      '.bc{font-size:12px;color:var(--tx3)}',
      '.main{flex:1;overflow-y:auto;padding:32px 40px}',
      // Buttons
      '.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border-radius:var(--r);font-size:13px;font-weight:600;font-family:var(--font-b);cursor:pointer;border:1px solid var(--bdr);transition:all .15s}',
      '.btn-primary{background:var(--ac);color:var(--on-ac);border-color:var(--ac)}',
      '.btn-primary:hover{filter:brightness(1.1)}',
      '.btn-outline{background:none;color:var(--tx2)}',
      '.btn-outline:hover{border-color:var(--ac);color:var(--ac)}',
      '.btn-sm{padding:6px 12px;font-size:12px}',
      // Dashboard
      '.dash-desc{font-size:14px;color:var(--tx2);margin-bottom:24px;line-height:1.6}',
      '.dash-stats{display:flex;gap:16px;margin-bottom:24px}',
      '.stat-card{background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r);padding:14px 18px;text-align:center;min-width:100px}',
      '.stat-val{font-family:var(--font-d);font-size:22px;font-weight:700;color:var(--ac)}',
      '.stat-lbl{font-size:11px;color:var(--tx4);margin-top:2px}',
      '.mod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}',
      '.mod-card{background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r);padding:18px;cursor:pointer;transition:all .15s}',
      '.mod-card:hover{border-color:var(--acg);transform:translateY(-2px);box-shadow:var(--sh)}',
      '.mod-card h3{font-family:var(--font-d);font-size:14px;font-weight:700;margin-bottom:6px}',
      '.mod-card p{font-size:12px;color:var(--tx3);margin-bottom:8px;line-height:1.5}',
      '.mod-card-meta{display:flex;gap:12px;font-size:11px;color:var(--tx4);margin-bottom:8px}',
      '.prog-bar{height:4px;background:var(--bdr);border-radius:2px}',
      '.prog-fill{height:100%;background:var(--ac);border-radius:2px}',
      // Topic
      'h1.t-title{font-family:var(--font-d);font-size:22px;font-weight:700;margin-bottom:6px}',
      '.t-meta{display:flex;gap:8px;margin-bottom:20px;font-size:12px;color:var(--tx3);flex-wrap:wrap}',
      '.badge{padding:2px 8px;border-radius:10px;background:var(--acd);color:var(--ac);font-size:10px;font-weight:700}',
      '.t-nav{display:flex;justify-content:space-between;margin-top:28px;padding-top:16px;border-top:1px solid var(--bdr)}',
      '.mark-bar{display:flex;align-items:center;gap:12px;margin-top:20px;padding:12px 16px;background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r)}',
      '.mark-bar .lbl{font-size:13px;flex:1}',
      // Content blocks
      'h2.ph{font-family:var(--font-d);font-size:18px;font-weight:700;margin:20px 0 10px}',
      'h3.ph{font-family:var(--font-d);font-size:15px;font-weight:700;margin:16px 0 8px}',
      'p.pp{font-size:14px;line-height:1.7;margin-bottom:12px}',
      '.co{display:flex;gap:10px;padding:12px 16px;border-radius:var(--r);margin:12px 0;font-size:13px;line-height:1.6}',
      '.co-info{background:rgba(59,130,246,.08);border-left:3px solid var(--inf)}',
      '.co-tip{background:var(--acd);border-left:3px solid var(--ac)}',
      '.co-warning{background:rgba(245,158,11,.08);border-left:3px solid var(--wrn)}',
      '.co-insight{background:rgba(192,132,252,.08);border-left:3px solid #c084fc}',
      '.co-icon{font-size:16px;flex-shrink:0}',
      '.tw{overflow-x:auto;margin:12px 0}',
      'table.dt{width:100%;border-collapse:collapse;font-size:13px}',
      'table.dt th,table.dt td{padding:8px 12px;border:1px solid var(--bdr);text-align:left}',
      'table.dt th{background:var(--bg3);font-weight:600;font-size:12px}',
      '.rc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin:12px 0}',
      '.rc{background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r);padding:14px;cursor:pointer;text-align:center;font-size:13px;min-height:80px;display:flex;flex-direction:column;justify-content:center}',
      '.rc .back{display:none;color:var(--ac);margin-top:8px}.rc.flipped .front{color:var(--tx4);font-size:11px}.rc.flipped .back{display:block}.rc.flipped .hint{display:none}',
      '.rc .hint{font-size:10px;color:var(--tx4);margin-top:4px}',
      '.im{margin:12px 0;padding:16px;background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r)}',
      '.im-prompt{font-size:13px;margin-bottom:10px;font-weight:600}',
      '.im-cols{display:flex;gap:16px}.im-col{flex:1}',
      '.im-lbl{font-size:10px;font-weight:700;color:var(--tx4);margin-bottom:6px;text-transform:uppercase}',
      '.im-item{padding:6px 10px;border:1px solid var(--bdr);border-radius:var(--r);margin-bottom:4px;font-size:12px}',
      '.is{margin:12px 0}.is-prompt{font-size:13px;font-weight:600;margin-bottom:8px}',
      '.is-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--bdr);border-radius:var(--r);margin-bottom:4px;font-size:13px}',
      '.is-handle{color:var(--tx4)}.is-num{font-weight:700;color:var(--ac);font-size:12px;width:16px}',
      '.pi{margin:12px 0;text-align:center}.pi img{max-width:100%;border-radius:var(--r)}.pi figcaption{font-size:11px;color:var(--tx3);margin-top:6px}',
      '.ex{margin:16px 0;padding:16px;border:1px solid var(--bdr);border-radius:var(--r);background:var(--bg2)}',
      '.ex-lbl{font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;margin-bottom:4px}',
      '.ex-obj p{font-size:13px;line-height:1.5}',
      '.ex-task{margin-top:12px}.ex-task h4{font-size:13px;font-weight:700;margin-bottom:6px}',
      '.ex-step{display:flex;gap:10px;margin-bottom:8px}',
      '.ex-sn{font-weight:700;color:var(--ac);font-size:13px;min-width:18px;text-align:center;flex-shrink:0}',
      '.ex-sd{font-size:12px;color:var(--tx3);margin-top:2px}',
      '.ex-sh{font-size:12px;color:var(--tx4);font-style:italic;margin-top:2px}',
      // Knowledge check
      '.kc{margin:16px 0;padding:16px;border:1px solid var(--bdr);border-radius:var(--r);background:var(--bg2)}',
      '.kc-title{font-family:var(--font-d);font-size:16px;font-weight:700;color:var(--ac);margin-bottom:12px}',
      '.kc-q{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--bdr)}',
      '.kc-q:last-child{border:none;margin:0;padding:0}',
      '.kc-qt{font-size:13px;margin-bottom:8px}',
      '.kc-opts{display:flex;flex-direction:column;gap:4px}',
      '.kc-opt{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border:1px solid var(--bdr);border-radius:var(--r);cursor:pointer;font-size:12px;transition:all .15s}',
      '.kc-opt:hover{border-color:var(--ac);background:var(--acd)}',
      '.kc-done .kc-opt{cursor:default}.kc-done .kc-opt:hover{border-color:var(--bdr);background:none}',
      '.kc-radio{width:16px;height:16px;border:2px solid var(--tx4);border-radius:50%;flex-shrink:0;margin-top:1px}',
      '.kc-opt.kc-y .kc-radio{border-color:#69be28;background:#69be28}',
      '.kc-opt.kc-n .kc-radio{border-color:var(--dng);background:var(--dng)}',
      '.kc-opt.kc-y{border-color:#69be28;background:rgba(105,190,40,.08)}',
      '.kc-opt.kc-n{border-color:var(--dng);background:rgba(239,68,68,.08)}',
      '.kc-rat{display:none;margin-top:8px;padding:8px 12px;background:var(--acd);border-left:3px solid var(--ac);border-radius:0 var(--r) var(--r) 0;font-size:12px;line-height:1.5}',
      '.kc-rat.vis{display:block}',
      // Takeaways
      '.tka{margin-top:24px;padding:16px;background:var(--acd);border:1px solid var(--acg);border-radius:var(--r)}',
      '.tka h3{font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--ac);margin-bottom:8px}',
      '.tka li{font-size:13px;line-height:1.6;margin-left:16px;margin-bottom:4px}',
      // Mobile
      '@media(max-width:768px){',
      '  .sidebar{position:fixed;left:0;top:0;bottom:0;transform:translateX(-280px);transition:transform .2s;z-index:50}',
      '  .sidebar.open{transform:translateX(0)}',
      '  .sidebar-overlay.vis{display:block}',
      '  .topbar{display:flex}',
      '  .main{padding:20px}',
      '}'
    ].join('\n');
  }

  // ── Inline JS for the player ──
  function _playerJS(courseJson, bundle) {
    // Use array of lines to avoid quoting hell
    var L = [];
    function w(s) { L.push(s); }

    w('(function(){');
    w('"use strict";');
    w('var course=' + JSON.stringify(courseJson) + ';');
    w('var _bundle=' + JSON.stringify(bundle) + ';');
    w('var courseId=course.id;');
    w('var main=document.getElementById("main");');
    w('var nav=document.getElementById("sb-nav");');
    w('var modules={};');
    w('var LS_PRE="ob_"+courseId+"_";');
    w('var _activeTopic=null;');
    w('');
    w('function getCompleted(){try{return JSON.parse(localStorage.getItem(LS_PRE+"topics")||"{}")}catch(e){return{}}}');
    w('function setCompleted(c){localStorage.setItem(LS_PRE+"topics",JSON.stringify(c))}');
    w('function isComplete(tid){return!!getCompleted()[tid]}');
    w('function markComplete(tid){var c=getCompleted();c[tid]={completed:true,at:new Date().toISOString()};setCompleted(c);renderSidebar();updateProgress()}');
    w('function markIncomplete(tid){var c=getCompleted();delete c[tid];setCompleted(c);renderSidebar();updateProgress()}');
    w('function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}');
    w('function safe(s){if(!s)return"";var t=esc(s);return t.replace(/&lt;(\\/?(?:strong|em|code|br)\\s*\\/?)&gt;/gi,"<$1>")}');
    w('');
    w('document.getElementById("theme-btn").onclick=function(){var d=document.documentElement,t=d.getAttribute("data-theme")==="dark"?"light":"dark";d.setAttribute("data-theme",t);this.textContent=t==="dark"?"\\u263d":"\\u2600"};');
    w('var sb=document.getElementById("sidebar"),ol=document.getElementById("sb-overlay");');
    w('document.getElementById("menu-btn").onclick=function(){sb.classList.toggle("open");ol.classList.toggle("vis")};');
    w('ol.onclick=function(){sb.classList.remove("open");ol.classList.remove("vis")};');
    w('');
    w('function loadMod(f,cb){if(modules[f]){cb(modules[f]);return}if(_bundle[f]){modules[f]=_bundle[f];cb(_bundle[f]);return}fetch("content/"+f).then(function(r){return r.json()}).then(function(d){modules[f]=d;cb(d)}).catch(function(){cb(null)})}');
    w('');
    w('function renderSidebar(){');
    w('  var h="<div class=\\"sb-dash\\" id=\\"sb-dash\\">Dashboard</div>";');
    w('  var comp=getCompleted();');
    w('  course.modules.forEach(function(m,mi){');
    w('    h+="<div class=\\"sb-mod\\"><div class=\\"sb-mod-hdr open\\" data-mi=\\""+mi+"\\">";');
    w('    h+="<span class=\\"arr\\">\\u25b6</span>"+esc(m.title)+"</div>";');
    w('    h+="<div class=\\"sb-topics\\"><div id=\\"sbt-"+mi+"\\"></div></div></div>";');
    w('  });');
    w('  nav.innerHTML=h;');
    w('  document.getElementById("sb-dash").onclick=function(){go("dash")};');
    w('  course.modules.forEach(function(m,mi){');
    w('    loadMod(m.contentFile,function(mod){');
    w('      if(!mod)return;var el=document.getElementById("sbt-"+mi);if(!el)return;');
    w('      var th="";');
    w('      mod.topics.forEach(function(t){');
    w('        var done=comp[t.id];');
    w('        th+="<div class=\\"sb-item"+(_activeTopic===t.id?" active":"")+"\\" data-cf=\\""+m.contentFile+"\\" data-tid=\\""+t.id+"\\">";');
    w('        th+="<span class=\\"check"+(done?" done":"")+"\\">"+( done?"\\u2713":"\\u25cb")+"</span>";');
    w('        th+="<span>"+esc(t.title)+"</span></div>";');
    w('      });');
    w('      if(m.quizFile)th+="<div class=\\"sb-item\\" data-qf=\\""+m.quizFile+"\\"><span class=\\"check\\">\\u270d</span><span>Knowledge Check</span></div>";');
    w('      el.innerHTML=th;');
    w('      el.querySelectorAll(".sb-item").forEach(function(item){');
    w('        item.onclick=function(){');
    w('          var cf=item.getAttribute("data-cf"),tid=item.getAttribute("data-tid"),qf=item.getAttribute("data-qf");');
    w('          if(qf)go("quiz",qf);else if(cf)go("topic",cf,tid);');
    w('        };');
    w('      });');
    w('    });');
    w('  });');
    w('  nav.querySelectorAll(".sb-mod-hdr").forEach(function(h){h.onclick=function(){h.classList.toggle("open")}});');
    w('}');
    w('');
    w('function updateProgress(){');
    w('  var total=0,done=0,comp=getCompleted();');
    w('  Object.keys(modules).forEach(function(k){(modules[k].topics||[]).forEach(function(t){total++;if(comp[t.id])done++})});');
    w('  var pct=total?Math.round(done/total*100):0;');
    w('  document.getElementById("sb-progress").innerHTML="<span>"+pct+"% complete ("+done+"/"+total+")</span><div class=\\"sb-progress-bar\\"><div class=\\"sb-progress-fill\\" style=\\"width:"+pct+"%\\"></div></div>";');
    w('}');
    w('');
    w('window.go=function(v,a,b){sb.classList.remove("open");ol.classList.remove("vis");if(v==="dash")renderDashboard();else if(v==="topic")renderTopic(a,b);else if(v==="quiz")renderQuiz(a)};');
    w('');
    w('function renderDashboard(){');
    w('  _activeTopic=null;renderSidebar();');
    w('  var comp=getCompleted();');
    w('  var h="<h1 style=\\"font-family:var(--font-d);font-size:22px;margin-bottom:8px\\">"+esc(course.title)+"</h1>";');
    w('  if(course.description)h+="<p class=\\"dash-desc\\">"+safe(course.description)+"</p>";');
    w('  h+="<div class=\\"dash-stats\\" id=\\"dash-stats\\"></div>";');
    w('  h+="<div class=\\"mod-grid\\">";');
    w('  course.modules.forEach(function(m,mi){');
    w('    h+="<div class=\\"mod-card\\" data-cf=\\""+m.contentFile+"\\">";');
    w('    h+="<div style=\\"font-size:10px;font-weight:700;color:var(--ac);margin-bottom:4px\\">Module "+(mi+1)+"</div>";');
    w('    h+="<h3>"+esc(m.title)+"</h3>";');
    w('    if(m.description)h+="<p>"+esc(m.description)+"</p>";');
    w('    h+="<div class=\\"mod-card-meta\\"><span>~"+m.estimatedMinutes+" min</span><span>"+m.topicCount+" topics</span></div>";');
    w('    h+="<div class=\\"prog-bar\\"><div class=\\"prog-fill\\" id=\\"prog-"+mi+"\\" style=\\"width:0%\\"></div></div>";');
    w('    h+="</div>";');
    w('  });');
    w('  h+="</div>";');
    w('  main.innerHTML=h;');
    w('  main.querySelectorAll(".mod-card").forEach(function(c){c.onclick=function(){go("topic",c.getAttribute("data-cf"))}});');
    w('  course.modules.forEach(function(m,mi){');
    w('    loadMod(m.contentFile,function(mod){');
    w('      if(!mod)return;var total=mod.topics.length,done=0;');
    w('      mod.topics.forEach(function(t){if(comp[t.id])done++});');
    w('      var bar=document.getElementById("prog-"+mi);if(bar)bar.style.width=(total?Math.round(done/total*100):0)+"%";');
    w('    });');
    w('  });');
    w('  setTimeout(function(){');
    w('    var total=0,done=0;Object.keys(modules).forEach(function(k){(modules[k].topics||[]).forEach(function(t){total++;if(comp[t.id])done++})});');
    w('    var pct=total?Math.round(done/total*100):0;');
    w('    var el=document.getElementById("dash-stats");');
    w('    if(el)el.innerHTML="<div class=\\"stat-card\\"><div class=\\"stat-val\\">"+pct+"%</div><div class=\\"stat-lbl\\">Complete</div></div><div class=\\"stat-card\\"><div class=\\"stat-val\\">"+done+"/"+total+"</div><div class=\\"stat-lbl\\">Topics</div></div>";');
    w('  },500);');
    w('}');
    w('');
    w('function renderTopic(contentFile,topicId){');
    w('  loadMod(contentFile,function(mod){');
    w('    if(!mod){main.innerHTML="<p>Module not found</p>";return}');
    w('    var topic=null,topicIdx=-1;');
    w('    if(!topicId&&mod.topics.length){topic=mod.topics[0];topicIdx=0;topicId=topic.id}');
    w('    else{mod.topics.forEach(function(t,i){if(t.id===topicId){topic=t;topicIdx=i}})}');
    w('    if(!topic){main.innerHTML="<p>Topic not found</p>";return}');
    w('    _activeTopic=topicId;renderSidebar();');
    w('    var courseMod=null;course.modules.forEach(function(m){if(m.contentFile===contentFile)courseMod=m});');
    w('    var h="<h1 class=\\"t-title\\">"+esc(topic.title)+"</h1>";');
    w('    h+="<div class=\\"t-meta\\"><span class=\\"badge\\">"+(courseMod?esc(courseMod.title):"")+"</span><span>~"+(topic.estimatedMinutes||5)+" min</span></div>";');
    w('    if(mod.description)h+="<p style=\\"font-size:13px;color:var(--tx3);margin-bottom:16px\\">"+safe(mod.description)+"</p>";');
    w('    (topic.content||[]).forEach(function(b){h+=renderBlock(b)});');
    w('    if(topic.keyTakeaways&&topic.keyTakeaways.length){');
    w('      var has=topic.keyTakeaways.some(function(t){return t&&t.trim()});');
    w('      if(has){h+="<div class=\\"tka\\"><h3>Key Takeaways</h3><ul>";topic.keyTakeaways.forEach(function(t){if(t&&t.trim())h+="<li>"+safe(t)+"</li>"});h+="</ul></div>"}');
    w('    }');
    w('    var done=isComplete(topicId);');
    w('    h+="<div class=\\"mark-bar\\"><span class=\\"lbl\\">"+(done?"Completed":"Mark this topic as complete")+"</span>";');
    w('    h+="<button class=\\"btn btn-sm "+(done?"btn-outline":"btn-primary")+"\\" id=\\"mark-btn\\">"+(done?"\\u2713 Undo":"Mark Complete")+"</button></div>";');
    w('    h+="<div class=\\"t-nav\\">";');
    w('    if(topicIdx>0)h+="<button class=\\"btn btn-outline btn-sm\\" id=\\"prev-btn\\">\\u2190 Previous</button>";');
    w('    else h+="<button class=\\"btn btn-outline btn-sm\\" id=\\"prev-btn\\">\\u2190 Dashboard</button>";');
    w('    if(topicIdx<mod.topics.length-1)h+="<button class=\\"btn btn-primary btn-sm\\" id=\\"next-btn\\">Next \\u2192</button>";');
    w('    else if(courseMod&&courseMod.quizFile)h+="<button class=\\"btn btn-primary btn-sm\\" id=\\"next-btn\\">Take Quiz \\u2192</button>";');
    w('    else h+="<button class=\\"btn btn-primary btn-sm\\" id=\\"next-btn\\">Dashboard</button>";');
    w('    h+="</div>";');
    w('    main.innerHTML=h;main.scrollTop=0;');
    w('    bindInteractions(main);');
    w('    // Wire nav buttons');
    w('    var prevBtn=document.getElementById("prev-btn");');
    w('    if(prevBtn)prevBtn.onclick=function(){if(topicIdx>0)go("topic",contentFile,mod.topics[topicIdx-1].id);else go("dash")};');
    w('    var nextBtn=document.getElementById("next-btn");');
    w('    if(nextBtn)nextBtn.onclick=function(){if(topicIdx<mod.topics.length-1)go("topic",contentFile,mod.topics[topicIdx+1].id);else if(courseMod&&courseMod.quizFile)go("quiz",courseMod.quizFile);else go("dash")};');
    w('    var markBtn=document.getElementById("mark-btn");');
    w('    if(markBtn)markBtn.onclick=function(){');
    w('      if(isComplete(topicId)){markIncomplete(topicId);markBtn.className="btn btn-sm btn-primary";markBtn.textContent="Mark Complete";markBtn.parentElement.querySelector(".lbl").textContent="Mark this topic as complete"}');
    w('      else{markComplete(topicId);markBtn.className="btn btn-sm btn-outline";markBtn.textContent="\\u2713 Undo";markBtn.parentElement.querySelector(".lbl").textContent="Completed"}');
    w('    };');
    w('  });');
    w('}');
    w('');
    w('function renderQuiz(quizFile){');
    w('  _activeTopic=null;renderSidebar();');
    w('  var _loadQuiz=function(cb){if(_bundle[quizFile]){cb(_bundle[quizFile]);return}fetch("content/"+quizFile).then(function(r){return r.json()}).then(cb).catch(function(){cb(null)})};');
    w('  _loadQuiz(function(quiz){');
    w('    if(!quiz||!quiz.questions||!quiz.questions.length){main.innerHTML="<p>No quiz questions.</p>";return}');
    w('    var h="<h1 class=\\"t-title\\">"+esc(quiz.title||"Knowledge Check")+"</h1><div class=\\"kc\\">";');
    w('    quiz.questions.forEach(function(q,qi){');
    w('      h+="<div class=\\"kc-q\\" data-qi=\\""+qi+"\\"><p class=\\"kc-qt\\"><strong>Q"+(qi+1)+".</strong> "+safe(q.question)+"</p><div class=\\"kc-opts\\">";');
    w('      (q.options||[]).forEach(function(o,oi){h+="<div class=\\"kc-opt\\" data-oi=\\""+oi+"\\" data-ok=\\""+(oi===q.answerIndex)+"\\"><span class=\\"kc-radio\\"></span><span>"+safe(o)+"</span></div>"});');
    w('      h+="</div>"+(q.rationale?"<div class=\\"kc-rat\\">"+safe(q.rationale)+"</div>":"")+"</div>";');
    w('    });');
    w('    h+="</div><div style=\\"margin-top:16px\\"><button class=\\"btn btn-outline btn-sm\\" id=\\"quiz-back\\">\\u2190 Dashboard</button></div>";');
    w('    main.innerHTML=h;main.scrollTop=0;bindInteractions(main);');
    w('    document.getElementById("quiz-back").onclick=function(){go("dash")};');
    w('  }).catch(function(){main.innerHTML="<p>Failed to load quiz.</p>"});');
    w('}');
    w('');
    // Block renderer
    w('function renderBlock(b){');
    w('  var icons={info:"\\u2139",tip:"\\u2605",warning:"\\u26a0",insight:"\\ud83d\\udca1"};');
    w('  switch(b.type){');
    w('    case"heading":return"<"+(b.level===3?"h3":"h2")+" class=\\"ph\\">"+safe(b.text)+"</"+(b.level===3?"h3":"h2")+">";');
    w('    case"paragraph":return b.text?"<p class=\\"pp\\">"+safe(b.text)+"</p>":"";');
    w('    case"callout":return"<div class=\\"co co-"+(b.variant||"info")+"\\"><span class=\\"co-icon\\">"+icons[b.variant||"info"]+"</span><div>"+safe(b.text)+"</div></div>";');
    w('    case"comparison-table":if(!(b.headers||[]).length)return"";var h="<div class=\\"tw\\"><table class=\\"dt\\"><thead><tr>";(b.headers||[]).forEach(function(c){h+="<th>"+safe(c)+"</th>"});h+="</tr></thead><tbody>";(b.rows||[]).forEach(function(r){h+="<tr>";r.forEach(function(c){h+="<td>"+safe(c)+"</td>"});h+="</tr>"});return h+"</tbody></table></div>";');
    w('    case"reveal-cards":var cards=b.cards||[];if(!cards.length)return"";var h="<div class=\\"rc-grid\\">";cards.forEach(function(c,i){h+="<div class=\\"rc\\"><div class=\\"front\\">"+safe(c.front||"Card "+(i+1))+"</div><div class=\\"hint\\">Click to reveal</div><div class=\\"back\\">"+safe(c.back)+"</div></div>"});return h+"</div>";');
    w('    case"interactive-match":var pairs=b.pairs||[];if(!pairs.length)return"";var h="<div class=\\"im\\">";if(b.prompt)h+="<p class=\\"im-prompt\\">"+safe(b.prompt)+"</p>";h+="<div class=\\"im-cols\\"><div class=\\"im-col\\"><div class=\\"im-lbl\\">Items</div>";pairs.forEach(function(p){h+="<div class=\\"im-item\\">"+safe(p.left)+"</div>"});h+="</div><div class=\\"im-col\\"><div class=\\"im-lbl\\">Matches</div>";var sh=pairs.slice();for(var i=sh.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=sh[i];sh[i]=sh[j];sh[j]=t}sh.forEach(function(p){h+="<div class=\\"im-item\\">"+safe(p.right)+"</div>"});return h+"</div></div></div>";');
    w('    case"interactive-sort":var items=b.items||[];if(!items.length)return"";var h="<div class=\\"is\\">";if(b.prompt)h+="<p class=\\"is-prompt\\">"+safe(b.prompt)+"</p>";items.forEach(function(it,i){h+="<div class=\\"is-item\\"><span class=\\"is-handle\\">\\u2630</span><span class=\\"is-num\\">"+(i+1)+"</span><span>"+safe(it)+"</span></div>"});return h+"</div>";');
    w('    case"image":if(!b.src)return"";return"<figure class=\\"pi\\"><img src=\\""+esc(b.src)+"\\" alt=\\""+esc(b.alt||"")+"\\">"+(b.caption?"<figcaption>"+safe(b.caption)+"</figcaption>":"")+"</figure>";');
    w('    case"exercise":var tasks=b.tasks||[];var h="<div class=\\"ex\\">";if(b.objective)h+="<div class=\\"ex-obj\\"><div class=\\"ex-lbl\\">Objective</div><p>"+safe(b.objective)+"</p></div>";tasks.forEach(function(task,ti){h+="<div class=\\"ex-task\\"><h4>"+safe(task.title||"Task "+(ti+1))+"</h4>";(task.steps||[]).forEach(function(s,si){h+="<div class=\\"ex-step\\"><span class=\\"ex-sn\\">"+(si+1)+"</span><div><div>"+safe(s.action)+"</div>"+(s.detail?"<div class=\\"ex-sd\\">"+safe(s.detail)+"</div>":"")+(s.hint?"<div class=\\"ex-sh\\">Hint: "+safe(s.hint)+"</div>":"")+"</div></div>"});h+="</div>"});return h+"</div>";');
    w('    case"knowledge-check":var qs=b.questions||[];if(!qs.length)return"";var h="<div class=\\"kc\\"><h3 class=\\"kc-title\\">Knowledge Check</h3>";qs.forEach(function(q,qi){h+="<div class=\\"kc-q\\" data-qi=\\""+qi+"\\"><p class=\\"kc-qt\\"><strong>Q"+(qi+1)+".</strong> "+safe(q.question)+"</p><div class=\\"kc-opts\\">";(q.options||[]).forEach(function(o,oi){h+="<div class=\\"kc-opt\\" data-oi=\\""+oi+"\\" data-ok=\\""+(oi===q.answerIndex)+"\\"><span class=\\"kc-radio\\"></span><span>"+safe(o)+"</span></div>"});h+="</div>"+(q.rationale?"<div class=\\"kc-rat\\">"+safe(q.rationale)+"</div>":"")+"</div>"});return h+"</div>";');
    w('    default:return""');
    w('  }');
    w('}');
    w('');
    w('function bindInteractions(el){');
    w('  el.querySelectorAll(".rc").forEach(function(c){c.onclick=function(){c.classList.toggle("flipped")}});');
    w('  el.querySelectorAll(".kc-q").forEach(function(q){');
    w('    var done=false;');
    w('    q.querySelectorAll(".kc-opt").forEach(function(o){');
    w('      o.onclick=function(){');
    w('        if(done)return;done=true;');
    w('        o.classList.add(o.getAttribute("data-ok")==="true"?"kc-y":"kc-n");');
    w('        q.querySelectorAll(".kc-opt").forEach(function(x){if(x.getAttribute("data-ok")==="true")x.classList.add("kc-y")});');
    w('        var r=q.querySelector(".kc-rat");if(r)r.classList.add("vis");');
    w('        q.classList.add("kc-done");');
    w('      }');
    w('    });');
    w('  });');
    w('}');
    w('');
    w('renderDashboard();');
    w('})();');

    return L.join('\n');
  }

  AP.pwaExport = { exportPWA: exportPWA };
})();
