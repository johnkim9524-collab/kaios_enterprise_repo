(() => {
  for (const href of ['/a13-b5/assets/full-width.css','/a13-b5/assets/data-luxury.css','/a13-b5/assets/compact-command.css']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

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
  const rail = document.querySelector('.rail');
  const command = document.querySelector('.command');

  if (workspace && main && lower && watchlist) {
    watchlist.classList.add('watchlist-inline');
    lower.insertAdjacentElement('afterend', watchlist);
    const layoutStyle = document.createElement('style');
    layoutStyle.textContent = `
      .workspace{grid-template-columns:minmax(0,1fr)}
      .main{grid-column:1;grid-row:1}
      .watchlist-inline{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:0}
      .watchlist-inline>.eyebrow,.watchlist-inline>h3{grid-column:1/-1}
      .watchlist-inline .watch{border-top:1px solid var(--ink);border-left:1px solid var(--line)}
      .watchlist-inline .watch:first-of-type{border-left:0}
      @media(max-width:1100px){.watchlist-inline{grid-template-columns:repeat(2,minmax(0,1fr))}.watchlist-inline .watch:nth-of-type(3){border-left:0}}
      @media(max-width:820px){.workspace{display:block}.watchlist-inline{grid-template-columns:1fr}.watchlist-inline .watch{border-left:0}}
    `;
    document.head.appendChild(layoutStyle);
  }

  if (main && command && rail) {
    const workspaceButtons = [...rail.querySelectorAll('.rail-section:first-of-type button')];
    const systemMeta = [...rail.querySelectorAll('.system-meta span')].map(item => item.textContent.trim());
    const strip = document.createElement('section');
    strip.className = 'command-strip';
    strip.setAttribute('aria-label', 'Workspace and system status');
    strip.innerHTML = `
      <div class="command-strip__nav">
        <span>Workspace</span>
        ${workspaceButtons.map((button,index) => `<button${index===0?' class="active"':''}>${button.textContent.trim()}</button>`).join('')}
      </div>
      <div class="command-strip__status">
        <span class="online"><strong>System online</strong></span>
        <span>Model <strong>KAIOS / K100 v2.4</strong></span>
        <span>Pipeline <strong>12 markets · 247 sources</strong></span>
        <span>Next cycle <strong>21:15 KST</strong></span>
      </div>`;
    command.insertAdjacentElement('afterend', strip);
    strip.querySelectorAll('.command-strip__nav button').forEach(button => button.addEventListener('click', () => {
      strip.querySelectorAll('.command-strip__nav button').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
    }));
    rail.remove();
  }

  const commandEyebrow = document.querySelector('.command .eyebrow');
  if (commandEyebrow) {
    const badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.textContent = 'Staging · illustrative data';
    commandEyebrow.insertAdjacentElement('afterend', badge);
  }

  const chartSvg = document.querySelector('.chart svg');
  if (chartSvg && !chartSvg.querySelector('.axis-line')) {
    chartSvg.insertAdjacentHTML('beforeend', `
      <line class="axis-line" x1="0" y1="275" x2="900" y2="275"/>
      <line class="axis-line" x1="0" y1="30" x2="0" y2="275"/>
      <line class="axis-tick" x1="0" y1="275" x2="0" y2="281"/>
      <line class="axis-tick" x1="225" y1="275" x2="225" y2="281"/>
      <line class="axis-tick" x1="450" y1="275" x2="450" y2="281"/>
      <line class="axis-tick" x1="675" y1="275" x2="675" y2="281"/>
      <line class="axis-tick" x1="900" y1="275" x2="900" y2="281"/>
      <text class="axis-label" x="0" y="296">Feb</text>
      <text class="axis-label" x="215" y="296">Mar</text>
      <text class="axis-label" x="440" y="296">May</text>
      <text class="axis-label" x="665" y="296">Jun</text>
      <text class="axis-label" x="874" y="296">Aug</text>
      <line class="axis-tick" x1="-6" y1="260" x2="0" y2="260"/>
      <line class="axis-tick" x1="-6" y1="190" x2="0" y2="190"/>
      <line class="axis-tick" x1="-6" y1="120" x2="0" y2="120"/>
      <line class="axis-tick" x1="-6" y1="50" x2="0" y2="50"/>
      <text class="axis-label" x="-38" y="264">70</text>
      <text class="axis-label" x="-38" y="194">80</text>
      <text class="axis-label" x="-38" y="124">90</text>
      <text class="axis-label" x="-44" y="54">100</text>
      <text class="axis-title" x="-42" y="18">INDEX</text>
      <text class="axis-title" x="825" y="296">2026</text>
    `);
  }

  document.querySelectorAll('.watch').forEach(watch => {
    if (!watch.querySelector('.spark-meta')) {
      const meta = document.createElement('div');
      meta.className = 'spark-meta';
      meta.textContent = '30D normalized trend';
      watch.appendChild(meta);
    }
  });

  const datasets = {
    all: { label: 'Kidult 100', value: '94.8', delta: '+2.1', interpretation: 'Liquidity expansion is broadening across culturally durable categories.' },
    characters: { label: 'Character Goods', value: '89.9', delta: '+4.8', interpretation: 'Licensed character ecosystems are converting cultural memory into repeat transaction depth.' },
    cards: { label: 'Trading Cards', value: '81.7', delta: '+1.9', interpretation: 'Top-end liquidity is strengthening while mid-market concentration remains the primary risk.' },
    art: { label: 'Art Toys', value: '76.3', delta: '+1.2', interpretation: 'Cross-border demand and recurring drops support durable but narrower momentum.' }
  };

  const evidence = {
    character: {title:'Character Goods liquidity expansion',items:[['Verified transactions','6,198'],['Observed listings','18,420'],['Median spread','−7.4%'],['Confidence','91% / A']],notes:['Transaction depth expanded across Japan, Korea, Singapore and the United States.','Repeat-buyer participation increased for the third consecutive cycle.','No single brand explains more than 18% of the aggregate move.','Primary risk: licensing-driven supply acceleration during Q4.']},
    cards: {title:'Trading Cards concentration risk',items:[['Top-decile share','42.6%'],['Velocity','+2.1'],['Confidence','84% / B+'],['Watch condition','Spread > 11%']],notes:['Liquidity is improving at the premium end but remains uneven below the top decile.','Three franchise clusters account for most verified value expansion.','Evidence quality is high, but breadth is weaker than the headline index move.','Primary action: monitor dispersion before increasing conviction.']},
    art: {title:'Art Toy cross-border acceleration',items:[['Markets expanding','5'],['Velocity','+1.9'],['Confidence','82% / B+'],['Evidence','5,914']],notes:['Demand growth is most visible in Singapore, Seoul and Los Angeles.','Recurring editions are outperforming one-off scarcity events.','Cultural durability is improving faster than short-term price momentum.','Primary risk: narrow creator concentration.']}
  };

  const setActive = (buttons, active) => buttons.forEach(button => button.classList.toggle('active', button === active));

  horizonButtons.forEach(button => button.addEventListener('click', () => {
    setActive(horizonButtons, button);
    const label = document.querySelector('[data-horizon-label]');
    if (label) label.textContent = button.dataset.horizon;
  }));

  categoryButtons.forEach(button => button.addEventListener('click', () => {
    setActive(categoryButtons, button);
    const data = datasets[button.dataset.category];
    if (!data) return;
    title.textContent = data.label;
    value.textContent = data.value;
    delta.textContent = `${data.delta}%`;
    interpretation.textContent = data.interpretation;
  }));

  signalRows.forEach(row => row.addEventListener('click', () => {
    signalRows.forEach(item => item.classList.remove('active'));
    row.classList.add('active');
    const data = evidence[row.dataset.signal];
    if (!data) return;
    evidenceTitle.textContent = data.title;
    evidenceBody.innerHTML = `<div class="evidence-grid">${data.items.map(([label,metric]) => `<div class="evidence-item"><small>${label}</small><strong>${metric}</strong></div>`).join('')}</div><div class="evidence-list">${data.notes.map(note => `<div>${note}</div>`).join('')}</div>`;
  }));

  let seconds = 42;
  setInterval(() => {
    seconds = seconds >= 59 ? 1 : seconds + 1;
    if (cycle) cycle.textContent = `${seconds}s ago`;
  }, 1000);
})();
