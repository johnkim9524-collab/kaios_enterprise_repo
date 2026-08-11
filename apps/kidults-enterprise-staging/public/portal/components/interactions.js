export function setupNavigation() {
  const button = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("#primary-nav");

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    nav.classList.toggle("is-open", !open);
    document.body.classList.toggle("menu-open", !open);
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      button.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      document.body.classList.remove("menu-open");
    });
  });
}

export function setupDialogs(data) {
  const dialog = document.querySelector("#portal-dialog");
  const eyebrow = dialog.querySelector("[data-dialog-eyebrow]");
  const title = dialog.querySelector("[data-dialog-title]");
  const body = dialog.querySelector("[data-dialog-body]");

  const open = item => {
    if (!item) return;
    eyebrow.textContent = item.eyebrow;
    title.textContent = item.title;
    body.textContent = item.body;
    dialog.showModal();
  };

  document.addEventListener("click", event => {
    const fixed = event.target.closest("[data-dialog]");
    if (fixed) {
      open(data.provenance[fixed.dataset.dialog]);
      return;
    }

    const objectButton = event.target.closest("[data-object]");
    if (objectButton) {
      const object = data.k100.items.find(item => item.id === objectButton.dataset.object);
      if (object) {
        open({
          eyebrow: `${object.category} PROVENANCE`,
          title: object.title,
          body: `${object.provenance} Current public status: ${object.status}.`
        });
      }
    }
  });

  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
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
