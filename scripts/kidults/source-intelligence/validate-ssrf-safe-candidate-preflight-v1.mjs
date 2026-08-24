#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {
  SafeEgressError,
  isGloballyRoutableAddress,
  pinnedRequestOnce,
  requestWithSafeRedirects,
  ssrfSafePolicy,
  validateAndResolveTarget
} from './ssrf-safe-candidate-preflight-v1.mjs';

const outputPath = process.argv[2] || null;
const mutations = [];
const controls = [];
const publicV4 = '93.184.216.34';
const publicV6 = '2606:4700:4700::1111';

const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function expectReject(id, expectedCode, fn) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof SafeEgressError, `${id}:NON_POLICY_ERROR:${String(error)}`);
    assert(error.code === expectedCode, `${id}:EXPECTED_${expectedCode}:GOT_${error.code}`);
    mutations.push({ id, expected_code: expectedCode, observed_code: error.code, rejected: true });
    return;
  }
  throw new Error(`${id}:MUTATION_ACCEPTED`);
}

function resolverFromMap(map, calls = []) {
  return async (hostname) => {
    calls.push(hostname);
    if (!Object.hasOwn(map, hostname)) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    const value = map[hostname];
    return typeof value === 'function' ? value() : value;
  };
}

function fakeTransport(routes, observations = []) {
  return async (validated, options) => {
    observations.push({
      url: validated.url,
      method: options.method,
      selected_address: validated.resolution.selected_address,
      selected_family: validated.resolution.selected_family
    });
    const route = routes[validated.url];
    if (!route) throw new Error(`UNEXPECTED_FAKE_ROUTE:${validated.url}`);
    const bodyText = route.bodyText || '';
    return {
      statusCode: route.statusCode,
      headers: {
        location: route.location || null,
        contentType: route.contentType || 'text/plain',
        contentLength: String(Buffer.byteLength(bodyText))
      },
      remoteAddress: route.remoteAddress || validated.resolution.selected_address,
      bodyText,
      bodyBytes: Buffer.byteLength(bodyText),
      bodyDigest: bodyText ? digest(bodyText) : null,
      bodyTruncated: false
    };
  };
}

assert(isGloballyRoutableAddress(publicV4), 'PUBLIC_V4_REJECTED');
assert(isGloballyRoutableAddress(publicV6), 'PUBLIC_V6_REJECTED');
for (const address of ['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1']) {
  assert(!isGloballyRoutableAddress(address), `NON_GLOBAL_ADDRESS_ACCEPTED:${address}`);
}
controls.push({ id: 'address-classification', state: 'VERIFIED' });

