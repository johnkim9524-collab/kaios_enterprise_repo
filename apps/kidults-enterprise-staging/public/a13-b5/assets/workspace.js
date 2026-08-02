(() => {
  const fullWidthStylesheet = document.createElement('link');
  fullWidthStylesheet.rel = 'stylesheet';
  fullWidthStylesheet.href = '/a13-b5/assets/full-width.css';
  document.head.appendChild(fullWidthStylesheet);

  const horizonButtons = [...document.querySelectorAll('[data-horizon]')];
  const categoryButtons = [...document.querySelectorAll('[data-category]')];
  const signalRows = [...document.querySelectorAll('[data-signal]')];
  const value = document.querySelector('[data-index-value]');
  const delta = document.querySelector('[data-index-delta]');
  const title = document.querySelector('[data-canvas-title]');
  const interpretation = document.querySelector('[data-interpretation-title]');
  const evidenceTitle = document.querySelector('[data-evidence-title]');
  const evidenceBody = document.querySelector('[data-evidence-body]');
  const cycle = document.querySelector('[data-cycle]');

  const workspace = document.querySelector('.workspace');
  const main = document.querySelector('.main');
  const lower = document.querySelector('.lower');
  const watchlist = document.querySelector('.rightbar');

  if (workspace && main && lower && watchlist) {
    watchlist.classList.add('watchlist-inline');
    lower.insertAdjacentElement('afterend', watchlist);

    const layoutStyle = document.createElement('style');
    layoutStyle.textContent = `
      .workspace{grid-template-columns:220px minmax(0,1fr)}
      .rail{grid-column:1;grid-row:1}
      .main{grid-column:2;grid-row:1}
      .watchlist-inline{
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:0;
        margin-top:18px;
        padding:18px;
        border:1px solid var(--line);
        background:var(--paper);
      }
      .watchlist-inline>.eyebrow,
      .watchlist-inline>h3{grid-column:1/-1}
      .watchlist-inline>h3{margin:2px 0 16px;font-size:27px}
      .watchlist-inline .watch{
        padding:14px 16px;
        border-top:1px solid var(--line);
        border-left:1px solid var(--line);
      }
      .watchlist-inline .watch:first-of-type{border-top:1px solid var(--ink);border-left:0}
      .watchlist-inline .watch:nth-of-type(2),
      .watchlist-inline .watch:nth-of-type(3),
      .watchlist-inline .watch:nth-of-type(4){border-top:1px solid var(--ink)}
      @media(max-width:1100px){
        .watchlist-inline{grid-template-columns:repeat(2,minmax(0,1fr))}
        .watchlist-inline .watch:nth-of-type(3){border-left:0}
      }
      @media(max-width:820px){
        .workspace{display:block}
        .watchlist-inline{grid-template-columns:1fr;margin-top:14px;padding:14px}
        .watchlist-inline .watch{border-left:0}
      }
    `;
    document.head.appendChild(layoutStyle);
  }

  const datasets = {
    all: { label: 'Kidult 100', value: '94.8', delta: '+2.1', interpretation: 'Liquidity expansion is broadening across culturally durable categories.' },
    characters: { label: 'Character Goods', value: '89.9', delta: '+4.8', interpretation: 'Licensed character ecosystems are converting cultural memory into repeat transaction depth.' },
    cards: { label: 'Trading Cards', value: '81.7', delta: '+1.9', interpretation: 'Top-end liquidity is strengthening while mid-market concentration remains the primary risk.' },
    art: { label: 'Art Toys', value: '76.3', delta: '+1.2', interpretation: 'Cross-border demand and recurring drops support durable but narrower momentum.' }
  };

  const evidence = {
    character: {
      title: 'Character Goods liquidity expansion',
      items: [['Verified transactions','6,198'],['Observed listings','18,420'],['Median spread','−7.4%'],['Confidence','91% / A']],
      notes: ['Transaction depth expanded across Japan, Korea, Singapore and the United States.','Repeat-buyer participation increased for the third consecutive cycle.','No single brand explains more than 18% of the aggregate move.','Primary risk: licensing-driven supply acceleration during Q4.']
    },
    cards: {
      title: 'Trading Cards concentration risk',
      items: [['Top-decile share','42.6%'],['Velocity','+2.1'],['Confidence','84% / B+'],['Watch condition','Spread > 11%']],
      notes: ['Liquidity is improving at the premium end but remains uneven below the top decile.','Three franchise clusters account for most verified value expansion.','Evidence quality is high, but breadth is weaker than the headline index move.','Primary action: monitor dispersion before increasing conviction.']
    },
    art: {
      title: 'Art Toy cross-border acceleration',
      items: [['Markets expanding','5'],['Velocity','+1.9'],['Confidence','82% / B+'],['Evidence','5,914']],
      notes: ['Demand growth is most visible in Singapore, Seoul and Los Angeles.','Recurring editions are outperforming one-off scarcity events.','Cultural durability is improving faster than short-term price momentum.','Primary risk: narrow creator concentration.']
    }
  };

  const setActive = (buttons, active) => buttons.forEach(button => button.classList.toggle('active', button === active));

  horizonButtons.forEach(button => button.addEventListener('click', () => {
    setActive(horizonButtons, button);
    document.querySelector('[data-horizon-label]').textContent = button.dataset.horizon;
  }));

  categoryButtons.forEach(button => button.addEventListener('click', () => {
    setActive(categoryButtons, button);
    const data = datasets[button.dataset.category];
    title.textContent = data.label;
    value.textContent = data.value;
    delta.textContent = `${data.delta}%`;
    interpretation.textContent = data.interpretation;
  }));

  signalRows.forEach(row => row.addEventListener('click', () => {
    signalRows.forEach(item => item.classList.remove('active'));
    row.classList.add('active');
    const data = evidence[row.dataset.signal];
    evidenceTitle.textContent = data.title;
    evidenceBody.innerHTML = `<div class="evidence-grid">${data.items.map(([label,metric]) => `<div class="evidence-item"><small>${label}</small><strong>${metric}</strong></div>`).join('')}</div><div class="evidence-list">${data.notes.map(note => `<div>${note}</div>`).join('')}</div>`;
  }));

  let seconds = 42;
  setInterval(() => {
    seconds += 1;
    if (seconds > 59) seconds = 1;
    if (cycle) cycle.textContent = `${seconds}s ago`;
  }, 1000);
})();
