/* AP -- Catalog View */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  function render() {
    var container = AP.ui.qs('#view-catalog');
    if (!container) return;

    var products = AP.catalog.getProducts();
    var projects = AP.state.getAllProjects();
    var mobile = AP.ui.isMobile();

    // Render sidebar families
    _renderSidebarFamilies(products, projects);

    // Fetch published index, then render everything
    AP.publish.fetchIndex(function (err, publishedIndex) {
      var publishedProjects = (publishedIndex && publishedIndex.projects) || [];
      _renderCatalog(container, products, projects, publishedProjects, mobile);
    });
  }

  // ── Sidebar: product families with grouped projects ──
  function _renderSidebarFamilies(products, projects) {
    var container = AP.ui.qs('#sb-families');
    if (!container) return;
    container.innerHTML = '';

    products.forEach(function (product) {
      var familyProjects = projects.filter(function (p) { return p.product === product.id; });

      var group = AP.ui.el('div', { class: 'sb-family-group' });

      // Family header — always visible, click to expand
      var header = AP.ui.el('div', { class: 'sb-family-header' + (familyProjects.length ? ' has-projects' : '') });
      header.innerHTML =
        '<span class="sb-family-arrow">▶</span>' +
        '<span class="sb-family-icon" style="color:' + product.color + '">' + product.icon + '</span>' +
        '<span class="sb-family-name">' + AP.ui.escapeHtml(product.name) + '</span>' +
        (familyProjects.length ? '<span class="sb-family-count">' + familyProjects.length + '</span>' : '');

      var list = AP.ui.el('div', { class: 'sb-family-list' });

      header.addEventListener('click', function () {
        var open = group.classList.toggle('open');
        header.querySelector('.sb-family-arrow').textContent = open ? '▼' : '▶';
      });

      // Auto-expand families that have projects
      if (familyProjects.length) {
        group.classList.add('open');
        header.querySelector('.sb-family-arrow').textContent = '▼';
      }

      // Project items under this family
      familyProjects.forEach(function (proj) {
        var item = AP.ui.el('div', { class: 'sb-nav-item sb-project-item', 'data-id': proj.id });
        item.innerHTML =
          '<span class="nav-icon">📄</span>' +
          '<span class="nav-label">' + AP.ui.escapeHtml(proj.name) + '</span>';
        item.addEventListener('click', function () {
          AP.router.go('editor', proj.id);
        });
        list.appendChild(item);
      });

      // "New project" button for this family
      var newBtn = AP.ui.el('div', { class: 'sb-nav-item sb-new-project', 'data-product': product.id });
      newBtn.innerHTML =
        '<span class="nav-icon" style="color:' + product.color + '">+</span>' +
        '<span class="nav-label" style="color:var(--text-dim)">New ' + AP.ui.escapeHtml(product.name) + '</span>';
      newBtn.addEventListener('click', function () {
        AP.ui.prompt(
          'New ' + product.name + ' Project',
          'Project name',
          function (name) {
            AP.catalog.loadSkeleton(product.id, function (err, skeleton) {
              if (err) { AP.ui.toast('Failed to load template: ' + err, 'error'); return; }
              var project = AP.state.createProject(name, product.id, skeleton);
              AP.ui.toast('Project created!', 'success');
              AP.router.go('editor', project.id);
            });
          },
          product.name + ' Fundamentals'
        );
      });
      list.appendChild(newBtn);

      group.appendChild(header);
      group.appendChild(list);
      container.appendChild(group);
    });
  }

  function _renderCatalog(container, products, projects, publishedProjects, mobile) {
    container.innerHTML = '';
    var wrap = AP.ui.el('div', { class: 'catalog-view' });

    // ── Hero ──
    var hero = AP.ui.el('div', { class: 'catalog-hero' });
    if (mobile) {
      hero.innerHTML = '<h2>Browse Training Content</h2>' +
        '<p>Open a published project to preview its content.</p>';
    } else {
      hero.innerHTML = '<h2>eLearning Authoring Platform</h2>' +
        '<p>Build PTC training courses. Start from a product skeleton, populate content, then export OB-compatible JSON for the player.</p>';
    }
    wrap.appendChild(hero);

    // ── Product families — each family gets a section with its projects ──
    products.forEach(function (product) {
      var familyDrafts = projects.filter(function (p) { return p.product === product.id; });
      var familyPublished = publishedProjects.filter(function (p) { return p.product === product.id; });
      var totalCount = familyDrafts.length + familyPublished.length;

      var family = AP.ui.el('div', { class: 'catalog-family' });

      // Family header (icon + name + count + new button)
      var header = AP.ui.el('div', { class: 'catalog-family-header' });
      header.innerHTML =
        '<span class="catalog-family-icon" style="color:' + product.color + '">' + product.icon + '</span>' +
        '<h2>' + AP.ui.escapeHtml(product.name) + '</h2>' +
        '<span class="catalog-family-tagline">' + AP.ui.escapeHtml(product.tagline) + '</span>' +
        '<span class="catalog-family-count">' + totalCount + ' project' + (totalCount !== 1 ? 's' : '') + '</span>';

      // New project button in header
      var newBtn = AP.ui.el('button', { class: 'btn btn-primary btn-sm catalog-family-new', 'data-product': product.id });
      newBtn.textContent = '+ New Project';
      newBtn.addEventListener('click', function () {
        AP.ui.prompt(
          'New ' + product.name + ' Project',
          'Project name',
          function (name) {
            AP.catalog.loadSkeleton(product.id, function (err, skeleton) {
              if (err) { AP.ui.toast('Failed to load template: ' + err, 'error'); return; }
              var proj = AP.state.createProject(name, product.id, skeleton);
              AP.ui.toast('Project created!', 'success');
              AP.router.go('editor', proj.id);
            });
          },
          product.name + ' Fundamentals'
        );
      });
      header.appendChild(newBtn);
      family.appendChild(header);

      // Grid of project cards under this family
      var grid = AP.ui.el('div', { class: 'catalog-grid stagger' });

      // Published projects for this family
      familyPublished.forEach(function (pub) {
        grid.appendChild(_buildPublishedCard(pub, product));
      });

      // Draft projects for this family (desktop only)
      if (!mobile) {
        familyDrafts.forEach(function (proj) {
          grid.appendChild(_buildDraftCard(proj, product, projects));
        });
      }

      if (grid.children.length === 0) {
        var empty = AP.ui.el('p', { class: 'catalog-family-empty' });
        empty.textContent = 'No projects yet. Click "+ New Project" to start.';
        family.appendChild(empty);
      } else {
        family.appendChild(grid);
      }

      wrap.appendChild(family);
    });

    // ── Event delegation for all grids ──
    wrap.addEventListener('click', function (e) {
      _handleCardClick(e, projects);
    });

    container.appendChild(wrap);
  }

  function _buildPublishedCard(pub, product) {
    var accentColor = product ? product.color : 'var(--accent)';
    var stats = pub.stats || { modules: 0, topics: 0, filled: 0 };
    var pct = stats.topics > 0 ? Math.round((stats.filled / stats.topics) * 100) : 0;

    var card = AP.ui.el('div', { class: 'project-card' });
    card.innerHTML = [
      '<div class="project-card-header">',
        '<h4>' + AP.ui.escapeHtml(pub.name) + '</h4>',
        '<span class="badge-published">Published</span>',
      '</div>',
      '<div class="project-progress-row">',
        '<div class="project-progress-bar">',
          '<div class="project-progress-fill" style="width:' + pct + '%;background:' + accentColor + '"></div>',
        '</div>',
        '<span class="project-progress-pct">' + pct + '%</span>',
      '</div>',
      '<div class="project-card-meta">',
        '<span>' + stats.filled + '/' + stats.topics + ' topics filled</span>',
        ' · <span>Published ' + AP.ui.formatDate(pub.publishedAt) + '</span>',
      '</div>',
      '<div class="project-card-actions">',
        '<button class="btn btn-primary btn-sm pub-open-btn" data-file="' + AP.ui.escapeHtml(pub.file) + '">Open</button>',
      '</div>'
    ].join('');
    return card;
  }

  function _buildDraftCard(proj, product, projects) {
    var fullProject = AP.state.openProject(proj.id);
    var stats = fullProject ? AP.catalog.countStats(fullProject) : { modules: 0, topics: 0, filled: 0 };
    var pct = stats.topics > 0 ? Math.round((stats.filled / stats.topics) * 100) : 0;
    var accentColor = product ? product.color : 'var(--accent)';

    var card = AP.ui.el('div', { class: 'project-card' });
    card.innerHTML = [
      '<div class="project-card-header">',
        '<h4>' + AP.ui.escapeHtml(proj.name) + '</h4>',
        '<span class="badge-draft">Draft</span>',
      '</div>',
      '<div class="project-progress-row">',
        '<div class="project-progress-bar">',
          '<div class="project-progress-fill" style="width:' + pct + '%;background:' + accentColor + '"></div>',
        '</div>',
        '<span class="project-progress-pct">' + pct + '%</span>',
      '</div>',
      '<div class="project-card-meta">',
        '<span>' + stats.filled + '/' + stats.topics + ' topics filled</span>',
        ' · <span>Updated ' + AP.ui.formatDate(proj.updatedAt) + '</span>',
      '</div>',
      '<div class="project-card-actions">',
        '<button class="btn btn-primary btn-sm open-btn" data-id="' + proj.id + '">Open</button>',
        '<button class="btn btn-secondary btn-sm rename-btn" data-id="' + proj.id + '" data-name="' + AP.ui.escapeHtml(proj.name) + '">Rename</button>',
        '<button class="btn btn-secondary btn-sm export-btn" data-id="' + proj.id + '">Export</button>',
        '<button class="btn btn-secondary btn-sm pwa-btn" data-id="' + proj.id + '">PWA</button>',
        '<button class="btn btn-danger btn-sm delete-btn" data-id="' + proj.id + '">Delete</button>',
      '</div>'
    ].join('');
    return card;
  }

  function _handleCardClick(e, projects) {
    var pubOpen = e.target.closest('.pub-open-btn');
    if (pubOpen) {
      var filePath = pubOpen.dataset.file;
      pubOpen.disabled = true;
      pubOpen.textContent = 'Loading\u2026';
      AP.publish.fetchProject(filePath, function (err, data) {
        pubOpen.disabled = false;
        pubOpen.textContent = 'Open';
        if (err) { AP.ui.toast('Failed to load project', 'error'); return; }
        AP.router.go('viewer', data);
      });
      return;
    }

    var openBtn = e.target.closest('.open-btn');
    if (openBtn) { AP.router.go('editor', openBtn.dataset.id); return; }

    var renameBtn = e.target.closest('.rename-btn');
    if (renameBtn) {
      var id = renameBtn.dataset.id;
      var currentName = renameBtn.dataset.name;
      AP.ui.prompt('Rename Project', 'New name', function (newName) {
        var reg = JSON.parse(localStorage.getItem('ap_projects') || '{}');
        if (reg[id]) reg[id].name = newName;
        localStorage.setItem('ap_projects', JSON.stringify(reg));
        var p = AP.state.openProject(id);
        if (p) {
          p.title = newName;
          if (p._authorMeta) p._authorMeta.name = newName;
          AP.state.commitChange(function (proj) { proj.title = newName; }, 'rename');
        }
        AP.ui.toast('Renamed', 'success');
        render();
      }, currentName);
      return;
    }

    var exportBtn = e.target.closest('.export-btn');
    if (exportBtn) {
      AP.state.openProject(exportBtn.dataset.id);
      AP.exportMgr.exportProject();
      return;
    }

    var pwaBtn = e.target.closest('.pwa-btn');
    if (pwaBtn) {
      var proj = AP.state.openProject(pwaBtn.dataset.id);
      if (proj) AP.pwaExport.exportPWA(proj);
      return;
    }

    var deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      var id = deleteBtn.dataset.id;
      var p = projects.find(function (x) { return x.id === id; });
      AP.ui.confirm(
        'Delete "' + (p ? p.name : id) + '"?',
        'This cannot be undone. All content will be permanently removed.',
        function () {
          AP.state.deleteProject(id);
          AP.ui.toast('Project deleted', 'info');
          render();
        },
        true
      );
    }
  }

  AP.catalogView = { render: render };
})();
