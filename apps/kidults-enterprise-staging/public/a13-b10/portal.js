(() => {
  const qs = selector => document.querySelector(selector);
  const qsa = selector => [...document.querySelectorAll(selector)];

  const state = {
    category: 'all',
    horizon: '6M',
    product: null
  };

  const categoryCopy = {
    all: { title: 'Kidult 100', interpretation: 'Liquidity expansion is broadening across culturally durable categories.' },
    character: { title: 'Character Goods', interpretation: 'Licensed character ecosystems are converting cultural memory into repeat transaction depth.' },
    cards: { title: 'Trading Cards', interpretation: 'Premium-end liquidity is strengthening while mid-market concentration remains the primary risk.' },
    art: { title: 'Art Toys', interpretation: 'Cross-border demand and recurring releases support durable but narrower momentum.' }
  };

  const evidence = {
    character: {
      title: 'Character Goods liquidity expansion',
      metrics: [['Verified transactions','6,198'],['Observed listings','18,420'],['Median spread','−7.4%'],['Confidence','91% / A']],
      notes: ['Transaction depth expanded across Japan, Korea, Singapore and the United States.','Repeat-buyer participation increased for the third consecutive cycle.','No single brand explains more than 18% of the aggregate move.','Primary risk: licensing-driven supply acceleration during Q4.']
    },
    cards: {
      title: 'Trading Cards concentration risk',
      metrics: [['Top-decile share','42.6%'],['Velocity','+2.1'],['Confidence','84% / B+'],['Watch condition','Spread > 11%']],
      notes: ['Liquidity is improving at the premium end but remains uneven below the top decile.','Three franchise clusters account for most verified value expansion.','Evidence quality is high, but breadth is weaker than the headline move.','Primary action: monitor dispersion before increasing conviction.']
    },
    art: {
      title: 'Art Toy cross-border acceleration',
      metrics: [['Markets expanding','5'],['Velocity','+1.9'],['Confidence','82% / B+'],['Evidence','5,914']],
      notes: ['Demand growth is most visible in Singapore, Seoul and Los Angeles.','Recurring editions are outperforming one-off scarcity events.','Cultural durability is improving faster than short-term price momentum.','Primary risk: narrow creator concentration.']
    }
  };

  const setActive = (buttons, active) => {
    buttons.forEach(button => button.classList.toggle('active', button === active));
  };

  const formatVelocity = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

  const getCategoryRecord = key => {
    if (!state.product || key === 'all') return null;
    const names = {
      character: 'Character Goods',
      cards: 'Trading Cards',
      art: 'Art Toys'
    };
    return state.product.categoryMatrix.find(item => item.category === names[key]) || null;
  };

  const horizonCount = horizon => ({ '1M': 3, '3M': 5, '6M': 8, '1Y': 12 }[horizon] || 12);

  const buildChartPoints = series => {
    const left = 70;
    const right = 930;
    const top = 35;
    const bottom = 270;
    const min = Math.min(...series) - 2;
    const max = Math.max(...series) + 2;
    const range = Math.max(max - min, 1);

    return series.map((value, index) => {
      const x = left + ((right - left) * index) / Math.max(series.length - 1, 1);
      const y = bottom - ((value - min) / range) * (bottom - top);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  };

  const buildConfidenceBand = series => {
    const points = buildChartPoints(series).split(' ').map(point => point.split(',').map(Number));
    const upper = points.map(([x, y]) => `${x.toFixed(1)},${Math.max(25, y - 16).toFixed(1)}`);
    const lower = [...points].reverse().map(([x, y]) => `${x.toFixed(1)},${Math.min(280, y + 16).toFixed(1)}`);
    return `M${upper.join(' L')} L${lower.join(' L')} Z`;
  };

  const renderChart = () => {
    if (!state.product) return;
    const source = state.product.timeSeries.series[state.category];
    if (!Array.isArray(source)) return;

    const count = horizonCount(state.horizon);
    const series = source.slice(-count);
    const latest = series.at(-1);
    const previous = series.at(-2) ?? latest;
    const delta = latest - previous;
    const category = getCategoryRecord(state.category);
    const copy = categoryCopy[state.category];

    qs('[data-series-line]')?.setAttribute('points', buildChartPoints(series));
    qs('[data-confidence-band]')?.setAttribute('d', buildConfidenceBand(series));
    if (qs('[data-index-title]')) qs('[data-index-title]').textContent = copy.title;
    if (qs('[data-index-value]')) qs('[data-index-value]').textContent = latest.toFixed(1);
    if (qs('[data-index-delta]')) qs('[data-index-delta]').textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
    if (qs('[data-interpretation]')) qs('[data-interpretation]').textContent = copy.interpretation;
    if (qs('[data-horizon-label]')) qs('[data-horizon-label]').textContent = state.horizon;

    const metricValues = category
      ? [category.regime, formatVelocity(category.velocity), category.liquidity.toFixed(1), category.canonStrength.toFixed(1), `${category.confidence}%`]
      : ['Expansion', '+3.7', '88.2', '84.6', '94%'];

    qsa('.metric-row strong').forEach((node, index) => {
      if (metricValues[index] !== undefined) node.textContent = metricValues[index];
    });
  };

  const renderCategoryMatrix = product => {
    const target = qs('[data-category-matrix]');
    if (!target) return;

    target.innerHTML = product.categoryMatrix.map(item => `
      <tr>
        <td class="matrix-category"><strong>${item.category}</strong><small>${item.regime}</small></td>
        <td class="matrix-score">${item.index.toFixed(1)}</td>
        <td>${formatVelocity(item.velocity)}</td>
        <td>${item.liquidity}</td>
        <td>${item.canonStrength}</td>
        <td>${item.culturalDurability}</td>
        <td>${item.scarcityIntegrity}</td>
        <td><span class="regime-chip">${item.confidence}% / ${item.regime}</span></td>
      </tr>
    `).join('');
  };

  const renderCanon = product => {
    const target = qs('[data-canon-grid]');
    if (!target) return;

    const scores = product.canon.dimensions.map(item => item.score);
    const composite = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);

    if (qs('[data-canon-headline]')) qs('[data-canon-headline]').textContent = product.canon.headline;
    if (qs('[data-canon-composite]')) qs('[data-canon-composite]').textContent = composite;

    target.innerHTML = product.canon.dimensions.map(item => `
      <article class="canon-card">
        <div class="canon-card-head"><h3>${item.label}</h3><strong>${item.score}</strong></div>
        <div class="canon-bar" aria-label="${item.label} score ${item.score} out of 100"><span style="width:${item.score}%"></span></div>
        <p>${item.definition}</p>
      </article>
    `).join('');
  };

  const renderMethod = product => {
    const method = product.method;
    const setters = [
      ['[data-method-brands]', `${method.brandsCovered}+`],
      ['[data-method-sources]', method.sourceFamilies],
      ['[data-method-categories]', method.categoriesCovered],
      ['[data-method-cadence]', method.refreshCadence],
      ['[data-method-confidence]', method.confidenceModel],
      ['[data-method-version]', product.meta.methodVersion]
    ];

    setters.forEach(([selector, value]) => {
      const node = qs(selector);
      if (node) node.textContent = value;
    });

    const principles = qs('[data-method-principles]');
    if (principles) principles.innerHTML = method.principles.map(item => `<li>${item}</li>`).join('');
  };

  const renderProduct = product => {
    state.product = product;
    renderCategoryMatrix(product);
    renderCanon(product);
    renderMethod(product);
    renderChart();

    const status = qs('[data-product-status]');
    if (status) {
      status.textContent = `${product.meta.release} · ${product.meta.methodVersion} · ${product.meta.dataMode} data`;
    }
  };

  const loadProduct = async () => {
    try {
      const response = await fetch('/a13-b10/data/intelligence-product.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Product data request failed: ${response.status}`);
      const product = await response.json();
      renderProduct(product);
    } catch (error) {
      console.error(error);
      const status = qs('[data-product-status]');
      if (status) status.textContent = 'Illustrative fallback · product data unavailable';
    }
  };

  qsa('[data-category]').forEach(button => button.addEventListener('click', () => {
    setActive(qsa('[data-category]'), button);
    state.category = button.dataset.category;
    renderChart();
  }));

  qsa('[data-horizon]').forEach(button => button.addEventListener('click', () => {
    setActive(qsa('[data-horizon]'), button);
    state.horizon = button.dataset.horizon;
    renderChart();
  }));

  qsa('[data-signal]').forEach(button => button.addEventListener('click', () => {
    setActive(qsa('[data-signal]'), button);
    const data = evidence[button.dataset.signal];
    if (!data) return;
    qs('[data-evidence-title]').textContent = data.title;
    qs('[data-evidence-body]').innerHTML = `<div class="evidence-grid">${data.metrics.map(([label,value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><div class="evidence-notes">${data.notes.map(note => `<p>${note}</p>`).join('')}</div>`;
  }));

  const syncDesktopPanelWidths = () => {
    const reference = qs('.benchmark-grid');
    const targets = [qs('#signals'), qs('#research')].filter(Boolean);
    if (!reference || !targets.length) return;

    if (window.innerWidth >= 1201) {
      const referenceWidth = Math.round(reference.getBoundingClientRect().width);
      targets.forEach(target => {
        target.style.setProperty('width', `${referenceWidth}px`, 'important');
        target.style.setProperty('max-width', `${referenceWidth}px`, 'important');
        target.style.setProperty('margin-left', 'auto', 'important');
        target.style.setProperty('margin-right', 'auto', 'important');
      });
      return;
    }

    targets.forEach(target => {
      target.style.removeProperty('width');
      target.style.removeProperty('max-width');
      target.style.removeProperty('margin-left');
      target.style.removeProperty('margin-right');
    });
  };

  const navLinks = qsa('.main-nav a');
  const sections = navLinks.map(link => ({ link, section: qs(link.getAttribute('href')) })).filter(item => item.section);

  const setActiveNav = id => {
    navLinks.forEach(link => {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };

  navLinks.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const target = qs(link.getAttribute('href'));
    if (!target) return;
    setActiveNav(target.id);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  let ticking = false;
  const syncNavigation = () => {
    const marker = window.scrollY + 110;
    let activeId = sections[0]?.section.id;
    for (const { section } of sections) {
      if (section.offsetTop <= marker) activeId = section.id;
      else break;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8 && sections.length) {
      activeId = sections.at(-1).section.id;
    }
    if (activeId) setActiveNav(activeId);
    ticking = false;
  };

  const requestNavigationSync = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(syncNavigation);
  };

  syncDesktopPanelWidths();
  loadProduct();
  window.addEventListener('scroll', requestNavigationSync, { passive: true });
  window.addEventListener('resize', () => {
    syncDesktopPanelWidths();
    requestNavigationSync();
  });
  window.addEventListener('load', () => {
    syncDesktopPanelWidths();
    requestNavigationSync();
  });
  requestNavigationSync();
})();