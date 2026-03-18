/* AP -- Catalog View */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  function render() {
    var container = AP.ui.qs('#view-catalog');
    if (!container) return;

    var products = AP.catalog.getProducts();
    var projects  = AP.state.getAllProjects();

    container.innerHTML = '';
    var wrap = AP.ui.el('div', { class: 'catalog-view' });

    // ── Hero ──
    var hero = AP.ui.el('div', { class: 'catalog-hero' });
    hero.innerHTML = [
      '<h2>eLearning Authoring Platform</h2>',
      '<p>Build PTC training courses. Start from a product skeleton, populate content, then export OB-compatible JSON for the player.</p>'
    ].join('');
    wrap.appendChild(hero);

    // ── Saved projects ──
    if (projects.length > 0) {
      var savedLbl = AP.ui.el('p', { class: 'catalog-section-title' });
      savedLbl.textContent = 'Your Projects (' + projects.length + ')';
      wrap.appendChild(savedLbl);

      var grid = AP.ui.el('div', { class: 'projects-grid stagger' });
      projects.forEach(function (proj) {
        var fullProject = AP.state.openProject(proj.id);
        // Re-open will have cleared undo. We'll open it quietly just for stats.
        var stats = fullProject ? AP.catalog.countStats(fullProject) : { modules: 0, topics: 0, filled: 0 };
        var pct = stats.topics > 0 ? Math.round((stats.filled / stats.topics) * 100) : 0;
        var product = AP.catalog.getProduct(proj.product);
        var accentColor = product ? product.color : 'var(--accent)';

        var card = AP.ui.el('div', { class: 'project-card' });
        card.innerHTML = [
          '<div class="project-card-header">',
            '<h4>' + AP.ui.escapeHtml(proj.name) + '</h4>',
            '<span class="project-card-product" style="background:' + accentColor + '22;color:' + accentColor + ';border-color:' + accentColor + '44">',
              AP.ui.escapeHtml(proj.product),
            '</span>',
          '</div>',
          '<div class="project-progress-row">',
            '<div class="project-progress-bar">',
              '<div class="project-progress-fill" style="width:' + pct + '%;background:' + accentColor + '"></div>',
            '</div>',
            '<span class="project-progress-pct">' + pct + '%</span>',
          '</div>',
          '<div class="project-card-meta">',
            '<span>' + stats.filled + '/' + stats.topics + ' topics filled</span>',
            ' · ',
            '<span>Updated ' + AP.ui.formatDate(proj.updatedAt) + '</span>',
          '</div>',
          '<div class="project-card-actions">',
            '<button class="btn btn-primary btn-sm open-btn" data-id="' + proj.id + '">Open</button>',
            '<button class="btn btn-secondary btn-sm rename-btn" data-id="' + proj.id + '" data-name="' + AP.ui.escapeHtml(proj.name) + '">Rename</button>',
            '<button class="btn btn-secondary btn-sm export-btn" data-id="' + proj.id + '">Export</button>',
            '<button class="btn btn-danger btn-sm delete-btn" data-id="' + proj.id + '">Delete</button>',
          '</div>'
        ].join('');
        grid.appendChild(card);
      });

      wrap.appendChild(grid);

      // Event delegation
      grid.addEventListener('click', function (e) {
        var openBtn   = e.target.closest('.open-btn');
        var renameBtn = e.target.closest('.rename-btn');
        var exportBtn = e.target.closest('.export-btn');
        var deleteBtn = e.target.closest('.delete-btn');

        if (openBtn) {
          AP.router.go('editor', openBtn.dataset.id);

        } else if (renameBtn) {
          var id = renameBtn.dataset.id;
          var currentName = renameBtn.dataset.name;
          AP.ui.prompt('Rename Project', 'New name', function (newName) {
            // Update registry
            var reg = JSON.parse(localStorage.getItem('ap_projects') || '{}');
            if (reg[id]) reg[id].name = newName;
            localStorage.setItem('ap_projects', JSON.stringify(reg));
            // Update project data
            var p = AP.state.openProject(id);
            if (p) {
              p.title = newName;
              if (p._authorMeta) p._authorMeta.name = newName;
              AP.state.commitChange(function (proj) { proj.title = newName; }, 'rename');
            }
            AP.ui.toast('Renamed', 'success');
            render();
          }, currentName);

        } else if (exportBtn) {
          var id = exportBtn.dataset.id;
          AP.state.openProject(id);
          AP.exportMgr.exportProject();

        } else if (deleteBtn) {
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
      });
    }

    // ── Product templates ──
    var tmplLbl = AP.ui.el('p', { class: 'catalog-section-title', style: 'margin-top:' + (projects.length ? '32px' : '0') });
    tmplLbl.textContent = 'Start from a Template';
    wrap.appendChild(tmplLbl);

    var pGrid = AP.ui.el('div', { class: 'catalog-grid stagger' });
    products.forEach(function (product) {
      var card = AP.ui.el('div', { class: 'product-card' });
      card.style.setProperty('--card-accent',        product.color);
      card.style.setProperty('--card-accent-dim',    product.colorDim);
      card.style.setProperty('--card-accent-border', product.colorBorder);

      // Count existing projects for this product
      var existing = projects.filter(function (p) { return p.product === product.id; }).length;

      card.innerHTML = [
        '<div class="product-card-icon" style="background:' + product.colorDim + ';border-color:' + product.colorBorder + '">' + product.icon + '</div>',
        '<h3>' + AP.ui.escapeHtml(product.name) + '</h3>',
        '<p style="font-size:11px;color:var(--text-dim);margin-bottom:4px">' + AP.ui.escapeHtml(product.tagline) + '</p>',
        '<p>' + AP.ui.escapeHtml(product.description) + '</p>',
        '<div class="product-card-meta">',
          '<span>📦 4 modules</span>',
          '<span>📄 16–20 topics</span>',
          existing ? '<span style="color:var(--accent)">✓ ' + existing + ' project' + (existing > 1 ? 's' : '') + '</span>' : '',
        '</div>',
        '<div class="card-action-row">',
          '<button class="btn btn-primary btn-sm new-proj-btn" data-product="' + product.id + '">New Project</button>',
        '</div>'
      ].join('');

      card.querySelector('.new-proj-btn').addEventListener('click', function () {
        AP.ui.prompt(
          'New ' + product.name + ' Project',
          'Project name (e.g. "' + product.name + ' Onboarding v2")',
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

      pGrid.appendChild(card);
    });

    wrap.appendChild(pGrid);
    container.appendChild(wrap);
  }

  AP.catalogView = { render: render };
})();
