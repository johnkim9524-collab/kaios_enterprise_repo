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
      /* 9.x editorial-luxury refinement: preserve the portal, quiet only this governed layer. */
      .data-note {
        min-height: 42px !important;
        padding: 0 40px !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        border-top: 1px solid rgba(16, 39, 33, .10) !important;
        border-bottom: 0 !important;
        background: transparent !important;
      }

      .data-note .live-pulse {
        width: 7px !important;
        height: 7px !important;
        box-shadow: 0 0 0 5px rgba(87, 209, 170, .13) !important;
      }

      .data-note strong,
      .data-note span,
      .data-note [data-status-label] {
        font-size: 9px !important;
        line-height: 1 !important;
        font-weight: 600 !important;
        letter-spacing: .14em !important;
        text-transform: uppercase !important;
      }

      .data-note [data-status-label] {
        margin-left: auto !important;
        font-weight: 500 !important;
        letter-spacing: .08em !important;
        opacity: .46 !important;
      }

      .governed-homepage-metrics {
        min-height: 0 !important;
        height: auto !important;
        display: grid !important;
        grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
        align-items: center !important;
        padding: 0 40px !important;
        border-top: 1px solid rgba(16, 39, 33, .08) !important;
        border-bottom: 1px solid rgba(16, 39, 33, .10) !important;
        background: transparent !important;
      }

      .governed-homepage-metrics > div {
        position: relative !important;
        min-width: 0 !important;
        min-height: 64px !important;
        padding: 0 28px !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 14px !important;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .governed-homepage-metrics > div:first-child {
        padding-left: 0 !important;
      }

      .governed-homepage-metrics > div:last-child {
        padding-right: 0 !important;
      }

      .governed-homepage-metrics > div:not(:last-child)::after {
        content: '' !important;
        position: absolute !important;
        right: 0 !important;
        top: 20px !important;
        width: 1px !important;
        height: 24px !important;
        background: rgba(16, 39, 33, .11) !important;
      }

      .governed-homepage-metrics strong,
      .governed-homepage-metrics [data-governed-production],
      .governed-homepage-metrics [data-governed-updated] {
        margin: 0 !important;
        font-family: Georgia, 'Times New Roman', serif !important;
        font-size: 16px !important;
        line-height: 1 !important;
        font-weight: 400 !important;
        letter-spacing: -.018em !important;
        white-space: nowrap !important;
        color: #0b332a !important;
      }

      .governed-homepage-metrics span {
        order: -1 !important;
        margin: 0 !important;
        font-size: 8px !important;
        line-height: 1 !important;
        font-weight: 600 !important;
        letter-spacing: .13em !important;
        text-transform: uppercase !important;
        opacity: .64 !important;
        color: #102721 !important;
        white-space: nowrap !important;
      }

      .governed-homepage-metrics[data-governed-state='review'] [data-governed-production] {
        font-weight: 400 !important;
        letter-spacing: 0 !important;
        text-transform: none !important;
      }

      .governed-homepage-metrics [data-governed-production]::first-letter {
        text-transform: uppercase !important;
      }

      @media (max-width: 1100px) {
        .governed-homepage-metrics {
          padding: 0 28px !important;
          grid-template-columns: repeat(5, minmax(145px, 1fr)) !important;
          overflow-x: auto !important;
          overscroll-behavior-x: contain !important;
          -webkit-overflow-scrolling: touch !important;
        }

        .governed-homepage-metrics > div {
          padding: 0 20px !important;
        }
      }

      @media (max-width: 900px) {
        .data-note {
          padding: 0 22px !important;
        }

        .governed-homepage-metrics {
          padding: 0 22px !important;
          grid-template-columns: repeat(5, minmax(138px, 1fr)) !important;
        }

        .governed-homepage-metrics > div {
          min-height: 60px !important;
          gap: 11px !important;
        }

        .governed-homepage-metrics strong,
        .governed-homepage-metrics [data-governed-production],
        .governed-homepage-metrics [data-governed-updated] {
          font-size: 15px !important;
        }
      }

      @media (max-width: 620px) {
        .data-note {
          min-height: 40px !important;
          padding: 0 16px !important;
        }

        .data-note strong,
        .data-note span,
        .data-note [data-status-label] {
          font-size: 8px !important;
          letter-spacing: .11em !important;
        }

        .governed-homepage-metrics {
          padding: 0 16px !important;
          grid-template-columns: repeat(5, minmax(132px, 1fr)) !important;
        }

        .governed-homepage-metrics > div {
          min-height: 58px !important;
          padding: 0 16px !important;
          gap: 9px !important;
        }

        .governed-homepage-metrics > div:first-child {
          padding-left: 0 !important;
        }

        .governed-homepage-metrics strong,
        .governed-homepage-metrics [data-governed-production],
        .governed-homepage-metrics [data-governed-updated] {
          font-size: 14px !important;
        }

        .governed-homepage-metrics span {
          font-size: 7px !important;
          letter-spacing: .10em !important;
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
