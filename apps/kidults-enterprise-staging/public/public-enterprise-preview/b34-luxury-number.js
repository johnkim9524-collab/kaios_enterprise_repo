(() => {
  const DECIMAL_PATTERN = /^(-?\d+)(\.\d+)$/;

  function formatDecimal(node) {
    if (!node || node.dataset.luxuryNumberReady === 'true') return;
    const raw = node.textContent.trim();
    const match = raw.match(DECIMAL_PATTERN);
    node.classList.add('luxury-number');
    node.setAttribute('aria-label', raw);
    if (match) {
      node.innerHTML = `<span class="luxury-number__integer">${match[1]}</span><span class="luxury-number__decimal">${match[2]}</span>`;
    }
    node.dataset.luxuryNumberReady = 'true';
  }

  function apply() {
    document.querySelectorAll('[data-k100]').forEach(formatDecimal);
    document.querySelectorAll('.metrics strong:not([data-k100]), .chart-side strong:not([data-k100]), .category-copy>div:first-child strong, .trend-summary-strip b, .composition-total strong').forEach((node) => {
      node.classList.add('luxury-number--secondary');
    });
    document.documentElement.dataset.luxuryNumberSystem = 'b34';
  }

  const observer = new MutationObserver(() => apply());

  function start() {
    apply();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setTimeout(() => observer.disconnect(), 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
