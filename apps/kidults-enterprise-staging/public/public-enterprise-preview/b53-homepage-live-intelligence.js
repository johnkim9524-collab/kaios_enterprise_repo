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

  function ensureQuietLuxuryStyles() {
    if (document.querySelector('[data-governed-homepage-style]')) return;

    const style = document.createElement('style');
    style.dataset.governedHomepageStyle = 'true';
    style.textContent = `
      .data-note {
        min-height: 52px !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        align-items: center !important;
      }

      .data-note strong,
      .data-note span,
      .data-note [data-status-label] {
        font-size: 11px !important;
        line-height: 1.25 !important;
        letter-spacing: .11em !important;
      }

      .governed-homepage-metrics {
        min-height: 0 !important;
        height: auto !important;
        align-items: stretch !important;
      }

      .governed-homepage-metrics > div {
        min-height: 118px !important;
        padding: 24px 30px 22px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        gap: 10px !important;
      }

      .governed-homepage-metrics strong {
        margin: 0 !important;
        font-size: clamp(25px, 2.15vw, 34px) !important;
        line-height: .96 !important;
        font-weight: 400 !important;
        letter-spacing: -.025em !important;
      }

      .governed-homepage-metrics [data-governed-production] {
        font-size: clamp(20px, 1.75vw, 28px) !important;
        letter-spacing: .015em !important;
      }

      .governed-homepage-metrics [data-governed-updated] {
        font-size: clamp(19px, 1.6vw, 26px) !important;
        line-height: 1.08 !important;
        letter-spacing: -.012em !important;
        white-space: nowrap !important;
      }

      .governed-homepage-metrics span {
        margin: 0 !important;
        font-size: 10px !important;
        line-height: 1.25 !important;
        font-weight: 500 !important;
        letter-spacing: .115em !important;
        text-transform: uppercase !important;
        opacity: .68 !important;
      }

      @media (max-width: 900px) {
        .governed-homepage-metrics > div {
          min-height: 102px !important;
          padding: 20px 22px 18px !important;
        }

        .governed-homepage-metrics strong {
          font-size: 27px !important;
        }

        .governed-homepage-metrics [data-governed-production] {
          font-size: 22px !important;
        }

        .governed-homepage-metrics [data-governed-updated] {
          font-size: 20px !important;
          white-space: normal !important;
        }
      }

      @media (max-width: 620px) {
        .data-note {
          min-height: 48px !important;
        }

        .governed-homepage-metrics > div {
          min-height: 92px !important;
          padding: 18px 16px 16px !important;
        }

        .governed-homepage-metrics strong {
          font-size: 24px !important;
        }

        .governed-homepage-metrics [data-governed-production],
        .governed-homepage-metrics [data-governed-updated] {
          font-size: 18px !important;
        }

        .governed-homepage-metrics span {
          font-size: 9px !important;
          letter-spacing: .09em !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    ensureQuietLuxuryStyles();

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
      <div><strong data-governed-production>—</strong><span>Production state</span></div>
      <div><strong data-governed-updated>—</strong><span>Governed update</span></div>
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
    set('[data-governed-production]', authorized ? 'AUTHORIZED' : 'REVIEW');
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
      publishUnavailable('REVIEW');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }
})();
