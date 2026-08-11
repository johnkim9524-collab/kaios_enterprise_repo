"use strict";
(() => {
  const heroAsset = "assets/hero-canvas-v228.webp?v=228";
  const approvedFigures = [
    "assets/k100-mobility-v228.webp?v=228",
    "assets/k100-time-v228.webp?v=228",
    "assets/k100-footwear-v228.webp?v=228",
    "assets/k100-character-v228.webp?v=228",
    "assets/k100-design-v228.webp?v=228"
  ];

  const applyHero = () => {
    const hero = document.querySelector(".hero-asset");
    if (!hero) return false;
    hero.src = heroAsset;
    hero.loading = "eager";
    hero.decoding = "sync";
    return true;
  };

  const applyFigures = () => {
    const cards = [...document.querySelectorAll(".rank-card")];
    if (cards.length < approvedFigures.length) return false;
    cards.slice(0, approvedFigures.length).forEach((card, index) => {
      const image = card.querySelector("img");
      if (!image) return;
      image.src = approvedFigures[index];
      image.loading = "eager";
      image.decoding = "sync";
      image.style.display = "block";
      image.style.visibility = "visible";
      image.style.opacity = "1";
    });
    return true;
  };

  document.addEventListener("DOMContentLoaded", () => {
    applyHero();
    if (applyFigures()) return;
    const target = document.querySelector("[data-k100-cards]");
    if (!target) return;
    const observer = new MutationObserver(() => {
      if (applyFigures()) observer.disconnect();
    });
    observer.observe(target, { childList: true, subtree: true });
  });
})();
