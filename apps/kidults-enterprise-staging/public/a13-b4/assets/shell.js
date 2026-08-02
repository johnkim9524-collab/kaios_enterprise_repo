(() => {
  const base = '/a13-b4';
  const page = document.body.dataset.page || 'overview';
  const navItems = [
    ['intelligence','Intelligence'],
    ['kidult-100','Kidult 100'],
    ['research','Research'],
    ['enterprise','Enterprise']
  ];
  const nav = navItems.map(([slug,label]) => `<a href="${slug==='intelligence'?base+'/index.html':base+'/'+slug+'/index.html'}"${page===slug||page==='overview'&&slug==='intelligence'?' aria-current="page"':''}>${label}</a>`).join('');
  document.querySelector('[data-global-header]')?.replaceChildren();
  const header = document.querySelector('[data-global-header]');
  if (header) header.innerHTML = `<header class="masthead"><div class="shell masthead-inner"><a class="brand" href="${base}/index.html">KIDULTS</a><nav class="primary" aria-label="Primary">${nav}</nav><nav class="utility" aria-label="Utility"><a href="#" data-search-open>Search</a><a href="${base}/enterprise/index.html">Sign in</a><a class="access" href="${base}/enterprise/index.html">Request Access</a></nav></div></header><div class="search-panel" data-search-panel><div class="shell"><input aria-label="Search Kidults intelligence" placeholder="Search markets, signals, brands, research and canon"></div></div>`;
  const footer = document.querySelector('[data-global-footer]');
  if (footer) footer.innerHTML = `<footer class="footer"><div class="shell footer-grid"><div><a class="brand" href="${base}/index.html">KIDULTS</a><p>The autonomous intelligence layer for global collectible markets.</p></div><div><h4>Platform</h4><a href="${base}/index.html">Intelligence</a><a href="${base}/kidult-100/index.html">Kidult 100</a><a href="${base}/research/index.html">Research</a></div><div><h4>Access</h4><a href="${base}/enterprise/index.html">Enterprise</a><a href="${base}/enterprise/index.html">Data access</a><a href="${base}/enterprise/index.html">Request access</a></div></div></footer>`;
  const open = document.querySelector('[data-search-open]');
  const panel = document.querySelector('[data-search-panel]');
  open?.addEventListener('click', e => { e.preventDefault(); panel?.classList.toggle('open'); panel?.querySelector('input')?.focus(); });
})();