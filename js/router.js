/* AP -- Router */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  function go(view, param) {
    if (view === 'catalog') {
      _showView('view-catalog');
      AP.catalogView.render();
      _setBreadcrumb('Catalog', '');
    } else if (view === 'editor' && param) {
      var project = AP.state.openProject(param);
      if (!project) { AP.ui.toast('Project not found', 'error'); go('catalog'); return; }
      _showView('view-editor');
      AP.tree.render(project);
      AP.editor.showPlaceholder();
      _setBreadcrumb(project.title, '');
      _updateProjectHeader(project);
    }
  }

  function _showView(id) {
    AP.ui.qsa('.view').forEach(function (v) { v.classList.remove('active'); });
    var v = document.getElementById(id);
    if (v) v.classList.add('active');

    // Update sidebar nav
    AP.ui.qsa('.sb-nav-item').forEach(function (item) { item.classList.remove('active'); });
    if (id === 'view-catalog') {
      var el = document.querySelector('[data-nav="catalog"]');
      if (el) el.classList.add('active');
    }
  }

  function _setBreadcrumb(left, right) {
    var bc = AP.ui.qs('#topbar-breadcrumb');
    if (!bc) return;
    bc.innerHTML = [
      '<span style="cursor:pointer" id="bc-catalog">Catalog</span>',
      left && left !== 'Catalog' ? '<span class="bc-sep">›</span><span class="bc-current">' + AP.ui.escapeHtml(left) + '</span>' : ''
    ].join('');
    var catLink = bc.querySelector('#bc-catalog');
    if (catLink) catLink.onclick = function () { go('catalog'); };
  }

  function _updateProjectHeader(project) {
    var title = AP.ui.qs('#toolbar-project-title');
    if (title) title.textContent = project.title || 'Untitled';
    var badge = AP.ui.qs('#toolbar-product-badge');
    if (badge) badge.textContent = project.product || '';
  }

  AP.router = { go: go };
})();
