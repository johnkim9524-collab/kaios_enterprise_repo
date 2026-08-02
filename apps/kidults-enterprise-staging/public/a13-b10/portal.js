(() => {
  const qs = selector => document.querySelector(selector);
  const qsa = selector => [...document.querySelectorAll(selector)];

  const categories = {
    all: { title: 'Kidult 100', value: '94.8', delta: '+2.1%', interpretation: 'Liquidity expansion is broadening across culturally durable categories.' },
    character: { title: 'Character Goods', value: '89.9', delta: '+4.8%', interpretation: 'Licensed character ecosystems are converting cultural memory into repeat transaction depth.' },
    cards: { title: 'Trading Cards', value: '81.7', delta: '+1.9%', interpretation: 'Premium-end liquidity is strengthening while mid-market concentration remains the primary risk.' },
    art: { title: 'Art Toys', value: '76.3', delta: '+1.2%', interpretation: 'Cross-border demand and recurring releases support durable but narrower momentum.' }
  };

  const evidence = {
    character: {
      title: 'Character Goods liquidity expansion',
      metrics: [['Verified transactions','6,198'],['Observed listings','18,420'],['Median spread','−7.4%'],['Confidence','91% / A']],
      notes: ['Transaction depth expanded across Japan, Korea, Singapore and the United States.','Repeat-buyer participation increased for the third consecutive cycle.','No single brand explains more than 18% of the aggregate move.','Primary risk: licensing-driven supply acceleration during Q4.']
    },
    cards: {
      title: 'Trading Cards concentration risk',
      metrics: [['Top-decile share','42.6%'],['Velocity','+2.1'],['Confidence','84% / B+'],['Watch condition','Spread > 11%']],
      notes: ['Liquidity is improving at the premium end but remains uneven below the top decile.','Three franchise clusters account for most verified value expansion.','Evidence quality is high, but breadth is weaker than the headline move.','Primary action: monitor dispersion before increasing conviction.']
    },
    art: {
      title: 'Art Toy cross-border acceleration',
      metrics: [['Markets expanding','5'],['Velocity','+1.9'],['Confidence','82% / B+'],['Evidence','5,914']],
      notes: ['Demand growth is most visible in Singapore, Seoul and Los Angeles.','Recurring editions are outperforming one-off scarcity events.','Cultural durability is improving faster than short-term price momentum.','Primary risk: narrow creator concentration.']
    }
  };

  const setActive = (buttons, active) => buttons.forEach(button => button.classList.toggle('active', button === active));

  qsa('[data-category]').forEach(button => button.addEventListener('click', () => {
    setActive(qsa('[data-category]'), button);
    const data = categories[button.dataset.category];
    if (!data) return;
    qs('[data-index-title]').textContent = data.title;
    qs('[data-index-value]').textContent = data.value;
    qs('[data-index-delta]').textContent = data.delta;
    qs('[data-interpretation]').textContent = data.interpretation;
  }));

  qsa('[data-horizon]').forEach(button => button.addEventListener('click', () => {
    setActive(qsa('[data-horizon]'), button);
    qs('[data-horizon-label]').textContent = button.dataset.horizon;
  }));

  qsa('[data-signal]').forEach(button => button.addEventListener('click', () => {
    setActive(qsa('[data-signal]'), button);
    const data = evidence[button.dataset.signal];
    if (!data) return;
    qs('[data-evidence-title]').textContent = data.title;
    qs('[data-evidence-body]').innerHTML = `<div class="evidence-grid">${data.metrics.map(([label,value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><div class="evidence-notes">${data.notes.map(note => `<p>${note}</p>`).join('')}</div>`;
  }));

  const syncDesktopPanelWidths = () => {
    const desktop = window.innerWidth >= 1201;
    const targetWidth = `${Math.min(1412, Math.max(0, window.innerWidth - 68))}px`;

    ['#signals', '#research'].forEach(selector => {
      const element = qs(selector);
      if (!element) return;

      if (desktop) {
        element.style.setProperty('width', targetWidth, 'important');
        element.style.setProperty('max-width', targetWidth, 'important');
        element.style.setProperty('margin-left', 'auto', 'important');
        element.style.setProperty('margin-right', 'auto', 'important');
        element.style.setProperty('box-sizing', 'border-box', 'important');
      } else {
        element.style.removeProperty('width');
        element.style.removeProperty('max-width');
        element.style.removeProperty('margin-left');
        element.style.removeProperty('margin-right');
        element.style.removeProperty('box-sizing');
      }
    });
  };

  const navLinks = qsa('.main-nav a');
  const sections = navLinks
    .map(link => ({ link, section: qs(link.getAttribute('href')) }))
    .filter(item => item.section);

  const setActiveNav = id => {
    navLinks.forEach(link => {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };

  navLinks.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const target = qs(link.getAttribute('href'));
    if (!target) return;
    setActiveNav(target.id);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  let ticking = false;
  const syncNavigation = () => {
    const headerOffset = 110;
    const marker = window.scrollY + headerOffset;
    let activeId = sections[0]?.section.id;

    for (const { section } of sections) {
      if (section.offsetTop <= marker) activeId = section.id;
      else break;
    }

    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
    if (nearBottom && sections.length) activeId = sections[sections.length - 1].section.id;

    if (activeId) setActiveNav(activeId);
    ticking = false;
  };

  const requestNavigationSync = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(syncNavigation);
  };

  window.addEventListener('scroll', requestNavigationSync, { passive: true });
  window.addEventListener('resize', () => {
    syncDesktopPanelWidths();
    requestNavigationSync();
  });
  window.addEventListener('load', () => {
    syncDesktopPanelWidths();
    requestNavigationSync();
  });

  syncDesktopPanelWidths();
  requestNavigationSync();
})();