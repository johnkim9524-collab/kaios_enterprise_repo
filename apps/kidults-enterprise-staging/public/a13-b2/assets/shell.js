(() => {
  const base = '/a13-b2';
  const page = document.body.dataset.page || 'overview';
  const primary = [
    ['markets','Markets'],['kidult-100','Kidult 100'],['research','Research'],['canon','Canon'],['enterprise','Enterprise']
  ];
  const nav = primary.map(([slug,label]) => `<a href="${base}/${slug}/index.html"${page===slug?' aria-current="page"':''}>${label}</a>`).join('');
  const header = document.querySelector('[data-global-header]');
  if (header) header.innerHTML = `<header class="masthead"><div class="shell masthead-inner"><a class="brand" href="${base}/index.html">KIDULTS</a><nav class="primary" aria-label="Primary">${nav}</nav><nav class="utility" aria-label="Utility"><a href="#" data-search-open>Search</a><a href="${base}/methodology/index.html">Methodology</a><a href="${base}/archive/index.html">Archive</a><a class="access" href="${base}/enterprise/index.html">Enterprise Access</a></nav></div></header><div class="search-panel" data-search-panel><div class="shell"><input aria-label="Search Kidults intelligence" placeholder="Search markets, brands, signals, research and canon"></div></div>`;
  const trust = document.querySelector('[data-global-trust]');
  if (trust) trust.innerHTML = `<section class="shell" style="padding:72px 0"><div class="trust-band"><div><small>Verified sources</small><strong>247 active</strong></div><div><small>Confidence engine</small><strong>84.6%</strong></div><div><small>Methodology</small><strong>Version 2.4</strong></div><div><small>Freshness</small><strong>Updated daily</strong></div><div><small>System status</small><strong>Operational</strong></div></div></section>`;
  const footer = document.querySelector('[data-global-footer]');
  if (footer) footer.innerHTML = `<footer class="footer"><div class="shell footer-grid"><div><a class="brand" href="${base}/index.html">KIDULTS</a><p class="statement">The intelligence layer for global collectible markets.</p></div><div><h4>Markets</h4><a href="${base}/markets/index.html">Overview</a><a href="${base}/markets/index.html#categories">Categories</a><a href="${base}/markets/index.html#signals">Signals</a></div><div><h4>Benchmark</h4><a href="${base}/kidult-100/index.html">Kidult 100</a><a href="${base}/kidult-100/index.html#ranking">Rankings</a><a href="${base}/methodology/index.html">Methodology</a></div><div><h4>Intelligence</h4><a href="${base}/research/index.html">Research</a><a href="${base}/canon/index.html">Canon</a><a href="${base}/archive/index.html">Archive</a></div><div><h4>Enterprise</h4><a href="${base}/enterprise/index.html">Platform</a><a href="${base}/enterprise/index.html">Data access</a><a href="${base}/enterprise/index.html">Request access</a></div><div><h4>Company</h4><a href="${base}/about/index.html">About</a><a href="${base}/status/index.html">Status</a></div></div></footer>`;
  const open = document.querySelector('[data-search-open]');
  const panel = document.querySelector('[data-search-panel]');
  open?.addEventListener('click', e => { e.preventDefault(); panel?.classList.toggle('open'); panel?.querySelector('input')?.focus(); });
})();