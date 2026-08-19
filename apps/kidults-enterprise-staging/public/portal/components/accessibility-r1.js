const STYLE_ID = "kidults-accessibility-r1";

export function startAccessibilityR1() {
  if (!document.getElementById(STYLE_ID)) {
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "components/accessibility-r1.css?v=1";
    document.head.append(link);
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
