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
      /* Secondary governed state: one quiet editorial rail, not a second KPI dashboard. */
      .data-note {
        min-height: 46px !important;
        padding: 0 32px !important;
        display: flex !important;
        align-items: center !important;
        border-top: 1px solid rgba(16, 39, 33, .11) !important;
        border-bottom: 1px solid rgba(16, 39, 33, .11) !important;
        background: rgba(247, 243, 234, .58) !important;
      }

      .data-note strong,
      .data-note span,
      .data-note [data-status-label] {
        font-size: 10px !important;
        line-height: 1 !important;
        font-weight: 600 !important;
        letter-spacing: .12em !important;
        text-transform: uppercase !important;
      }

      .governed-homepage-metrics {
        min-height: 0 !important;
        height: auto !important;
        display: grid !important;
        grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
        align-items: stretch !important;
        border-bottom: 1px solid rgba(16, 39, 33, .11) !important;
        background: rgba(247, 243, 234, .34) !important;
      }

      .governed-homepage-metrics > div {
        min-width: 0 !important;
        min-height: 82px !important;
        padding: 17px 30px 15px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        gap: 8px !important;
        border: 0 !important;
        border-right: 1px solid rgba(16, 39, 33, .10) !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .governed-homepage-metrics > div:last-child {
        border-right: 0 !important;
      }

      /* Every governed value uses one typographic scale. */
      .governed-homepage-metrics strong,
      .governed-homepage-metrics [data-governed-production],
      .governed-homepage-metrics [data-governed-updated] {
        margin: 0 !important;
        font-family: inherit !important;
        font-size: 20px !important;
        line-height: 1.05 !important;
        font-weight: 500 !important;
        letter-spacing: -.012em !important;
        white-space: nowrap !important;
        color: #102721 !important;
      }

      .governed-homepage-metrics span {
        margin: 0 !important;
        font-size: 9px !important;
        line-height: 1.15 !important;
        font-weight: 600 !important;
        letter-spacing: .105em !important;
        text-transform: uppercase !important;
        opacity: .58 !important;
        color: #102721 !important;
      }

      .governed-homepage-metrics[data-governed-state='review'] [data-governed-production] {
        font-weight: 600 !important;
        letter-spacing: .04em !important;
      }

      @media (max-width: 900px) {
        .data-note {
          padding: 0 22px !important;
        }

        .governed-homepage-metrics {
          grid-template-columns: repeat(5, minmax(118px, 1fr)) !important;
          overflow-x: auto !important;
          overscroll-behavior-x: contain !important;
          -webkit-overflow-scrolling: touch !important;
        }

        .governed-homepage-metrics > div {
          min-height: 76px !important;
          padding: 15px 20px 14px !important;
        }

        .governed-homepage-metrics strong,
        .governed-homepage-metrics [data-governed-production],
        .governed-homepage-metrics [data-governed-updated] {
          font-size: 18px !important;
        }
      }

      @media (max-width: 620px) {
        .data-note {
          min-height: 44px !important;
          padding: 0 16px !important;
        }

        .data-note strong,
        .data-note span,
        .data-note [data-status-label] {
          font-size: 9px !important;
          letter-spacing: .10em !important;
        }

        .governed-homepage-metrics {
          grid-template-columns: repeat(5, minmax(112px, 1fr)) !important;
        }

        .governed-homepage-metrics > div {
          min-height: 72px !important;
          padding: 14px 16px 12px !important;
          gap: 6px !important;
        }

        .governed-homepage-metrics strong,
        .governed-homepage-metrics [data-governed-production],
        .governed-homepage-metrics [data-governed-updated] {
          font-size: 17px !important;
        }

        .governed-homepage-metrics span {
          font-size: 8px !important;
          letter-spacing: .085em !important;
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
