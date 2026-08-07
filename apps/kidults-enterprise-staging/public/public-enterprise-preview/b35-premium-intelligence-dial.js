(() => {
  const CARD_SELECTOR = '.hero aside';

  function plainText(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function ensureFinalHeroStyles() {
    const existing = document.querySelector('link[data-b58-hero-index-final-polish-runtime]');
    if (existing) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'b58-hero-index-final-polish.css?v=4';
    stylesheet.dataset.b58HeroIndexFinalPolishRuntime = 'true';
    document.head.appendChild(stylesheet);
  }

  function renderEditorialNumber(node, value) {
    const formatted = Number(value).toFixed(1);
    const [integer, decimal] = formatted.split('.');
    node.className = 'premium-dial__value premium-dial__value--editorial';
    node.setAttribute('aria-label', formatted);
    node.innerHTML = `<span class="premium-dial__integer">${integer}</span><span class="premium-dial__decimal">.${decimal}</span>`;
    node.removeAttribute('style');
  }

  function renderDial() {
    const card = document.querySelector(CARD_SELECTOR);
    if (!card || card.dataset.premiumDialReady === 'true') return false;

    const valueNode = card.querySelector('[data-k100]');
    const deltaNode = card.querySelector('[data-change]');
    const labelNode = valueNode ? valueNode.nextElementSibling : null;
    const rawValue = plainText(valueNode);
    const numericValue = Number.parseFloat(rawValue);

    if (!valueNode || !Number.isFinite(numericValue)) return false;

    const dial = document.createElement('div');
    dial.className = 'premium-dial';
    dial.style.setProperty('--dial-value', String(Math.max(0, Math.min(100, numericValue))));
    dial.setAttribute('role', 'img');
    dial.setAttribute('aria-label', `Kidult 100 Index ${numericValue.toFixed(1)}`);

    const content = document.createElement('div');
    content.className = 'premium-dial__content';

    renderEditorialNumber(valueNode, numericValue);

    const label = document.createElement('span');
    label.className = 'premium-dial__label';
    label.textContent = labelNode ? plainText(labelNode) : 'Kidult 100 Index';

    const delta = document.createElement('span');
    delta.className = 'premium-dial__delta';
    delta.textContent = deltaNode ? plainText(deltaNode) : '';

    content.append(valueNode, label, delta);
    dial.appendChild(content);

    if (labelNode) labelNode.remove();
    if (deltaNode) deltaNode.remove();

    const eyebrow = card.querySelector('.eyebrow');
    if (eyebrow) eyebrow.insertAdjacentElement('afterend', dial);
    else card.prepend(dial);

    card.classList.add('premium-dial-card');
    card.dataset.premiumDialReady = 'true';
    document.documentElement.dataset.heroMetricSystem = 'premium-dial-b35-editorial';

    ensureFinalHeroStyles();
    return true;
  }

  function start() {
    if (renderDial()) return;
    const observer = new MutationObserver(() => {
      if (renderDial()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setTimeout(() => observer.disconnect(), 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
