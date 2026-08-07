(() => {
  const CARD_SELECTOR = '.hero aside';

  function plainText(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function ensureFinalHeroStyles() {
    let stylesheet = document.querySelector('link[data-b58-hero-index-final-polish-runtime]');
    if (!stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.dataset.b58HeroIndexFinalPolishRuntime = 'true';
      document.head.appendChild(stylesheet);
    }
    stylesheet.href = 'b58-hero-index-final-polish.css?v=8';
  }

  function renderEditorialNumber(node, value) {
    if (!node || !Number.isFinite(value)) return;
    const formatted = Number(value).toFixed(1);
    node.className = 'premium-dial__value premium-dial__value--editorial';
    node.setAttribute('aria-label', formatted);
    node.textContent = formatted;
    node.removeAttribute('style');
  }

  function upgradeExistingDial(card) {
    const valueNode = card.querySelector('.premium-dial__value, [data-k100]');
    const numericValue = Number.parseFloat(plainText(valueNode));
    if (!valueNode || !Number.isFinite(numericValue)) return false;

    renderEditorialNumber(valueNode, numericValue);
    card.querySelectorAll('.premium-dial__seal').forEach((node) => node.remove());
    card.dataset.premiumDialReady = 'true';
    document.documentElement.dataset.heroMetricSystem = 'premium-dial-category-numeral-v8';
    ensureFinalHeroStyles();
    return true;
  }

  function renderDial() {
    const card = document.querySelector(CARD_SELECTOR);
    if (!card) return false;

    if (card.dataset.premiumDialReady === 'true' || card.querySelector('.premium-dial')) {
      return upgradeExistingDial(card);
    }

    const valueNode = card.querySelector('[data-k100]');
    const deltaNode = card.querySelector('[data-change]');
    const labelNode = valueNode ? valueNode.nextElementSibling : null;
    const numericValue = Number.parseFloat(plainText(valueNode));

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
    document.documentElement.dataset.heroMetricSystem = 'premium-dial-category-numeral-v8';
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