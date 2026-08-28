import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const APP_ROOT = 'apps/kidults-mobile-portal';
const PUBLIC_ROOT = `${APP_ROOT}/public`;
const PROJECT = 'kidults-mobile-portal-staging';
const ALLOWED_FILES = Object.freeze([
  'functions/api/mobile/v1/projection.js',
  'public/_headers',
  'public/_redirects',
  'public/mobile/data/no-projection.json',
  'public/mobile/index.html',
  'public/mobile/mobile.css',
  'public/mobile/mobile.js',
  'public/mobile/projection-client.js',
]);
const FORBIDDEN_APP_PATTERNS = Object.freeze([
  /(?:^|\/)workspace(?:\.|\/|$)/i,
  /portal-r001/i,
  /kidults-workspace-staging/i,
  /kidults-enterprise-staging/i,
  /public\/portal/i,
]);

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function walk(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`MOBILE_ARTIFACT_SYMLINK_FORBIDDEN:${absolute}`);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(path.relative(APP_ROOT, absolute).replaceAll(path.sep, '/'));
    else throw new Error(`MOBILE_ARTIFACT_SPECIAL_FILE_FORBIDDEN:${absolute}`);
  }
  return files;
}

function parseRedirects(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

function parseHeaderRules(text) {
  const rules = new Map();
  let active = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      active = line.trim();
      rules.set(active, new Map());
      continue;
    }
    const separator = line.indexOf(':');
    if (active && separator > 0) rules.get(active).set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  return rules;
}

function assertArtifactPurity(files, contents) {
  assert.deepEqual([...files].sort(), [...ALLOWED_FILES].sort(), 'MOBILE_ARTIFACT_EXACT_ALLOWLIST_MISMATCH');
  for (const file of files) {
    for (const pattern of FORBIDDEN_APP_PATTERNS) {
      assert.equal(pattern.test(file), false, `MOBILE_ARTIFACT_FORBIDDEN_PATH:${file}`);
    }
  }
  const joined = files.map(file => `${file}\n${contents[file] || ''}`).join('\n');
  assert.equal(/\/workspace(?:\b|\/)|workspace\.html|portal-r001|kidults-workspace-staging|kidults-enterprise-staging/i.test(joined), false, 'MOBILE_ARTIFACT_CROSS_PRODUCT_REFERENCE');
}

function validateRoutes(text) {
  assert.deepEqual(parseRedirects(text), [
    '/ /mobile/index.html 200',
    '/mobile /mobile/index.html 200',
    '/mobile/ /mobile/index.html 200',
  ], 'MOBILE_ROUTES_NOT_EXACT');
}

