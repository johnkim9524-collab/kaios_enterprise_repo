const baseSha = process.env.EXPECTED_BASE_SHA;
const headSha = process.env.EXPECTED_HEAD_SHA;

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {'content-type': 'application/json'},
});

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  const suffix = url.pathname.replace('/repos/johnkim9524-collab/kaios_enterprise_repo', '');
  if (options.method === 'POST' && suffix === `/statuses/${headSha}`) return json({state: 'failure'}, 201);
  if (suffix === '/pulls/2055') return json({
    state: 'open', draft: false, merged: false,
    head: {sha: headSha}, base: {ref: 'main', sha: baseSha},
  });
  if (suffix === '/branches/main') return json({commit: {sha: baseSha}});
  if (suffix === '/pulls/2055/files') return json([]);
  return json({message: 'unexpected fixture path'}, 404);
};
