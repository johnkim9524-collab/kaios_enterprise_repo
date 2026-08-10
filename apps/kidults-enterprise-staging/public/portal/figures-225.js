"use strict";
(() => {
  const approved = [
    "../a13/assets/k100-mobility-3d.svg?v=225",
    "../a13/assets/k100-time-3d.svg?v=225",
    "../a13/assets/k100-footwear-3d.svg?v=225",
    "../a13/assets/k100-character-3d.svg?v=225",
    "../a13/assets/k100-design-3d.svg?v=225"
  ];
  const apply = () => {
    const cards = [...document.querySelectorAll('.rank-card')];
    if (cards.length < 5) return false;
    cards.slice(0,5).forEach((card,i) => {
      const img = card.querySelector('img');
      if (!img) return;
      img.src = approved[i];
      img.loading = 'eager';
      img.decoding = 'sync';
      img.style.display = 'block';
      img.style.visibility = 'visible';
      img.style.opacity = '1';
    });
    return true;
  };
  const obs = new MutationObserver(() => { if (apply()) obs.disconnect(); });
  document.addEventListener('DOMContentLoaded', () => {
    if (!apply()) obs.observe(document.querySelector('[data-k100-cards]'), {childList:true,subtree:true});
  });
})();