const noCallResolver = async () => { throw new Error('RESOLVER_MUST_NOT_BE_CALLED'); };
await expectReject('dns-explicit-trusted-resolver-required', 'TRUSTED_RESOLVER_REQUIRED', () => validateAndResolveTarget('https://source.example.com/'));
await expectReject('direct-scheme-file', 'URL_SCHEME_FORBIDDEN', () => validateAndResolveTarget('file:///etc/passwd', { resolver: noCallResolver }));
await expectReject('direct-credentials', 'URL_CREDENTIALS_FORBIDDEN', () => validateAndResolveTarget('https://user:pass@source.example.com/', { resolver: noCallResolver }));
await expectReject('direct-non-default-port', 'URL_PORT_FORBIDDEN', () => validateAndResolveTarget('https://source.example.com:8443/', { resolver: noCallResolver }));
await expectReject('direct-fragment', 'URL_FRAGMENT_FORBIDDEN', () => validateAndResolveTarget('https://source.example.com/#internal', { resolver: noCallResolver }));
await expectReject('direct-backslash-confusion', 'URL_BACKSLASH_FORBIDDEN', () => validateAndResolveTarget('https:\\source.example.com\\@127.0.0.1/', { resolver: noCallResolver }));
await expectReject('direct-ipv4-loopback', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://127.0.0.1/', { resolver: noCallResolver }));
await expectReject('direct-ipv4-metadata', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://169.254.169.254/latest/meta-data/', { resolver: noCallResolver }));
await expectReject('direct-ipv4-decimal', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://2130706433/', { resolver: noCallResolver }));
await expectReject('direct-ipv4-hex', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://0x7f000001/', { resolver: noCallResolver }));
await expectReject('direct-ipv4-octal', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://0177.0.0.1/', { resolver: noCallResolver }));
await expectReject('direct-ipv4-percent-encoded', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://%31%32%37%2e0%2e0%2e1/', { resolver: noCallResolver }));
await expectReject('direct-encoded-userinfo-confusion', 'URL_CREDENTIALS_FORBIDDEN', () => validateAndResolveTarget('http://user%40source.example.com@127.0.0.1/', { resolver: noCallResolver }));
await expectReject('direct-ipv6-loopback', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://[::1]/', { resolver: noCallResolver }));
await expectReject('direct-ipv6-mapped', 'IP_LITERAL_FORBIDDEN', () => validateAndResolveTarget('http://[::ffff:127.0.0.1]/', { resolver: noCallResolver }));
await expectReject('direct-localhost', 'SINGLE_LABEL_HOSTNAME_FORBIDDEN', () => validateAndResolveTarget('http://localhost/', { resolver: noCallResolver }));
await expectReject('direct-internal-name', 'SPECIAL_USE_HOSTNAME_FORBIDDEN', () => validateAndResolveTarget('http://metadata.google.internal/', { resolver: noCallResolver }));
await expectReject('direct-home-arpa', 'SPECIAL_USE_HOSTNAME_FORBIDDEN', () => validateAndResolveTarget('http://router.home.arpa/', { resolver: noCallResolver }));
await expectReject('direct-enterprise-special-use', 'SPECIAL_USE_HOSTNAME_FORBIDDEN', () => validateAndResolveTarget('http://router.corp/', { resolver: noCallResolver }));

await expectReject('dns-empty', 'DNS_NO_ADDRESSES', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [] }));
await expectReject('dns-private-v4', 'DNS_NON_GLOBAL_OR_MIXED_ANSWER', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: '10.1.2.3', family: 4 }] }));
await expectReject('dns-link-local-v4', 'DNS_NON_GLOBAL_OR_MIXED_ANSWER', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: '169.254.169.254', family: 4 }] }));
await expectReject('dns-mixed-v4', 'DNS_NON_GLOBAL_OR_MIXED_ANSWER', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: publicV4, family: 4 }, { address: '127.0.0.1', family: 4 }] }));
await expectReject('dns-private-v6', 'DNS_NON_GLOBAL_OR_MIXED_ANSWER', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: 'fd00::1', family: 6 }] }));
await expectReject('dns-link-local-v6', 'DNS_NON_GLOBAL_OR_MIXED_ANSWER', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: 'fe80::1', family: 6 }] }));
await expectReject('dns-mapped-v6', 'DNS_ANSWER_INVALID', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: '::ffff:127.0.0.1', family: 6 }] }));
await expectReject('dns-mixed-v4-v6', 'DNS_NON_GLOBAL_OR_MIXED_ANSWER', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: publicV6, family: 6 }, { address: 'fe80::1', family: 6 }] }));
await expectReject('dns-family-mismatch', 'DNS_ANSWER_INVALID', () => validateAndResolveTarget('https://source.example.com/', { resolver: async () => [{ address: publicV4, family: 6 }] }));

const safeResolved = await validateAndResolveTarget('https://source.example.com/path?q=1', {
  resolver: async () => [{ address: publicV6, family: 6 }, { address: publicV4, family: 4 }]
});
assert(safeResolved.hostname === 'source.example.com', 'SAFE_HOSTNAME');
assert(safeResolved.resolution.all_answers.length === 2, 'SAFE_DNS_ANSWER_COUNT');
assert(safeResolved.resolution.selected_address === publicV4, 'SAFE_DETERMINISTIC_SELECTION');
controls.push({ id: 'all-global-dual-stack', state: 'VERIFIED' });

await expectReject('config-method-post', 'HTTP_METHOD_FORBIDDEN', () => requestWithSafeRedirects('https://source.example.com/', {
  resolver: noCallResolver,
  method: 'POST'
}));
await expectReject('config-redirect-limit-above-contract', 'REDIRECT_LIMIT_INVALID', () => requestWithSafeRedirects('https://source.example.com/', {
  resolver: noCallResolver,
  maxRedirects: 4
}));
await expectReject('config-timeout-non-finite', 'REQUEST_TIMEOUT_INVALID', () => pinnedRequestOnce(safeResolved, { timeoutMs: Number.NaN }));
await expectReject('config-body-limit-non-finite', 'RESPONSE_BODY_LIMIT_INVALID', () => pinnedRequestOnce(safeResolved, { bodyLimit: Number.NaN }));

