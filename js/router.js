/* AP -- Router */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  function go(view, param) {
    // Stop narration when navigating
    if (AP.narration && AP.narration.stop) AP.narration.stop();

    if (view === 'catalog') {
      _showView('view-catalog');
      _setSidebarMode('catalog');
      AP.catalogView.render();
      _setBreadcrumb('Catalog', '');
    } else if (view === 'editor' && param) {
      var project = AP.state.openProject(param);
      if (!project) { AP.ui.toast('Project not found', 'error'); go('catalog'); return; }
      _showView('view-editor');
      _setSidebarMode('editor');
      AP.tree.render(project);
      AP.editor.showPlaceholder();
      _setBreadcrumb(project.title, '');
      _updateProjectHeader(project);
      if (AP.ui.isMobile() && AP.preview) {
        AP.preview.setMode('preview');
      }
    } else if (view === 'viewer' && param) {
      AP.state.setReadOnlyProject(param);
      _showView('view-editor');
      _setSidebarMode('editor');
      AP.tree.render(param);
      AP.editor.showPlaceholder();
      _setBreadcrumb(param.title || 'Published', '');
      _updateProjectHeader(param);
      if (AP.preview) AP.preview.setMode('preview');
    }
  }

  function _showView(id) {
    AP.ui.qsa('.view').forEach(function (v) { v.classList.remove('active'); });
    var v = document.getElementById(id);
    if (v) v.classList.add('active');
  }

  function _setSidebarMode(mode) {
    var catMode = document.getElementById('sb-catalog-mode');
    var edMode  = document.getElementById('sb-editor-mode');
    if (catMode) catMode.style.display = mode === 'catalog' ? '' : 'none';
    if (edMode)  edMode.style.display  = mode === 'editor'  ? '' : 'none';
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
    // Toolbar
    var title = AP.ui.qs('#toolbar-project-title');
    if (title) title.textContent = project.title || 'Untitled';
    var badge = AP.ui.qs('#toolbar-product-badge');
    if (badge) badge.textContent = project.product || '';

    // Sidebar project header
    var header = AP.ui.qs('#sb-project-header');
    if (header) {
      var product = AP.catalog ? AP.catalog.getProduct(project.product) : null;
      var icon = product ? product.icon : '';
      var color = product ? product.color : 'var(--accent)';
      header.innerHTML =
        '<span class="sb-project-icon" style="color:' + color + '">' + icon + '</span>' +
        '<span class="sb-project-name">' + AP.ui.escapeHtml(project.title || 'Untitled') + '</span>';
    }
  }

  AP.router = { go: go };
})();
