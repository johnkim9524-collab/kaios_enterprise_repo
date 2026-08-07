(() => {
  'use strict';

  const API_PATH = 'api/v1/governed-intelligence.json';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function ensurePanel() {
    let panel = document.querySelector('[data-governed-homepage]');
    if (panel) return panel;

    const anchor = document.querySelector('.data-note');
    if (!anchor) return null;

    panel = document.createElement('section');
    panel.className = 'metrics governed-homepage-metrics';
    panel.dataset.governedHomepage = 'true';
    panel.setAttribute('aria-label', 'Governed intelligence publication state');
    panel.innerHTML = `
      <div><strong data-governed-publish>—</strong><span>Publish candidates</span></div>
      <div><strong data-governed-held>—</strong><span>Held for review</span></div>
      <div><strong data-governed-feed>—</strong><span>Executive feed</span></div>
      <div><strong data-governed-production>—</strong><span>Production</span></div>
      <div><strong data-governed-updated>—</strong><span>Updated</span></div>
    `;
    anchor.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function set(selector, value) {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value;
    });
  }

  function publishUnavailable(message = 'Unavailable') {
    const panel = ensurePanel();
    if (!panel) return;
    panel.dataset.governedState = 'unavailable';
    set('[data-governed-publish]', '—');
    set('[data-governed-held]', '—');
    set('[data-governed-feed]', '—');
    set('[data-governed-production]', message);
    set('[data-governed-updated]', '—');
  }

  function render(data) {
    const panel = ensurePanel();
    if (!panel) return;

    const counts = data?.counts || {};
    const authorized = data?.production_promotion_authorized === true;
    const generated = data?.generated_at ? new Date(data.generated_at) : null;

    panel.dataset.governedState = authorized ? 'authorized' : 'review';
    set('[data-governed-publish]', String(Number(counts.publish_candidates || 0)));
    set('[data-governed-held]', String(Number(counts.held || 0)));
    set('[data-governed-feed]', String(Number(counts.executive_feed || 0)));
    set('[data-governed-production]', authorized ? 'Authorized' : 'Review');
    set('[data-governed-updated]', generated && Number.isFinite(generated.getTime())
      ? generated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '—');

    const held = Array.isArray(data?.held) ? data.held : [];
    panel.title = held.length
      ? `Governed publishing: ${held.length} held item(s). ${esc(held[0]?.reasons?.join(', ') || 'Human review required.')}`
      : 'Governed publishing state loaded.';

    window.KIDULTS_GOVERNED_HOMEPAGE = Object.freeze({
      schemaVersion: data?.schema_version || null,
      generatedAt: data?.generated_at || null,
      productionPromotionAuthorized: authorized,
      counts: { ...counts }
    });

    window.dispatchEvent(new CustomEvent('kidults:governed-homepage-ready', {
      detail: window.KIDULTS_GOVERNED_HOMEPAGE
    }));
  }

  async function load() {
    ensurePanel();
    try {
      const response = await fetch(API_PATH, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data?.schema_version !== 'kidults.portal-bridge.v1') {
        throw new Error('Unsupported governed portal bridge schema');
      }
      render(data);
    } catch (error) {
      console.warn('Governed homepage intelligence unavailable', error);
      publishUnavailable('Review');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
