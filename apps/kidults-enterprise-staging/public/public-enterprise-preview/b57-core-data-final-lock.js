(() => {
  'use strict';

  const PANEL_COLOR = '#fdfaf4';

  function lockTrendModule() {
    const section = document.querySelector('.data-section');
    if (!section) return;

    section.querySelectorAll('.trend-summary-strip').forEach((node) => node.remove());

    const panel = section.querySelector('.chart-panel');
    const chart = section.querySelector('.trend-chart');
    const side = section.querySelector('.chart-side');

    [panel, chart, side].forEach((node) => {
      if (!node) return;
      node.style.setProperty('background', PANEL_COLOR, 'important');
      node.style.setProperty('background-color', PANEL_COLOR, 'important');
    });

    if (panel) panel.style.setProperty('box-shadow', '0 10px 28px rgba(16,22,19,.018)', 'important');
    if (side) side.style.setProperty('border-left', '1px solid rgba(16,22,19,.085)', 'important');
  }

  function installObserver() {
    const section = document.querySelector('.data-section');
    if (!section) return;
    const observer = new MutationObserver(() => lockTrendModule());
    observer.observe(section, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 5000);
  }

  function run() {
    lockTrendModule();
    installObserver();
    requestAnimationFrame(lockTrendModule);
    window.setTimeout(lockTrendModule, 250);
    window.setTimeout(lockTrendModule, 900);
    window.setTimeout(lockTrendModule, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
