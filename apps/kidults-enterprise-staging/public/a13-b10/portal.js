(() => {
  const qs = selector => document.querySelector(selector);
  const qsa = selector => [...document.querySelectorAll(selector)];

  const state = {
    category: 'all',
    horizon: '6M',
    product: null,
    adapter: null,
    effectiveMode: 'fallback'
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

  const setText = (selector, value) => {
    const node = qs(selector);
    if (node) node.textContent = String(value);
  };

  const setActive = (buttons, active) => {
    buttons.forEach(button => button.classList.toggle('active', button === active));
  };

  const formatVelocity = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

  const formatTimestamp = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unavailable';
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  };

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
    setText('[data-index-title]', copy.title);
    setText('[data-index-value]', latest.toFixed(1));
    setText('[data-index-delta]', `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`);
    setText('[data-interpretation]', copy.interpretation);
    setText('[data-horizon-label]', state.horizon);

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

    setText('[data-canon-headline]', product.canon.headline);
    setText('[data-canon-composite]', composite);

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

    setters.forEach(([selector, value]) => setText(selector, value));

    const principles = qs('[data-method-principles]');
    if (principles) principles.innerHTML = method.principles.map(item => `<li>${item}</li>`).join('');
  };

  const renderProduct = product => {
    state.product = product;
    renderCategoryMatrix(product);
    renderCanon(product);
    renderMethod(product);
    renderChart();

    setText('[data-product-status]', `${product.meta.release} · ${product.meta.methodVersion} · ${state.effectiveMode} data`);
  };

  const validateProduct = product => {
    if (!product || typeof product !== 'object') throw new Error('Product payload is not an object');
    if (!product.meta || !Array.isArray(product.categoryMatrix)) throw new Error('Product payload metadata is incomplete');
    if (!product.canon || !Array.isArray(product.canon.dimensions)) throw new Error('Product canon schema is incomplete');
    if (!product.method || !product.timeSeries?.series) throw new Error('Product method or time-series schema is incomplete');
    for (const key of ['all', 'character', 'cards', 'art']) {
      if (!Array.isArray(product.timeSeries.series[key])) throw new Error(`Missing time-series: ${key}`);
    }
    return product;
  };

  const validateAdapter = adapter => {
    if (!adapter || adapter.release !== 'A13-B12') throw new Error('Adapter release is invalid');
    if (!['live', 'stale', 'fallback'].includes(adapter.mode)) throw new Error('Adapter mode is invalid');
    if (!adapter.fallback) throw new Error('Adapter fallback is required');
    if (!adapter.freshness?.generatedAt || typeof adapter.freshness.maxAgeMinutes !== 'number') {
      throw new Error('Adapter freshness metadata is incomplete');
    }
    if (adapter.mode === 'live' && !adapter.endpoint) throw new Error('Live mode requires an endpoint');
    if (adapter.mode === 'live' && adapter.safety?.allowLiveWithoutProvenance === false) {
      const provenance = adapter.provenance;
      if (!provenance?.sourceFamilies || !provenance?.brandsCovered || !provenance?.confidenceModel) {
        throw new Error('Live mode provenance is incomplete');
      }
    }
    return adapter;
  };

  const fetchJson = async url => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${url}`);
    return response.json();
  };

  const getFreshnessState = adapter => {
    if (adapter.mode === 'fallback' || adapter.freshness.status === 'illustrative') return 'Illustrative';
    const generated = new Date(adapter.freshness.generatedAt).getTime();
    if (!Number.isFinite(generated)) return 'Unknown';
    const ageMinutes = Math.max(0, (Date.now() - generated) / 60000);
    return ageMinutes <= adapter.freshness.maxAgeMinutes ? 'Fresh' : 'Stale';
  };

  const renderAdapterStatus = ({ adapter, effectiveMode, source, fallbackUsed, reason }) => {
    const provenance = adapter?.provenance || {};
    const freshness = adapter ? getFreshnessState(adapter) : 'Unavailable';
    const provenanceState = provenance.sourceFamilies && provenance.brandsCovered ? 'Verified' : 'Incomplete';

    setText('[data-adapter-status]', reason || `${adapter.release} adapter · ${effectiveMode} mode`);
    setText('[data-adapter-mode]', effectiveMode.charAt(0).toUpperCase() + effectiveMode.slice(1));
    setText('[data-adapter-freshness]', freshness);
    setText('[data-adapter-confidence]', provenanceState);
    setText('[data-adapter-generated]', adapter ? formatTimestamp(adapter.freshness.generatedAt) : 'Unavailable');
    const sourceLabel = effectiveMode === 'fallback'
      ? 'Illustrative intelligence dataset'
      : source || 'Unavailable';
    setText('[data-adapter-source]', sourceLabel);
    setText('[data-adapter-fallback]', effectiveMode === 'fallback' || fallbackUsed ? 'Active' : 'Standby');
    setText('[data-adapter-brands]', provenance.brandsCovered ? `${provenance.brandsCovered}+` : '—');
    setText('[data-adapter-sources]', provenance.sourceFamilies || '—');
    setText('[data-adapter-categories]', provenance.categoriesCovered || '—');
    setText('[data-adapter-model]', provenance.confidenceModel || 'Unavailable');

    document.body.dataset.dataMode = effectiveMode;
    document.body.dataset.freshness = freshness.toLowerCase();
  };



  const renderProviderCommandCenter = report => {
    const gates = Object.entries(report.gates || {});
    const providers = Array.isArray(report.providers) ? report.providers : [];
    const passed = gates.filter(([, value]) => value === 'passed').length;
    const blocked = gates.length - passed;
    const ready = providers.filter(provider => provider.status === 'ready').length;

    setText('[data-provider-state]', String(report.status || 'blocked').replaceAll('-', ' '));
    setText('[data-provider-ready]', `${ready}/${providers.length}`);
    setText('[data-provider-passed]', passed);
    setText('[data-provider-blocked]', blocked);

    const badge = qs('[data-provider-badge]');
    if (badge) {
      const authorized = report.productionPromotionAuthorized === true;
      badge.textContent = authorized ? 'Authorized' : 'Production blocked';
      badge.dataset.health = authorized ? 'healthy' : 'failed';
    }

    const gateTarget = qs('[data-provider-gates]');
    if (gateTarget) gateTarget.innerHTML = gates.map(([key, value]) => `
      <div class="provider-gate"><span>${key.replace(/([A-Z])/g, ' $1')}</span><strong data-state="${value}">${value}</strong></div>
    `).join('');

    const providerTarget = qs('[data-provider-list]');
    if (providerTarget) providerTarget.innerHTML = providers.map(provider => `
      <article class="source-health-item">
        <div class="source-health-head"><strong>${provider.role}</strong><small>Secure provider injection</small></div>
        <span class="source-health-status" data-health="${provider.status === 'ready' ? 'healthy' : 'failed'}">${provider.status}</span>
        <div class="source-health-meta">
          <span>Endpoint: ${provider.endpointConfigured ? 'configured' : 'blocked'}</span>
          <span>Health: ${provider.healthEndpointConfigured ? 'configured' : 'blocked'}</span>
          <span>Credential: ${provider.credentialPresent ? 'present' : 'blocked'}</span>
          <span>Rights: ${provider.rightsApproved ? 'approved' : 'blocked'}</span>
        </div>
      </article>
    `).join('');

    const blockerTarget = qs('[data-provider-blockers]');
    if (blockerTarget) blockerTarget.innerHTML = (report.blockers || []).map(item => `<p>${item}</p>`).join('');

    document.body.dataset.providerInjection = report.status || 'blocked';
  };

  const loadProviderCommandCenter = async () => {
    try {
      const report = await fetchJson('/a13-b10/data/generated/provider-injection.json');
      renderProviderCommandCenter(report);
    } catch (error) {
      console.error(error);
      renderProviderCommandCenter({
        status: 'blocked',
        productionPromotionAuthorized: false,
        providers: [],
        gates: { report: 'blocked', productionAuthorization: 'blocked' },
        blockers: ['Provider injection report is unavailable.']
      });
    }
  };

  const loadProductThroughAdapter = async () => {
    let adapter;
    try {
      adapter = validateAdapter(await fetchJson('/a13-b10/data/data-adapter.json'));
      state.adapter = adapter;
    } catch (error) {
      console.error(error);
      adapter = {
        release: 'A13-B12',
        mode: 'fallback',
        fallback: '/a13-b10/data/intelligence-product.json',
        freshness: { generatedAt: new Date(0).toISOString(), maxAgeMinutes: 0, status: 'illustrative' },
        provenance: {},
        safety: { fallbackOnFetchError: true, fallbackOnSchemaError: true }
      };
    }

    const preferredSource = adapter.mode === 'live' || adapter.mode === 'stale'
      ? adapter.endpoint
      : adapter.fallback;

    try {
      const product = validateProduct(await fetchJson(preferredSource));
      state.effectiveMode = adapter.mode;
      renderAdapterStatus({
        adapter,
        effectiveMode: adapter.mode,
        source: preferredSource,
        fallbackUsed: false,
        reason: `${adapter.release} adapter · ${getFreshnessState(adapter)} · ${adapter.mode}`
      });
      renderProduct(product);
      return;
    } catch (primaryError) {
      console.error(primaryError);
      const allowFallback = adapter.safety?.fallbackOnFetchError !== false && adapter.safety?.fallbackOnSchemaError !== false;
      if (!allowFallback || preferredSource === adapter.fallback) {
        renderAdapterStatus({
          adapter,
          effectiveMode: 'fallback',
          source: adapter.fallback,
          fallbackUsed: true,
          reason: 'Fallback unavailable · data delivery failed'
        });
        setText('[data-product-status]', 'Illustrative fallback · product data unavailable');
        return;
      }
    }

    try {
      const fallbackProduct = validateProduct(await fetchJson(adapter.fallback));
      state.effectiveMode = 'fallback';
      renderAdapterStatus({
        adapter,
        effectiveMode: 'fallback',
        source: adapter.fallback,
        fallbackUsed: true,
        reason: `${adapter.release} adapter · fallback activated`
      });
      renderProduct(fallbackProduct);
    } catch (fallbackError) {
      console.error(fallbackError);
      renderAdapterStatus({
        adapter,
        effectiveMode: 'fallback',
        source: adapter.fallback,
        fallbackUsed: true,
        reason: 'Fallback unavailable · data delivery failed'
      });
      setText('[data-product-status]', 'Illustrative fallback · product data unavailable');
    }
  };



  const validateSourceRegistry = registry => {
    if (!registry || registry.release !== 'A13-B13') throw new Error('Source registry release is invalid');
    if (!Array.isArray(registry.sources)) throw new Error('Source registry sources are missing');
    if (!registry.defaults?.retry || !registry.defaults?.circuitBreaker) throw new Error('Source resilience defaults are incomplete');
    return registry;
  };

  const sourceRuntime = new Map();

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  const fetchWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Source request failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const getCircuitState = (source, policy) => {
    const runtime = sourceRuntime.get(source.id) || { failures: 0, openedAt: 0 };
    if (runtime.failures < policy.failureThreshold) return 'closed';
    if (Date.now() - runtime.openedAt >= policy.openMs) return 'half-open';
    return 'open';
  };

  const recordSourceSuccess = source => {
    sourceRuntime.set(source.id, { failures: 0, openedAt: 0 });
  };

  const recordSourceFailure = (source, policy) => {
    const runtime = sourceRuntime.get(source.id) || { failures: 0, openedAt: 0 };
    const failures = runtime.failures + 1;
    sourceRuntime.set(source.id, {
      failures,
      openedAt: failures >= policy.failureThreshold ? Date.now() : runtime.openedAt
    });
  };

  const probeSource = async (source, registry) => {
    const retry = registry.defaults.retry;
    const circuit = registry.defaults.circuitBreaker;
    const state = getCircuitState(source, circuit);
    if (!source.enabled) return { source, health: 'disabled', circuit: 'closed', attempts: 0 };
    if (state === 'open') return { source, health: 'open', circuit: 'open', attempts: 0 };

    const healthUrl = source.healthEndpoint || source.endpoint;
    let lastError = null;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      try {
        await fetchWithTimeout(healthUrl, registry.defaults.timeoutMs);
        recordSourceSuccess(source);
        return { source, health: source.trust === 'illustrative' ? 'healthy' : 'healthy', circuit: 'closed', attempts: attempt };
      } catch (error) {
        lastError = error;
        const retryable = !error.status || retry.retryOn.includes(error.status);
        if (!retryable || attempt >= retry.maxAttempts) break;
        await wait(retry.backoffMs * attempt);
      }
    }

    recordSourceFailure(source, circuit);
    return {
      source,
      health: getCircuitState(source, circuit) === 'open' ? 'open' : 'failed',
      circuit: getCircuitState(source, circuit),
      attempts: retry.maxAttempts,
      error: lastError?.message || 'Unknown source failure'
    };
  };

  const renderSourceRegistry = (registry, results) => {
    const enabled = registry.sources.filter(source => source.enabled);
    const healthy = results.filter(result => result.health === 'healthy');
    const failed = results.filter(result => ['failed', 'open'].includes(result.health));
    const minimum = registry.aggregatePolicy.minimumHealthySources;
    const aggregate = healthy.length >= minimum
      ? (failed.length ? 'Degraded' : 'Healthy')
      : 'Fallback';

    setText('[data-registry-state]', aggregate);
    setText('[data-registry-healthy]', `${healthy.length}/${enabled.length}`);
    setText('[data-registry-enabled]', enabled.length);
    setText('[data-registry-retry]', `${registry.defaults.retry.maxAttempts} attempts · ${registry.defaults.retry.backoffMs}ms backoff`);
    setText('[data-registry-circuit]', `${registry.defaults.circuitBreaker.failureThreshold} failures · ${Math.round(registry.defaults.circuitBreaker.openMs / 1000)}s open`);
    setText('[data-registry-policy]', registry.aggregatePolicy.allowPartialFailure
      ? 'Partial failure allowed · total failure falls back'
      : 'All sources required');

    const target = qs('[data-source-health-list]');
    if (target) {
      target.innerHTML = results.map(result => {
        const source = result.source;
        const trust = source.trust || 'unclassified';
        const freshness = source.freshness?.status || (trust === 'illustrative' ? 'Illustrative' : 'Unknown');
        return `
          <article class="source-health-item">
            <div class="source-health-head"><strong>${source.label}</strong><small>${source.id}</small></div>
            <span class="source-health-status" data-health="${result.health}">${result.health}</span>
            <div class="source-health-meta"><span>Trust: ${trust}</span><span>Freshness: ${freshness}</span><span>Circuit: ${result.circuit}</span><span>Attempts: ${result.attempts}</span></div>
          </article>
        `;
      }).join('') || '<p class="source-health-empty">No enabled sources.</p>';
    }

    document.body.dataset.registryHealth = aggregate.toLowerCase();
  };

  const loadSourceRegistry = async () => {
    try {
      const registry = validateSourceRegistry(await fetchJson('/a13-b10/data/source-registry.json'));
      const ordered = [...registry.sources].sort((a, b) => b.priority - a.priority);
      const results = await Promise.all(ordered.map(source => probeSource(source, registry)));
      renderSourceRegistry(registry, results);
      return { registry, results };
    } catch (error) {
      console.error(error);
      setText('[data-registry-state]', 'Fallback');
      setText('[data-registry-healthy]', '0/0');
      setText('[data-registry-enabled]', '0');
      const target = qs('[data-source-health-list]');
      if (target) target.innerHTML = '<p class="source-health-empty">Source registry unavailable. B12 fallback remains active.</p>';
      document.body.dataset.registryHealth = 'fallback';
      return null;
    }
  };



  const renderIntegratedActivation = ({ index, monthly, readiness }) => {
    const leader = Array.isArray(index?.categories) ? index.categories[0] : null;
    setText('[data-activation-score]', leader ? leader.score.toFixed(1) : '—');
    setText('[data-activation-category]', leader?.category || 'Unavailable');
    setText('[data-activation-families]', index?.sourceFamilies ?? '—');
    setText('[data-activation-method]', index?.methodVersion || 'Unavailable');
    setText('[data-activation-regime]', leader?.regime || 'Unavailable');
    setText('[data-activation-confidence]', monthly?.averageConfidence != null ? `${monthly.averageConfidence}%` : '—');
    setText('[data-activation-report-title]', monthly?.title || 'Monthly Intelligence unavailable');
    setText('[data-activation-summary]', monthly?.executiveSummary || 'No generated summary is available.');
    setText('[data-activation-issue]', monthly?.issue || '—');
    setText('[data-activation-risk]', Array.isArray(monthly?.riskWatch) ? `${monthly.riskWatch.length} categories` : '—');
    setText('[data-activation-readiness]', readiness?.status || 'Blocked');

    const chip = qs('[data-activation-readiness-chip]');
    if (chip) {
      const passed = readiness?.status === 'staging-certified';
      chip.textContent = passed ? 'Staging certified' : 'Blocked';
      chip.dataset.health = passed ? 'healthy' : 'failed';
    }

    const gates = qs('[data-activation-gates]');
    if (gates) {
      gates.innerHTML = Object.entries(readiness?.gates || {}).map(([id, status]) => `
        <div class="activation-gate" data-status="${status}">
          <small>${id.replace(/([A-Z])/g, ' $1')}</small>
          <strong>${status}</strong>
        </div>
      `).join('');
    }

    const blocker = Array.isArray(readiness?.blockers) && readiness.blockers.length
      ? readiness.blockers[0]
      : 'Production promotion remains blocked pending explicit authorization.';
    setText('[data-activation-blocker]', blocker);
    document.body.dataset.activationReadiness = readiness?.status || 'blocked';
  };

  const loadIntegratedActivation = async () => {
    try {
      const [index, monthly, readiness] = await Promise.all([
        fetchJson('/a13-b10/data/generated/kidult-100.json'),
        fetchJson('/a13-b10/data/generated/monthly-intelligence.json'),
        fetchJson('/a13-b10/data/generated/readiness.json')
      ]);
      renderIntegratedActivation({ index, monthly, readiness });
    } catch (error) {
      console.error(error);
      renderIntegratedActivation({
        index: null,
        monthly: null,
        readiness: {
          status: 'blocked',
          gates: {},
          blockers: ['Generated activation outputs are unavailable. B12 fallback remains active.']
        }
      });
    }
  };




  const loadAutonomousOperations = async () => {
    try {
      const [health, report] = await Promise.all([
        fetchJson('/a13-b10/data/generated/operations-health.json'),
        fetchJson('/a13-b10/data/generated/autonomous-operations.json')
      ]);
      const results = health.failureSimulation?.results || [];
      const passed = results.filter(item => item.passed).length;
      const stateLabel = report.status === 'staging-operations-certified'
        ? 'Staging operations certified'
        : 'Operations blocked';
      setText('[data-operations-state]', stateLabel);
      setText('[data-operations-simulations]', `${passed}/${results.length}`);
      setText('[data-operations-reports]', health.archive?.reportCount ?? 0);
      setText('[data-operations-fallback]', health.fallback?.verifiedBySimulation ? 'Verified' : 'Blocked');
      setText('[data-operations-schedule]', `${health.schedule?.status || 'blocked'} · ${health.schedule?.cadence || 'unavailable'} ${health.schedule?.timezone || ''}`);
      setText('[data-operations-pipeline]', report.gates?.pipeline || 'blocked');
      setText('[data-operations-recovery]', report.gates?.recovery || 'blocked');
      setText('[data-operations-production]', report.productionPromotionAuthorized ? 'Authorized' : 'Blocked');

      const badge = qs('[data-operations-badge]');
      if (badge) {
        const healthy = report.status === 'staging-operations-certified';
        badge.textContent = healthy ? 'Certified' : 'Blocked';
        badge.dataset.health = healthy ? 'healthy' : 'failed';
      }

      const simulationList = qs('[data-operations-simulations-list]');
      if (simulationList) {
        simulationList.innerHTML = results.map(item => `
          <div class="operations-simulation-item">
            <strong>${item.id}</strong>
            <span class="source-health-status" data-health="${item.passed ? 'healthy' : 'failed'}">${item.passed ? 'Passed' : 'Blocked'}</span>
            <small>Expected: ${item.expected} · Outcome: ${item.outcome} · Fallback: ${item.fallbackActivated ? 'active' : 'not used'}</small>
          </div>
        `).join('');
      }

      const blockers = qs('[data-operations-blockers]');
      if (blockers) {
        blockers.innerHTML = report.blockers?.length
          ? report.blockers.map(item => `<p>${item}</p>`).join('')
          : '<p>No staging operations blockers.</p>';
      }
      document.body.dataset.operationsHealth = health.aggregateHealth || 'unknown';
    } catch (error) {
      console.error(error);
      setText('[data-operations-state]', 'Operations report unavailable');
      const badge = qs('[data-operations-badge]');
      if (badge) {
        badge.textContent = 'Unavailable';
        badge.dataset.health = 'failed';
      }
    }
  };




  const renderLivePilotReadiness = report => {
    const gates = report?.gates || {};
    const gateEntries = Object.entries(gates);
    const passed = gateEntries.filter(([, value]) => value === 'passed').length;
    const selected = Array.isArray(report?.selectedProviders) ? report.selectedProviders : [];
    const candidates = Array.isArray(report?.candidates) ? report.candidates : [];
    const requiredRoles = ['transactions', 'supply', 'culturalDemand'];

    setText('[data-pilot-state]', String(report?.status || 'blocked').replaceAll('-', ' '));
    setText('[data-pilot-selected]', `${selected.length}/3`);
    setText('[data-pilot-families]', report?.independentProviderFamilies ?? 0);
    setText('[data-pilot-gates]', passed);

    const badge = qs('[data-pilot-badge]');
    if (badge) {
      badge.textContent = report?.productionPromotionAuthorized ? 'Production authorized' : 'Production blocked';
      badge.dataset.health = report?.productionPromotionAuthorized ? 'healthy' : 'failed';
    }

    const gateList = qs('[data-pilot-gate-list]');
    if (gateList) {
      gateList.innerHTML = gateEntries.map(([key, value]) => `
        <div><span>${key.replace(/([A-Z])/g, ' $1')}</span><strong data-status="${value}">${value}</strong></div>
      `).join('');
    }

    const roleList = qs('[data-pilot-role-list]');
    if (roleList) {
      roleList.innerHTML = requiredRoles.map(role => {
        const selectedProvider = selected.find(item => item.role === role);
        const roleCandidates = candidates.filter(item => item.role === role);
        const bestCandidate = selectedProvider
          ? candidates.find(item => item.id === selectedProvider.id) || selectedProvider
          : [...roleCandidates].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
        const status = selectedProvider ? 'ready' : 'blocked';
        const score = bestCandidate?.score ?? '—';
        const commercial = bestCandidate?.gates?.commercial || 'blocked';
        const rights = bestCandidate?.gates?.rights || 'blocked';
        const technical = bestCandidate?.gates?.technical || 'blocked';
        return `
          <div class="pilot-role-item">
            <div><strong>${role}</strong><small>${bestCandidate?.id || 'No approved candidate'}</small></div>
            <span class="source-health-status" data-health="${status === 'ready' ? 'healthy' : 'failed'}">${status}</span>
            <div class="pilot-role-meta"><span>Score: ${score}</span><span>Commercial: ${commercial}</span><span>Rights: ${rights}</span><span>Technical: ${technical}</span></div>
          </div>
        `;
      }).join('');
    }

    const blockers = qs('[data-pilot-blockers]');
    if (blockers) {
      const items = Array.isArray(report?.blockers) && report.blockers.length
        ? report.blockers
        : ['No pilot blocker is currently reported.'];
      blockers.innerHTML = items.map(item => `<p>${item}</p>`).join('');
    }

    document.body.dataset.livePilot = report?.status || 'blocked';
  };

  const loadLivePilotReadiness = async () => {
    try {
      const report = await fetchJson('/a13-b10/data/generated/live-pilot-readiness.json');
      renderLivePilotReadiness(report);
    } catch (error) {
      console.error(error);
      renderLivePilotReadiness({
        status: 'blocked',
        productionPromotionAuthorized: false,
        selectedProviders: [],
        independentProviderFamilies: 0,
        candidates: [],
        gates: { report: 'blocked', productionAuthorization: 'blocked' },
        blockers: ['Live pilot readiness report is unavailable.']
      });
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
    setText('[data-evidence-title]', data.title);
    const body = qs('[data-evidence-body]');
    if (body) {
      body.innerHTML = `<div class="evidence-grid">${data.metrics.map(([label,value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><div class="evidence-notes">${data.notes.map(note => `<p>${note}</p>`).join('')}</div>`;
    }
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



  const formatCertificationLabel = value => String(value || '').replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());

  const renderExternalCertification = report => {
    const gates = Object.entries(report.gates || {});
    const passed = gates.filter(([, value]) => value === 'passed' || value === 'ready').length;
    const blocked = gates.length - passed;
    const authorized = report.productionPromotionAuthorized === true;

    setText('[data-certification-status]', report.status || 'blocked');
    setText('[data-certified-families]', report.independentCertifiedFamilies || 0);
    setText('[data-certification-passed]', passed);
    setText('[data-certification-blocked]', blocked);

    const badge = qs('[data-certification-badge]');
    if (badge) {
      badge.textContent = authorized ? 'Production authorized' : 'Production blocked';
      badge.dataset.health = authorized ? 'healthy' : 'failed';
    }

    const gateTarget = qs('[data-certification-gates]');
    if (gateTarget) {
      gateTarget.innerHTML = gates.map(([name, value]) => `
        <div class="certification-gate"><span>${formatCertificationLabel(name)}</span><strong data-state="${value}">${value}</strong></div>
      `).join('');
    }

    const providerTarget = qs('[data-provider-certification-list]');
    if (providerTarget) {
      providerTarget.innerHTML = (report.providers || []).map(provider => {
        const providerGates = Object.values(provider.certification || {});
        const providerReady = providerGates.every(value => value === 'passed' || value === 'ready');
        return `
          <article class="source-health-item">
            <div class="source-health-head"><strong>${provider.role}</strong><small>${provider.family} · ${provider.id}</small></div>
            <span class="source-health-status" data-health="${providerReady ? 'healthy' : 'failed'}">${providerReady ? 'Certified' : 'Blocked'}</span>
            <div class="source-health-meta">
              <span>Credentials: ${provider.certification?.credentials || 'blocked'}</span>
              <span>Rights: ${provider.certification?.rights || 'blocked'}</span>
              <span>Endpoint: ${provider.certification?.endpoint || 'blocked'}</span>
              <span>Health: ${provider.certification?.healthProbe || 'blocked'}</span>
            </div>
          </article>
        `;
      }).join('') || '<p class="source-health-empty">No provider certification records.</p>';
    }

    const blockers = qs('[data-certification-blockers]');
    if (blockers) {
      blockers.innerHTML = (report.blockers || []).map(item => `<li>${item}</li>`).join('') || '<li>No blockers.</li>';
    }

    document.body.dataset.externalCertification = report.status || 'blocked';
    document.body.dataset.productionAuthorized = String(authorized);
  };

  const loadExternalCertification = async () => {
    try {
      const report = await fetchJson('/a13-b10/data/generated/external-source-certification.json');
      renderExternalCertification(report);
    } catch (error) {
      console.error(error);
      renderExternalCertification({
        status: 'blocked',
        productionPromotionAuthorized: false,
        independentCertifiedFamilies: 0,
        providers: [],
        gates: { certificationReport: 'blocked' },
        blockers: ['Certification report is unavailable. Production promotion remains blocked.']
      });
    }
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
  loadSourceRegistry().finally(loadProductThroughAdapter);
  loadProviderCommandCenter();
  loadExternalCertification();
  loadIntegratedActivation();
  window.addEventListener('scroll', requestNavigationSync, { passive: true });
  window.addEventListener('resize', () => {
    syncDesktopPanelWidths();
    requestNavigationSync();
  });
  window.addEventListener('load', () => {
    syncDesktopPanelWidths();
    requestNavigationSync();
  });
  loadAutonomousOperations();
  requestNavigationSync();
  loadLivePilotReadiness();

})();


// A13-B19 provider shortlist
const renderProviderShortlist = async () => {
  const section = document.querySelector('#provider-shortlist');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-shortlist.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Shortlist request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-shortlist-status]', report.status.replaceAll('-', ' '));
    set('[data-shortlist-candidates]', String(report.candidateCount));
    set('[data-shortlist-roles]', `${report.roleCoverage.filter(item => item.candidateCount >= 2).length}/${report.roleCoverage.length}`);
    set('[data-shortlist-outreach]', String(report.outreachRequired));
    const gates = section.querySelector('[data-shortlist-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const roles = section.querySelector('[data-shortlist-roles-list]');
    if (roles) roles.innerHTML = report.roleCoverage.map(role => {
      const primary = role.primaryCandidate;
      return `<article class="provider-role-card"><div class="provider-role-head"><h3>${role.role}</h3><span>${role.candidateCount} candidates</span></div><p class="provider-primary">${primary ? primary.provider : 'No primary candidate'}</p><div class="provider-meta"><span>Access: ${primary ? primary.accessStatus : 'unknown'}</span><span>Priority: ${primary ? '1' : '—'}</span></div><p class="provider-action">${primary ? primary.outreachAction : 'Direct provider research required.'}</p></article>`;
    }).join('');
    document.body.dataset.providerShortlist = report.status;
  } catch (error) {
    setTimeout(() => { const node = section.querySelector('[data-shortlist-status]'); if (node) node.textContent = 'Unavailable'; }, 0);
    console.error(error);
  }
};
renderProviderShortlist();


// A13-B20 provider outreach
const renderProviderOutreach = async () => {
  const section = document.querySelector('#provider-outreach');
  if (!section) return;
  const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
  try {
    const response = await fetch('/a13-b10/data/generated/provider-outreach-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Outreach request failed: ${response.status}`);
    const report = await response.json();
    set('[data-outreach-status]', report.status.replaceAll('-', ' '));
    set('[data-outreach-contacted]', `${report.totals.contacted}/${report.totals.queued}`);
    set('[data-outreach-responded]', String(report.totals.responded));
    set('[data-outreach-ready]', String(report.totals.pilotReady));
    const gates = section.querySelector('[data-outreach-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const queue = section.querySelector('[data-outreach-queue]');
    if (queue) queue.innerHTML = report.queue.map(item => `<article class="outreach-item"><div class="outreach-item-head"><h3>${item.role}</h3><span>${item.status}</span></div><div class="outreach-item-meta"><span>${item.candidateId}</span><span>Priority ${item.priority}</span><span>Evidence ${item.evidenceCount}/8</span></div><p class="outreach-evidence">Evidence complete: ${item.evidenceComplete ? 'yes' : 'no'} · Pilot-ready: ${item.pilotReady ? 'yes' : 'no'}</p></article>`).join('');
    const blockers = section.querySelector('[data-outreach-blockers]');
    if (blockers) blockers.innerHTML = report.blockers.map(item => `<p class="outreach-blocker">${item}</p>`).join('');
    document.body.dataset.providerOutreach = report.status;
  } catch (error) {
    set('[data-outreach-status]', 'Unavailable');
    console.error(error);
  }
};
renderProviderOutreach();


// A13-B21 response intake
const renderProviderResponseIntake = async () => {
  const section = document.querySelector('#response-intake');
  if (!section) return;
  const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
  try {
    const response = await fetch('/a13-b10/data/generated/provider-response-intake-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Response intake request failed: ${response.status}`);
    const report = await response.json();
    set('[data-intake-status]', report.status.replaceAll('-', ' '));
    set('[data-intake-packs]', String(report.totals.packs));
    set('[data-intake-contacted]', String(report.totals.contacted));
    set('[data-intake-responded]', String(report.totals.responded));
    set('[data-intake-ready]', String(report.totals.pilotReady));
    const gates = section.querySelector('[data-intake-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const queue = section.querySelector('[data-intake-queue]');
    if (queue) queue.innerHTML = report.queue.map(item => `<article class="intake-card"><div class="intake-card-head"><h3>${item.role} · priority ${item.priority}</h3><span class="status-chip">${item.status}</span></div><p class="intake-card-subject">${item.subject || item.candidateId}</p><div class="intake-card-meta"><span>Candidate: ${item.candidateId}</span><span>Evidence: ${item.verifiedEvidenceCount}/${report.totals.requiredEvidencePerCandidate}</span><span>Complete: ${item.evidenceComplete ? 'Yes' : 'No'}</span></div><p class="intake-card-request">${item.request || 'Provider response pending.'}</p></article>`).join('');
    document.body.dataset.responseIntake = report.status;
  } catch (error) {
    set('[data-intake-status]', 'Unavailable');
    console.error(error);
  }
};
renderProviderResponseIntake();


// A13-B22 dispatch ledger
const renderDispatchLedger = async () => {
  const section = document.querySelector('#dispatch-ledger');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-dispatch-audit.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Dispatch audit request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-dispatch-status]', report.status.replaceAll('-', ' '));
    set('[data-dispatch-contacted]', `${report.totals.contacted}/${report.totals.candidates}`);
    set('[data-dispatch-responded]', String(report.totals.responded));
    set('[data-dispatch-ready]', String(report.totals.pilotReady));
    set('[data-dispatch-events]', String(report.totals.events));
    const gates = section.querySelector('[data-dispatch-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const candidates = section.querySelector('[data-dispatch-candidates]');
    if (candidates) candidates.innerHTML = report.candidates.map(item => `<article class="dispatch-candidate"><div class="dispatch-candidate-head"><h3>${item.role} · priority ${item.priority}</h3><span class="status-chip">${item.status}</span></div><p>${item.candidateId}</p><p>Evidence ${item.evidenceVerified}/${item.evidenceRequired} · Complete: ${item.evidenceComplete ? 'Yes' : 'No'} · Pilot-ready: ${item.pilotReady ? 'Yes' : 'No'}</p></article>`).join('');
    document.body.dataset.dispatchLedger = report.status;
  } catch (error) {
    const node = section.querySelector('[data-dispatch-status]');
    if (node) node.textContent = 'Unavailable';
    console.error(error);
  }
};
renderDispatchLedger();


// A13-B23 batch outreach and evidence intake
const renderBatchIntake = async () => {
  const section = document.querySelector('#batch-intake');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-batch-progress.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Batch intake request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-batch-status]', report.status.replaceAll('-', ' '));
    set('[data-batch-contacted]', `${report.totals.contacted}/${report.totals.candidates}`);
    set('[data-batch-remaining]', String(report.totals.remainingDispatches));
    set('[data-batch-ready]', String(report.totals.pilotReady));
    const gates = section.querySelector('[data-batch-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const list = section.querySelector('[data-batch-candidates]');
    if (list) list.innerHTML = report.candidates.map(item => `<article class="batch-candidate"><div class="batch-candidate-head"><h3>${item.role} · priority ${item.priority}</h3><span class="status-chip">${item.status}</span></div><div class="batch-candidate-meta"><span>${item.candidateId}</span><span>Evidence ${item.evidenceVerified}/${item.evidenceRequired}</span><span>Complete: ${item.evidenceComplete ? 'Yes' : 'No'}</span><span>Pilot-ready: ${item.pilotReady ? 'Yes' : 'No'}</span></div></article>`).join('');
    document.body.dataset.batchIntake = report.status;
  } catch (error) {
    set('[data-batch-status]', 'Unavailable');
    console.error(error);
  }
};
renderBatchIntake();


// A13-B24 manual dispatch control
const renderManualDispatchControl = async () => {
  const section = document.querySelector('#manual-dispatch-control');
  if (!section) return;
  try {
    const response = await fetch('/a13-b10/data/generated/provider-manual-dispatch-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manual dispatch status request failed: ${response.status}`);
    const report = await response.json();
    const set = (selector, value) => { const node = section.querySelector(selector); if (node) node.textContent = value; };
    set('[data-manual-dispatch-status]', report.status.replaceAll('-', ' '));
    set('[data-manual-dispatch-pending]', String(report.totals.pending));
    set('[data-manual-dispatch-reviewed]', String(report.totals.reviewComplete));
    set('[data-manual-dispatch-confirmed]', String(report.totals.dispatchedConfirmed));
    set('[data-manual-dispatch-commands]', String(report.totals.contactedCommandsReady));
    const gates = section.querySelector('[data-manual-dispatch-gates]');
    if (gates) gates.innerHTML = Object.entries(report.gates).map(([name, value]) => `<p><span>${name.replace(/([A-Z])/g, ' $1')}</span><strong>${value}</strong></p>`).join('');
    const list = section.querySelector('[data-manual-dispatch-list]');
    if (list) list.innerHTML = report.exports.map(item => {
      const command = item.contactedCommand
        ? `<p class="manual-dispatch-command">${item.contactedCommand}</p>`
        : '<p class="manual-dispatch-locked">Contacted command locked until review and real dispatch confirmation are complete.</p>';
      return `<article class="manual-dispatch-card"><div class="manual-dispatch-head"><h3>${item.subject}</h3><span>${item.role}</span></div><div class="manual-dispatch-meta"><span>Review: ${item.reviewComplete ? 'complete' : 'pending'}</span><span>Dispatch: ${item.dispatched ? 'confirmed' : 'pending'}</span></div><p class="manual-dispatch-path">Packet: ${item.exportFile}</p>${command}</article>`;
    }).join('');
    document.body.dataset.manualDispatch = report.status;
  } catch (error) {
    const node = section.querySelector('[data-manual-dispatch-status]');
    if (node) node.textContent = 'Unavailable';
    console.error(error);
  }
};
renderManualDispatchControl();
