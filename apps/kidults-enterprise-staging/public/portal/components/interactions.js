const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

export function setupNavigation() {
  const button = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("#primary-nav");
  if (!button || !nav) return;

  const close = () => {
    button.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
    document.body.classList.remove("menu-open");
  };

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    nav.classList.toggle("is-open", !open);
    document.body.classList.toggle("menu-open", !open);
  });

  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", close));
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1020) close();
  }, { passive: true });
}

export function setupDialogs(data) {
  const dialog = document.querySelector("#portal-dialog");
  if (!dialog) return;

  const eyebrow = dialog.querySelector("[data-dialog-eyebrow]");
  const title = dialog.querySelector("[data-dialog-title]");
  const body = dialog.querySelector("[data-dialog-body]");

  const open = item => {
    if (!item) return;
    eyebrow.textContent = item.eyebrow || "KIDULTS INTELLIGENCE";
    title.textContent = item.title || "Details";

    if (Array.isArray(item.body)) {
      body.innerHTML = item.body.map(paragraph => `<p>${esc(paragraph)}</p>`).join("");
    } else {
      body.textContent = item.body || "";
    }
    dialog.showModal();
  };

  document.addEventListener("click", event => {
    const fixed = event.target.closest("[data-dialog]");
    if (fixed) {
      const key = fixed.dataset.dialog;
      if (key === "hero") {
        const hero = data.manifest.hero;
        open({
          eyebrow: `${hero.vertical_name} · ${hero.asset_status.replaceAll("_", " ")}`,
          title: hero.title,
          body: [
            hero.subtitle,
            `Source snapshot: ${data.manifest.snapshot_id}.`,
            "This is an original editorial visual used as a modular public-preview asset. The Featured Hero may change with a later approved snapshot."
          ]
        });
        return;
      }

      if (key === "registry") {
        open({
          eyebrow: "REGISTRY TRACEABILITY",
          title: "V502 data state",
          body: [
            `Baseline: ${data.registry.snapshot.baseline_id}.`,
            `Candidate: ${data.registry.snapshot.candidate_id ?? "WAITING"}.`,
            `Assessment: ${data.registry.assessment.current_id ?? data.registry.assessment.status}.`,
            `Methodology: ${data.registry.versions.methodology}.`
          ]
        });
        return;
      }

      open(data.provenance[key]);
    }
  });

  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
}

export function setupVerticalFilter() {
  const buttons = [...document.querySelectorAll("[data-vertical-filter]")];
  const cards = [...document.querySelectorAll("[data-vertical-card]")];
  if (!buttons.length || !cards.length) return;

  const apply = mode => {
    buttons.forEach(button => {
      const active = button.dataset.verticalFilter === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    cards.forEach(card => {
      card.hidden = mode === "featured" && card.dataset.featured !== "true";
    });
  };

  buttons.forEach(button => button.addEventListener("click", () => apply(button.dataset.verticalFilter)));
}

function resultMarkup(record) {
  return `
    <a class="search-result" href="${esc(record.href)}">
      <span class="search-result-type">${esc(record.type)}</span>
      <div><h3>${esc(record.title)}</h3><p>${esc(record.description)}</p></div>
      <span aria-hidden="true">→</span>
    </a>
  `;
}

export function setupSearch(searchIndex) {
  const dialog = document.querySelector("#search-dialog");
  const openButton = document.querySelector("[data-search-open]");
  const closeButton = dialog?.querySelector("[data-search-close]");
  const input = dialog?.querySelector("[data-search-input]");
  const results = dialog?.querySelector("[data-search-results]");
  const meta = dialog?.querySelector("[data-search-meta]");
  if (!dialog || !openButton || !input || !results || !meta) return;

  const render = rawQuery => {
    const query = rawQuery.trim().toLocaleLowerCase();
    const matches = query
      ? searchIndex
        .map(record => ({
          record,
          score: record.title.toLocaleLowerCase().startsWith(query) ? 3
            : record.title.toLocaleLowerCase().includes(query) ? 2
            : record.searchText.includes(query) ? 1
            : 0
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
        .slice(0, 12)
        .map(item => item.record)
      : searchIndex.slice(0, 8);

    meta.textContent = query
      ? `${matches.length} result${matches.length === 1 ? "" : "s"} for “${rawQuery.trim()}”.`
      : "Search across 8 verticals, featured objects, research and archive.";

    results.innerHTML = matches.length
      ? matches.map(resultMarkup).join("")
      : '<div class="search-empty">No matching public-preview intelligence was found.</div>';
  };

  const open = () => {
    render("");
    dialog.showModal();
    window.setTimeout(() => input.focus(), 50);
  };
  const close = () => dialog.close();

  openButton.addEventListener("click", open);
  closeButton?.addEventListener("click", close);
  input.addEventListener("input", () => render(input.value));
  results.addEventListener("click", event => {
    if (event.target.closest("a")) close();
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !dialog.open && !/input|textarea|select/i.test(document.activeElement?.tagName || "")) {
      event.preventDefault();
      open();
    }
    if (event.key === "Escape" && dialog.open) close();
  });
}

export function setupReveal() {
  const elements = [...document.querySelectorAll(".reveal")];
  if (!("IntersectionObserver" in window)) {
    elements.forEach(element => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: .07 });

  elements.forEach(element => observer.observe(element));
}

export function setupStatusDetails() {
  document.querySelector("[data-registry-ribbon]")?.addEventListener("click", event => {
    const item = event.target.closest(".registry-status-item");
    if (!item) return;
    document.querySelector("[data-dialog=registry]")?.click();
  });
}