const redirectCalls = [];
const redirectTransportObservations = [];
const safeRedirect = await requestWithSafeRedirects('https://source.example.com/start', {
  resolver: resolverFromMap({
    'source.example.com': [{ address: publicV4, family: 4 }],
    'destination.example.com': [{ address: '151.101.1.69', family: 4 }]
  }, redirectCalls),
  requestOnce: fakeTransport({
    'https://source.example.com/start': { statusCode: 302, location: 'https://destination.example.com/final' },
    'https://destination.example.com/final': { statusCode: 200, bodyText: 'bounded metadata' }
  }, redirectTransportObservations),
  method: 'GET',
  maxRedirects: 3,
  clock: () => '2026-08-23T00:00:00.000Z'
});
assert(safeRedirect.receipt.hops.length === 2 && safeRedirect.receipt.redirect_hops_followed === 1, 'SAFE_REDIRECT_HOPS');
assert(safeRedirect.receipt.hops.every((hop) => hop.destination.transport === 'ADDRESS_PINNED_TLS_HOSTNAME_VERIFIED'), 'SAFE_REDIRECT_PIN_RECEIPT');
assert(redirectCalls.join(',') === 'source.example.com,destination.example.com', 'SAFE_REDIRECT_DNS_PER_HOP');
assert(redirectTransportObservations.every((item) => item.selected_address), 'SAFE_REDIRECT_TRANSPORT_PIN');
assert(safeRedirect.receipt.robots_or_terms_observation_creates_rights === false, 'SAFE_REDIRECT_RIGHTS_BOUNDARY');
assert(safeRedirect.receipt.reachability_creates_admission === false, 'SAFE_REDIRECT_ADMISSION_BOUNDARY');
assert(safeRedirect.receipt.response_creates_evidence === false, 'SAFE_REDIRECT_EVIDENCE_BOUNDARY');
assert(safeRedirect.receipt.hops.every((hop) => !Object.hasOwn(hop.destination, 'canonical_url')), 'SAFE_REDIRECT_RAW_URL_LEAK');
controls.push({ id: 'safe-manual-redirect', state: 'VERIFIED', receipt_digest: digest(JSON.stringify(safeRedirect.receipt)) });

await expectReject('redirect-to-ip-literal', 'IP_LITERAL_FORBIDDEN', () => requestWithSafeRedirects('https://source.example.com/start', {
  resolver: resolverFromMap({ 'source.example.com': [{ address: publicV4, family: 4 }] }),
  requestOnce: fakeTransport({ 'https://source.example.com/start': { statusCode: 302, location: 'http://169.254.169.254/latest/meta-data/' } })
}));
await expectReject('redirect-to-internal-name', 'SPECIAL_USE_HOSTNAME_FORBIDDEN', () => requestWithSafeRedirects('https://source.example.com/start', {
  resolver: resolverFromMap({ 'source.example.com': [{ address: publicV4, family: 4 }] }),
  requestOnce: fakeTransport({ 'https://source.example.com/start': { statusCode: 302, location: 'https://metadata.google.internal/' } })
}));
await expectReject('redirect-to-mixed-dns', 'DNS_NON_GLOBAL_OR_MIXED_ANSWER', () => requestWithSafeRedirects('https://source.example.com/start', {
  resolver: resolverFromMap({
    'source.example.com': [{ address: publicV4, family: 4 }],
    'destination.example.com': [{ address: publicV4, family: 4 }, { address: '10.0.0.2', family: 4 }]
  }),
  requestOnce: fakeTransport({ 'https://source.example.com/start': { statusCode: 302, location: 'https://destination.example.com/final' } })
}));
await expectReject('redirect-downgrade', 'REDIRECT_DOWNGRADE_FORBIDDEN', () => requestWithSafeRedirects('https://source.example.com/start', {
  resolver: resolverFromMap({
    'source.example.com': [{ address: publicV4, family: 4 }],
    'destination.example.com': [{ address: '151.101.1.69', family: 4 }]
  }),
  requestOnce: fakeTransport({ 'https://source.example.com/start': { statusCode: 302, location: 'http://destination.example.com/final' } })
}));
await expectReject('redirect-loop', 'REDIRECT_LOOP_DETECTED', () => requestWithSafeRedirects('https://source.example.com/start', {
  resolver: resolverFromMap({ 'source.example.com': [{ address: publicV4, family: 4 }] }),
  requestOnce: fakeTransport({ 'https://source.example.com/start': { statusCode: 302, location: 'https://source.example.com/start' } })
}));
await expectReject('redirect-hop-cap', 'REDIRECT_LIMIT_EXCEEDED', () => requestWithSafeRedirects('https://source.example.com/a', {
  resolver: resolverFromMap({ 'source.example.com': [{ address: publicV4, family: 4 }] }),
  requestOnce: fakeTransport({
    'https://source.example.com/a': { statusCode: 302, location: '/b' },
    'https://source.example.com/b': { statusCode: 302, location: '/c' }
  }),
  maxRedirects: 1
}));

