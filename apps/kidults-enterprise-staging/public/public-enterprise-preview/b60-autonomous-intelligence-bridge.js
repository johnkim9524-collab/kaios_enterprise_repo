(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const params = new URLSearchParams(window.location.search);
  const previewMode = params.get('data') === 'preview';
  const liveAssetPattern = /(?:^|\/)intelligence-data\.json(?:$|\?)/;
  const endpoint = window.KIDULTS_INTELLIGENCE_API || '/v1/intelligence/current';

  window.KIDULTS_AUTONOMOUS_BRIDGE = Object.freeze({
    enabled: !previewMode,
    endpoint,
    visualBaseline: 'KIDULTS Portal Visual Baseline v1.0',
    visualBaselineLocked: true
  });

  if (previewMode) return;

  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!liveAssetPattern.test(url)) return nativeFetch(input, init);

    const forwarded = typeof input === 'string'
      ? endpoint
      : new Request(endpoint, input);

    return nativeFetch(forwarded, {
      ...init,
      headers: new Headers({
        accept: 'application/json',
        ...(init?.headers || {})
      })
    });
  };
})();
