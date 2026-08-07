(() => {
  const CARD_SELECTOR = '.hero aside';

  function plainText(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
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

    valueNode.className = 'premium-dial__value';
    valueNode.textContent = numericValue.toFixed(1);
    valueNode.removeAttribute('style');

    // Match the editorial numeral language used by the Core KPI rail.
    // Do not use inline !important sizing here; the final B58 layer owns the visual lock.
    valueNode.style.fontFamily = "Georgia, 'Times New Roman', serif";
    valueNode.style.fontWeight = '400';
    valueNode.style.fontStyle = 'normal';
    valueNode.style.fontVariantNumeric = 'lining-nums proportional-nums';

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
    document.documentElement.dataset.heroMetricSystem = 'premium-dial-b35';
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
