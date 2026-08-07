(() => {
  'use strict';

  const DATA_PATTERN = /intelligence-data(?:\.preview)?\.json(?:$|\?)/;
  const ALLOWED_STATUS = new Set(['illustrative', 'staging', 'validated', 'production']);
  const nativeFetch = window.fetch.bind(window);

  const hardeningCss = document.createElement('link');
  hardeningCss.rel = 'stylesheet';
  hardeningCss.href = 'b51-global-standard-hardening.css?v=1';
  document.head.appendChild(hardeningCss);

  const governedHomepageScript = document.createElement('script');
  governedHomepageScript.src = 'b53-homepage-live-intelligence.js?v=2';
  governedHomepageScript.defer = true;
  document.head.appendChild(governedHomepageScript);

  const runtime = {
    state: 'loading',
    status: null,
    integrity: 'pending',
    updated: null,
    methodologyVersion: null,
    sourceLineageAvailable: false,
    errors: []
  };

  function expose() {
    window.KIDULTS_INTELLIGENCE_RUNTIME = Object.freeze({ ...runtime });
    document.documentElement.dataset.intelligenceState = runtime.state;
    document.documentElement.dataset.integrityState = runtime.integrity;
    if (runtime.status) document.documentElement.dataset.dataStatus = runtime.status;
  }

  function sum(items) {
    return (items || []).reduce((total, item) => total + Number(item.value || 0), 0);
  }

  function approximately(value, expected, tolerance = 0.01) {
    return Math.abs(Number(value) - Number(expected)) <= tolerance;
  }

  function normalizeDataset(data) {
    if (!data || typeof data !== 'object') return data;
    const current = Number(data.headline?.kidult100);
    if (Number.isFinite(current) && Array.isArray(data.trend) && data.trend.length) {
      data.trend = data.trend.map((point, index) => index === data.trend.length - 1
        ? { ...point, value: current }
        : point);
    }
    return data;
  }

  function validate(data) {
    const errors = [];

    if (!data || typeof data !== 'object') errors.push('Data asset must be an object.');
    if (!ALLOWED_STATUS.has(data?.status)) errors.push('Unsupported data status.');
    if (!Number.isFinite(Date.parse(data?.updated))) errors.push('Invalid updated timestamp.');
    if (typeof data?.methodologyVersion !== 'string' || !data.methodologyVersion.trim()) errors.push('Missing methodology version.');

    const headline = data?.headline;
    if (!headline || typeof headline !== 'object') errors.push('Missing headline intelligence.');
    if (!Number.isFinite(Number(headline?.kidult100))) errors.push('Invalid Kidult 100 value.');
    if (!Array.isArray(data?.trend) || data.trend.length === 0) {
      errors.push('Missing trend observations.');
    } else {
      const finalTrend = data.trend[data.trend.length - 1]?.value;
      if (!approximately(finalTrend, headline?.kidult100)) errors.push('Headline and final trend value do not match.');
    }

    const percentageGroups = [
      ['signalMix', data?.signalMix],
      ['confidenceDistribution', data?.confidenceDistribution],
      ['sourceComposition', data?.sourceComposition],
      ['geography', data?.geography]
    ];

    percentageGroups.forEach(([name, items]) => {
      if (!Array.isArray(items) || items.length === 0) errors.push(`${name} is missing.`);
      else if (!approximately(sum(items), 100)) errors.push(`${name} must total 100.`);
    });

    const categories = data?.categoriesData;
    if (!Array.isArray(categories) || categories.length === 0) {
      errors.push('Category intelligence is missing.');
    } else {
      const names = categories.map((item) => String(item.name || '').trim()).filter(Boolean);
      if (new Set(names).size !== names.length) errors.push('Duplicate category names detected.');
    }

    const correlation = data?.correlation;
    if (!Array.isArray(correlation?.labels) || !Array.isArray(correlation?.values)) {
      errors.push('Correlation matrix is missing.');
    } else if (correlation.labels.length !== correlation.values.length || correlation.values.some((row) => !Array.isArray(row) || row.length !== correlation.labels.length)) {
      errors.push('Correlation matrix must be square.');
    }

    return errors;
  }

  function governedLabel(status) {
    const labels = {
      illustrative: 'Illustrative data',
      staging: 'Illustrative staging data',
      validated: 'Validated intelligence data',
      production: 'Production intelligence data'
    };
    return labels[status] || 'Data temporarily unavailable';
  }

  function replaceText(root, from, to) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replaceAll(from, to);
    });
  }

  function hardenNarrative(data) {
    const current = Number(data.headline?.kidult100);
    const currentText = Number.isFinite(current) ? current.toFixed(1) : '—';
    const method = String(data.methodologyVersion || '—');
    const status = String(data.status || '').toLowerCase();
    const trendSection = document.querySelector('.data-section');

    replaceText(trendSection, '94.8', currentText);
    replaceText(trendSection, 'Methodology v1.3', `Methodology ${method}`);
    replaceText(trendSection, 'Current matches headline 94.8', `Current matches headline ${currentText}`);

    document.querySelector('#signal-mix .composition-detail')?.remove();

    const confidence = document.querySelector('#confidence-chart');
    if (confidence && ['illustrative', 'staging'].includes(status) && !confidence.querySelector('.radial-data-note')) {
      const note = document.createElement('p');
      note.className = 'radial-data-note';
      note.textContent = 'Illustrative staging distribution — not a production confidence claim.';
      confidence.appendChild(note);
    }

    const geography = document.querySelector('#geography-chart');
    if (geography && !geography.querySelector('.geography-interpretation')) {
      const note = document.createElement('p');
      note.className = 'geography-interpretation';
      note.textContent = 'Regional weights reflect observed evidence availability, not total market size.';
      geography.appendChild(note);
    }
  }

  function publishState(data) {
    runtime.state = 'ready';
    runtime.status = data.status;
    runtime.integrity = 'passed';
    runtime.updated = data.updated;
    runtime.methodologyVersion = data.methodologyVersion;
    runtime.sourceLineageAvailable = Boolean(data.sourceLineage || data.lineage);
    runtime.errors = [];
    expose();

    document.querySelectorAll('[data-status-label]').forEach((node) => {
      node.textContent = governedLabel(data.status);
    });

    const apply = () => hardenNarrative(data);
    apply();
    window.setTimeout(apply, 300);
    window.setTimeout(apply, 1200);

    window.dispatchEvent(new CustomEvent('kidults:intelligence-ready', {
      detail: { ...runtime }
    }));
  }

  function publishFailure(errors) {
    runtime.state = 'unavailable';
    runtime.status = null;
    runtime.integrity = 'failed';
    runtime.errors = [...errors];
    expose();

    document.querySelectorAll('[data-status-label]').forEach((node) => {
      node.textContent = 'Data temporarily unavailable';
    });

    window.dispatchEvent(new CustomEvent('kidults:intelligence-unavailable', {
      detail: { ...runtime }
    }));
  }

  window.fetch = async (...args) => {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    const response = await nativeFetch(...args);

    if (!DATA_PATTERN.test(url) || !response.ok) {
      if (DATA_PATTERN.test(url) && !response.ok) publishFailure([`Data request failed with HTTP ${response.status}.`]);
      return response;
    }

    try {
      const data = normalizeDataset(await response.clone().json());
      const errors = validate(data);
      if (errors.length) {
        publishFailure(errors);
        throw new Error(`KIDULTS intelligence integrity failure: ${errors.join(' ')}`);
      }
      publishState(data);
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (error) {
      if (runtime.integrity !== 'failed') publishFailure(['Data asset could not be parsed.']);
      throw error;
    }
  };

  expose();
})();