await expectReject('transport-remote-pin-mismatch', 'REMOTE_ADDRESS_PIN_MISMATCH', () => requestWithSafeRedirects('https://source.example.com/', {
  resolver: resolverFromMap({ 'source.example.com': [{ address: publicV4, family: 4 }] }),
  requestOnce: fakeTransport({ 'https://source.example.com/': { statusCode: 200, remoteAddress: '127.0.0.1' } })
}));

let rebindingResolutionCalls = 0;
const rebindingObservations = [];
const rebindingProof = await requestWithSafeRedirects('https://source.example.com/', {
  resolver: async () => {
    rebindingResolutionCalls += 1;
    return rebindingResolutionCalls === 1
      ? [{ address: publicV4, family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }];
  },
  requestOnce: fakeTransport({ 'https://source.example.com/': { statusCode: 200 } }, rebindingObservations),
  clock: () => '2026-08-23T00:00:00.000Z'
});
assert(rebindingResolutionCalls === 1, 'REBINDING_TRIGGERED_SECOND_DNS_LOOKUP');
assert(rebindingObservations[0].selected_address === publicV4, 'REBINDING_PIN_NOT_BOUND');
assert(rebindingProof.receipt.final_destination.selected_address === publicV4, 'REBINDING_RECEIPT_PIN_NOT_BOUND');
controls.push({ id: 'dns-request-toctou-address-pin', state: 'VERIFIED' });

assert(ssrfSafePolicy.default_network_execution === 'HOLD', 'POLICY_DEFAULT_NETWORK_HOLD');
assert(ssrfSafePolicy.address_pin_required === true, 'POLICY_ADDRESS_PIN');
assert(ssrfSafePolicy.automatic_redirects_allowed === false, 'POLICY_AUTO_REDIRECT');
assert(ssrfSafePolicy.trusted_control_plane_resolver_required === true, 'POLICY_TRUSTED_RESOLVER');
assert(ssrfSafePolicy.system_default_resolver_allowed === false, 'POLICY_SYSTEM_RESOLVER');
assert(ssrfSafePolicy.robots_terms_reachability_are_rights === false, 'POLICY_RIGHTS_BOUNDARY');
assert(ssrfSafePolicy.preflight_is_admission === false && ssrfSafePolicy.preflight_is_evidence === false, 'POLICY_PROMOTION_BOUNDARY');

const receipt = {
  id: 'kidults-asi-candidate-ssrf-safe-preflight-mutation-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  as_of: '2026-08-23T00:00:00.000Z',
  issue: 1132,
  platform_principles: ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'],
  policy_id: ssrfSafePolicy.id,
  policy_digest: ssrfSafePolicy.policy_digest,
  mutation_count: mutations.length,
  rejected_mutation_count: mutations.filter((item) => item.rejected).length,
  control_count: controls.length,
  controls,
  mutations,
  protected_main_candidate_host_network_execution: false,
  live_candidate_host_requests_executed: 0,
  robots_terms_reachability_create_rights: false,
  evidence_admitted: 0,
  market_claims_created: 0,
  autonomous_effect: 'POSITIVE_OFFLINE_EXACT_HEAD_MUTATION_PROOF_RUNS_AUTOMATICALLY_WITHOUT_LIVE_CANDIDATE_EGRESS',
  global_effect: 'NEUTRAL_SECURITY_CONTROL_APPLIES_UNIFORMLY_TO_ALL_CANDIDATE_REGIONS_LANGUAGES_AND_HOSTS',
  irreplaceable_value_effect: 'POSITIVE_DESTINATION_DNS_REDIRECT_AND_ADDRESS_PIN_EVIDENCE_IS_BOUND_IN_KIDULTS_OWNED_RECEIPTS',
  transparency_effect: 'POSITIVE_EVERY_REJECTION_CODE_ALLOWED_DESTINATION_DNS_ANSWER_REDIRECT_HOP_AND_PIN_IS_EXPLICIT',
  public_release: 'HOLD',
  production: 'HOLD'
};
assert(receipt.mutation_count >= 30, `MUTATION_COVERAGE_TOO_LOW:${receipt.mutation_count}`);
assert(receipt.mutation_count === receipt.rejected_mutation_count, 'MUTATION_REJECTION_PARTITION');

if (outputPath) await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
