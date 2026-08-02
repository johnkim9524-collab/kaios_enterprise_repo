(() => {
  const base='/a13-b3';
  const page=document.body.dataset.page||'overview';
  const primary=[['markets','Markets'],['kidult-100','Kidult 100'],['research','Research'],['canon','Canon'],['enterprise','Enterprise']];
  const nav=primary.map(([slug,label])=>`<a href="${base}/${slug}/index.html"${page===slug?' aria-current="page"':''}>${label}</a>`).join('');
  const header=document.querySelector('[data-global-header]');
  if(header) header.innerHTML=`<header class="masthead"><div class="shell masthead-inner"><a class="brand" href="${base}/index.html">KIDULTS</a><nav class="primary" aria-label="Primary">${nav}</nav><nav class="utility" aria-label="Utility"><a href="#" data-search-open>Search</a><a href="${base}/methodology/index.html">Methodology</a><a class="access" href="${base}/enterprise/index.html">Enterprise</a></nav></div></header><div class="search-panel" data-search-panel><div class="shell"><input aria-label="Search Kidults intelligence" placeholder="Search markets, brands, research and canon"></div></div>`;
  const footer=document.querySelector('[data-global-footer]');
  if(footer) footer.innerHTML=`<footer class="footer"><div class="shell footer-grid"><div><a class="brand" href="${base}/index.html">KIDULTS</a><p class="statement">The intelligence layer for global collectible markets.</p></div><div><h4>Explore</h4><a href="${base}/markets/index.html">Markets</a><a href="${base}/kidult-100/index.html">Kidult 100</a><a href="${base}/research/index.html">Research</a><a href="${base}/canon/index.html">Canon</a></div><div><h4>Institution</h4><a href="${base}/methodology/index.html">Methodology</a><a href="${base}/archive/index.html">Archive</a><a href="${base}/status/index.html">Status</a><a href="${base}/about/index.html">About</a></div></div></footer>`;
  const open=document.querySelector('[data-search-open]');
  const panel=document.querySelector('[data-search-panel]');
  open?.addEventListener('click',e=>{e.preventDefault();panel?.classList.toggle('open');panel?.querySelector('input')?.focus();});
})();