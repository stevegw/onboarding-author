/* AP -- Catalog: product definitions & skeleton loader */
(function () {
  'use strict';
  var AP = window.AP = window.AP || {};

  var PRODUCTS = [
    {
      id: 'windchill',
      name: 'Windchill',
      tagline: 'Product Lifecycle Management',
      icon: '⚙️',
      color: '#4ea8de',
      colorDim: 'rgba(78,168,222,0.12)',
      colorBorder: 'rgba(78,168,222,0.25)',
      description: 'PLM platform for managing the entire product lifecycle — parts, documents, change management, and BOM.',
      file: 'data/windchill.json'
    },
    {
      id: 'codebeamer',
      name: 'Codebeamer',
      tagline: 'Application Lifecycle Management',
      icon: '🔗',
      color: '#69be28',
      colorDim: 'rgba(105,190,40,0.12)',
      colorBorder: 'rgba(105,190,40,0.25)',
      description: 'ALM platform connecting requirements, test management, project tracking, and compliance reporting.',
      file: 'data/codebeamer.json'
    },
    {
      id: 'creo',
      name: 'Creo Parametric',
      tagline: 'CAD & Design',
      icon: '📐',
      color: '#c084fc',
      colorDim: 'rgba(192,132,252,0.12)',
      colorBorder: 'rgba(192,132,252,0.25)',
      description: 'Parametric CAD for part modeling, assembly design, and engineering drawings.',
      file: 'data/creo.json'
    }
  ];

  var _skeletons = {}; // cached skeletons

  function getProducts() { return PRODUCTS; }

  function getProduct(id) {
    return PRODUCTS.find(function (p) { return p.id === id; }) || null;
  }

  function loadSkeleton(productId, callback) {
    if (_skeletons[productId]) {
      callback(null, JSON.parse(JSON.stringify(_skeletons[productId])));
      return;
    }
    var product = getProduct(productId);
    if (!product) { callback('Product not found'); return; }

    fetch(product.file)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        _skeletons[productId] = data;
        callback(null, JSON.parse(JSON.stringify(data)));
      })
      .catch(function (err) {
        callback(err.message || 'Failed to load skeleton');
      });
  }

  // Count modules and topics in a project
  function countStats(project) {
    var modules = (project.modules || []).length;
    var topics = (project.modules || []).reduce(function (sum, m) {
      return sum + (m.topics || []).length;
    }, 0);
    var filled = (project.modules || []).reduce(function (sum, m) {
      return sum + (m.topics || []).filter(function (t) {
        return (t.content || []).length > 0;
      }).length;
    }, 0);
    return { modules: modules, topics: topics, filled: filled };
  }

  AP.catalog = {
    getProducts: getProducts,
    getProduct: getProduct,
    loadSkeleton: loadSkeleton,
    countStats: countStats
  };
})();
