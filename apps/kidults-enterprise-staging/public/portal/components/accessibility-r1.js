const STYLE_ID = "kidults-accessibility-r1";

export function startAccessibilityR1() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      small[data-hero-status],
      .principles > span,
      .data-funnel-note,
      .footer-brand > span,
      .footer-inner > span,
      .workspace-page-context-copy > span {
        color: #545b56 !important;
      }
      .data-funnel__layer > span {
        color: #545b56 !important;
      }
    `;
    document.head.append(style);
  }

  const searchTrigger = document.querySelector(".search-trigger[data-search-open]");
  if (searchTrigger && !searchTrigger.getAttribute("aria-label")) {
    searchTrigger.setAttribute("aria-label", "Search KIDULTS intelligence");
  }

  const searchInput = document.querySelector("input[type=search][data-search-input]");
  if (searchInput && !searchInput.getAttribute("aria-label") && !searchInput.getAttribute("aria-labelledby")) {
    searchInput.setAttribute("aria-label", "Search KIDULTS intelligence");
  }

  document.documentElement.dataset.accessibilityEvidence = "r1";
}