function validateSurface(contents) {
  const html = contents['public/mobile/index.html'];
  const runtime = contents['public/mobile/mobile.js'];
  const client = contents['public/mobile/projection-client.js'];
  const headers = contents['public/_headers'];
  const api = contents['functions/api/mobile/v1/projection.js'];
  const control = JSON.parse(contents['public/mobile/data/no-projection.json']);
  const strictMobileCsp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const headerRules = parseHeaderRules(headers);
  const hrefs = [...html.matchAll(/\bhref="([^"]+)"/g)].map(match => match[1]);
  const navigationHrefs = hrefs.filter(href => !href.endsWith('.css'));
  assert(navigationHrefs.length > 0, 'MOBILE_NAVIGATION_EMPTY');
  assert(navigationHrefs.every(href => href.startsWith('#')), 'MOBILE_NAVIGATION_MUST_BE_HASH_ONLY');
  assert.deepEqual(hrefs.filter(href => href.endsWith('.css')), ['/mobile/mobile.css'], 'MOBILE_STYLESHEET_NOT_EXACT');
  assert.deepEqual([...html.matchAll(/\bsrc="([^"]+)"/g)].map(match => match[1]), ['/mobile/mobile.js'], 'MOBILE_SCRIPT_NOT_EXACT');
  assert.equal(/<style\b|\bstyle\s*=/i.test(html), false, 'MOBILE_INLINE_STYLE_FORBIDDEN');
  assert.equal(/\.style(?:\.|\[)|setAttribute\(\s*['"]style|createElement\(\s*['"]style/i.test(`${runtime}\n${client}`), false, 'MOBILE_RUNTIME_INLINE_STYLE_MUTATION_FORBIDDEN');
  assert.match(runtime, /from '\/mobile\/projection-client\.js'/, 'MOBILE_CLIENT_IMPORT_NOT_EXACT');
  assert.match(runtime, /url: '\/api\/mobile\/v1\/projection'/, 'MOBILE_API_PATH_NOT_EXACT');
  assert.match(runtime, /controlUrl: '\/mobile\/data\/no-projection\.json'/, 'MOBILE_CONTROL_PATH_NOT_EXACT');
  const networkSurface = `${runtime}\n${client.replaceAll('https://mobile.invalid/', '')}\n${html}`;
  assert.equal(/https?:\/\//.test(networkSurface), false, 'MOBILE_EXTERNAL_ORIGIN_FORBIDDEN');
  assert.match(client, /credentials: 'omit'/, 'MOBILE_CREDENTIALS_OMIT_REQUIRED');
  assert.match(client, /redirect: 'error'/, 'MOBILE_REDIRECT_ERROR_REQUIRED');
  assert.match(client, /mode: 'same-origin'/, 'MOBILE_SAME_ORIGIN_REQUIRED');
  assert.match(client, /browser_clock_authoritative: false/, 'MOBILE_BROWSER_CLOCK_NONAUTHORITY_REQUIRED');
  assert.match(client, /MOBILE_OWNED_DIGEST_BOUND_SAME_ORIGIN_ENVELOPE_ONLY/, 'MOBILE_OWNED_ENVELOPE_REQUIRED');
  assert.equal(/\bportal_view\b/.test(client), false, 'DESKTOP_SHAPED_PORTAL_VIEW_FORBIDDEN');
  assert.match(client, /candidate\?\.mobile_view/, 'MOBILE_VIEW_NAMESPACE_REQUIRED');
  assert.match(client, /render_scope === 'MOBILE_PORTAL'/, 'MOBILE_OWNED_RENDER_SCOPE_REQUIRED');
  assert.match(client, /MOBILE_PUBLIC_DISPLAY/, 'MOBILE_OWNED_DISPLAY_PURPOSE_REQUIRED');
  assert.match(client, /DOMAIN_SEPARATED_CANONICAL_SHA256/, 'MOBILE_PAYLOAD_DIGEST_BINDING_REQUIRED');
  assert.match(client, /AUTHORIZED_FOR_EXACT_PROJECTION/, 'MOBILE_EXACT_PUBLIC_AUTHORITY_REQUIRED');
  assert.equal(/\/api\/v1\/projection/.test(`${runtime}\n${client}\n${headers}`), false, 'GENERIC_OR_DESKTOP_API_PATH_FORBIDDEN');
  assert.match(runtime, /Math\.max\(60_000/, 'MOBILE_CLOSED_STATE_BACKOFF_REQUIRED');
  assert.match(runtime, /addEventListener\('online'/, 'MOBILE_NETWORK_RECOVERY_TRIGGER_REQUIRED');
  assert.equal(headerRules.get('/')?.get('content-security-policy'), strictMobileCsp, 'MOBILE_ROOT_CSP_NOT_EXACT');
  assert.equal(headerRules.get('/mobile*')?.get('content-security-policy'), strictMobileCsp, 'MOBILE_ROUTE_CSP_NOT_EXACT');
  assert.equal(headerRules.get('/api/mobile/v1/projection')?.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'", 'MOBILE_API_CSP_NOT_EXACT');
  assert.equal(/(?:script-src|style-src)[^\n]*(?:'unsafe-inline'|'unsafe-eval')/.test(headers), false, 'MOBILE_CSP_UNSAFE_EXECUTION_FORBIDDEN');
  assert.match(headers, /frame-ancestors 'none'/, 'MOBILE_FRAME_ANCESTORS_REQUIRED');
  assert.equal(/portal-r001|workspace/i.test(headers), false, 'MOBILE_HEADERS_CROSS_PRODUCT_RULE_FORBIDDEN');
  assert.equal(/^import\s/m.test(api), false, 'MOBILE_API_EXTERNAL_MODULE_IMPORT_FORBIDDEN');
  assert.match(api, /status:\s*503/, 'MOBILE_API_UNBOUND_MUST_FAIL_CLOSED');
  assert.match(api, /MOBILE_CONTROL_PLANE_BINDING_NOT_VERIFIED/, 'MOBILE_API_HOLD_REASON_REQUIRED');
  assert.match(api, /'Retry-After': '60'/, 'MOBILE_API_RETRY_AFTER_REQUIRED');
  assert.match(api, /'X-Robots-Tag': 'noindex, nofollow'/, 'MOBILE_API_NOINDEX_REQUIRED');
  assert.equal(control.record_type, 'kidults_mobile_non_promotable_control_projection');
  assert.equal(control.fixture_type, 'NON_PROMOTABLE_CONTROL');
  assert.equal(control.projection?.public, false);
  assert.equal(control.projection?.production, false);
  assert.equal(control.projection?.promotable, false);
}

function expectFailure(id, fn, pattern) {
  assert.throws(fn, error => pattern.test(String(error?.message)), `NEGATIVE_CANARY_NOT_REJECTED:${id}`);
}

const files = walk(APP_ROOT);
const contents = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(APP_ROOT, file), 'utf8')]));
assertArtifactPurity(files, contents);
validateRoutes(contents['public/_redirects']);
validateSurface(contents);

const { onRequestGet } = await import('../../../apps/kidults-mobile-portal/functions/api/mobile/v1/projection.js');
const holdResponse = await onRequestGet();
assert.equal(holdResponse.status, 503, 'MOBILE_API_RUNTIME_MUST_FAIL_CLOSED');
assert.equal(holdResponse.headers.get('cache-control'), 'no-store', 'MOBILE_API_RUNTIME_CACHE_CONTROL_INVALID');
assert.equal(holdResponse.headers.get('content-type'), 'application/json; charset=utf-8', 'MOBILE_API_RUNTIME_CONTENT_TYPE_INVALID');
assert.equal(holdResponse.headers.get('retry-after'), '60', 'MOBILE_API_RUNTIME_RETRY_AFTER_INVALID');
assert.equal(holdResponse.headers.get('x-robots-tag'), 'noindex, nofollow', 'MOBILE_API_RUNTIME_NOINDEX_INVALID');
const holdBody = await holdResponse.json();
assert.equal(holdBody.state, 'HOLD', 'MOBILE_API_RUNTIME_STATE_INVALID');
assert.equal(holdBody.reason, 'MOBILE_CONTROL_PLANE_BINDING_NOT_VERIFIED', 'MOBILE_API_RUNTIME_REASON_INVALID');
assert.equal(holdBody.public, 'HOLD', 'MOBILE_API_RUNTIME_PUBLIC_NOT_HOLD');
assert.equal(holdBody.production, 'HOLD', 'MOBILE_API_RUNTIME_PRODUCTION_NOT_HOLD');
assert.equal(holdBody.g5, 'HOLD', 'MOBILE_API_RUNTIME_G5_NOT_HOLD');

const authorization = JSON.parse(fs.readFileSync('coordination/kidults/portal/mobile-portal-public-authorization-v1.json', 'utf8'));
const physical = JSON.parse(fs.readFileSync('coordination/kidults/portal/mobile-portal-physical-ios-acceptance-v1.json', 'utf8'));
const gate = JSON.parse(fs.readFileSync('coordination/kidults/portal/mobile-portal-public-promotion-gate-v1.json', 'utf8'));
assert.equal(authorization.target?.project, PROJECT, 'MOBILE_AUTH_PROJECT_NOT_DEDICATED');
assert.equal(gate.cloudflare_pages?.project, PROJECT, 'MOBILE_GATE_PROJECT_NOT_DEDICATED');
assert.equal(new URL(physical.tested_url).host, `${PROJECT}.pages.dev`, 'MOBILE_PHYSICAL_URL_NOT_DEDICATED');
assert.equal(gate.cloudflare_pages?.remote_build_root, APP_ROOT, 'MOBILE_REMOTE_BUILD_ROOT_NOT_EXACT');
assert.equal(gate.cloudflare_pages?.remote_project_binding, 'UNBOUND', 'MOBILE_REMOTE_PROJECT_MUST_REMAIN_UNBOUND_UNTIL_READBACK');

if (process.argv.includes('--self-test')) {
  expectFailure('WORKSPACE_FILE_INJECTION', () => assertArtifactPurity([...files, 'public/workspace.html'], { ...contents, 'public/workspace.html': 'x' }), /EXACT_ALLOWLIST/);
  expectFailure('R001_FILE_INJECTION', () => assertArtifactPurity([...files, 'public/portal-r001/index.html'], { ...contents, 'public/portal-r001/index.html': 'x' }), /EXACT_ALLOWLIST/);
  expectFailure('ROOT_INDEX_INJECTION', () => assertArtifactPurity([...files, 'public/index.html'], { ...contents, 'public/index.html': 'x' }), /EXACT_ALLOWLIST/);
  expectFailure('EXTERNAL_ASSET_INJECTION', () => validateSurface({ ...contents, 'public/mobile/index.html': contents['public/mobile/index.html'].replace('/mobile/mobile.css', 'https://example.invalid/mobile.css') }), /STYLESHEET_NOT_EXACT|EXTERNAL_ORIGIN/);
  expectFailure('INLINE_STYLE_INJECTION', () => validateSurface({ ...contents, 'public/mobile/index.html': contents['public/mobile/index.html'].replace('<body>', '<body style="display:block">') }), /INLINE_STYLE_FORBIDDEN/);
  expectFailure('UNSAFE_INLINE_CSP', () => validateSurface({ ...contents, 'public/_headers': contents['public/_headers'].replace("style-src 'self'", "style-src 'self' 'unsafe-inline'") }), /CSP_NOT_EXACT|UNSAFE_EXECUTION/);
  expectFailure('SCRIPT_ELEMENT_WILDCARD_CSP', () => validateSurface({ ...contents, 'public/_headers': contents['public/_headers'].replaceAll("frame-ancestors 'none'", "frame-ancestors 'none'; script-src-elem *") }), /CSP_NOT_EXACT/);
  expectFailure('WORKER_WILDCARD_CSP', () => validateSurface({ ...contents, 'public/_headers': contents['public/_headers'].replaceAll("frame-ancestors 'none'", "frame-ancestors 'none'; worker-src *") }), /CSP_NOT_EXACT/);
  expectFailure('CROSS_PRODUCT_ROUTE', () => validateRoutes(`${contents['public/_redirects']}\n/workspace /workspace.html 200\n`), /ROUTES_NOT_EXACT/);
  expectFailure('CROSS_PRODUCT_HEADER', () => validateSurface({ ...contents, 'public/_headers': `${contents['public/_headers']}\n/portal-r001/*\n  X-Robots-Tag: noindex\n` }), /HEADERS_CROSS_PRODUCT/);
  expectFailure('API_IMPORT_INJECTION', () => validateSurface({ ...contents, 'functions/api/mobile/v1/projection.js': `import x from '../../../shared.js';\n${contents['functions/api/mobile/v1/projection.js']}` }), /API_EXTERNAL_MODULE_IMPORT/);
  expectFailure('API_FALSE_LIVE', () => validateSurface({ ...contents, 'functions/api/mobile/v1/projection.js': contents['functions/api/mobile/v1/projection.js'].replace('status: 503', 'status: 200') }), /API_UNBOUND_MUST_FAIL_CLOSED/);
  console.log('KIDULTS independent mobile artifact negative canaries: VERIFIED_PASS (12/12)');
}

const digestInput = files.map(file => `${file}\0${sha256(Buffer.from(contents[file]))}`).join('\n');
console.log(JSON.stringify({
  agent_id: 'AI-018 / GLOBAL_SCALE_STEWARDSHIP',
  as_of: process.env.SOURCE_SHA ? `git:${process.env.SOURCE_SHA}` : 'LOCAL_WORKTREE',
  scope: 'INDEPENDENT_MOBILE_PORTAL_ARTIFACT',
  state: 'VERIFIED_PASS',
  files: files.length,
  exact_allowlist: ALLOWED_FILES,
  artifact_sha256: sha256(Buffer.from(digestInput)),
  project: PROJECT,
  remote_project_binding: 'UNBOUND',
  blockers: ['REMOTE_PAGES_PROJECT_BUILD_ROOT_READBACK', 'PHYSICAL_IPHONE_ACCEPTANCE', 'OWNER_PUBLIC_AUTHORIZATION', 'NATIVE_REQUIRED_STATUS'],
  next_action: 'Run exact-head browser QA, then bind the dedicated Pages project only through governed authorization.',
  authority_boundary: 'No deploy, Public, Production, G5, credential, or external project mutation performed.',
  autonomous_effect: 'Dedicated path-triggered QA can run without the enterprise portal workflow.',
  global_effect: 'The artifact is browser-neutral and contains no market- or region-specific deployment dependency.',
  irreplaceable_value_effect: 'The full mobile artifact and admission controls are KIDULTS-owned.',
  transparency_effect: 'Every deployable file is exact-allowlisted and included in the artifact digest.'
}, null, 2));
