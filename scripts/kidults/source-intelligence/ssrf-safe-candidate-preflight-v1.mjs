#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { domainToASCII } from 'node:url';

const POLICY_ID = 'kidults-asi-candidate-ssrf-safe-egress-policy-v1';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_BODY_LIMIT = 65_536;
const DEFAULT_REDIRECT_LIMIT = 3;
const MAX_URL_LENGTH = 4_096;
const MAX_DNS_ANSWERS = 64;

const blockedV4 = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]) blockedV4.addSubnet(network, prefix, 'ipv4');

const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new net.BlockList();
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8]
]) blockedV6.addSubnet(network, prefix, 'ipv6');

const specialUseSuffixes = [
  'localhost',
  'localhost.localdomain',
  'localdomain',
  'local',
  'internal',
  'intranet',
  'corp',
  'lan',
  'home',
  'private',
  'localnet',
  'home.arpa',
  'arpa',
  'invalid',
  'test',
  'example',
  'onion'
];

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex')}`;
const nowIso = () => new Date().toISOString();
const canonicalJson = (value) => `${JSON.stringify(value, Object.keys(value || {}).sort())}\n`;

export class SafeEgressError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'SafeEgressError';
    this.code = code;
    this.details = details;
  }
}

const reject = (code, details = {}) => { throw new SafeEgressError(code, details); };

function boundedInteger(value, { name, fallback, minimum, maximum }) {
  const resolved = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    reject(`${name}_INVALID`, { minimum, maximum });
  }
  return resolved;
}

function normalizedAddress(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : value;
}

function addressesEqual(left, right) {
  const a = normalizedAddress(left);
  const b = normalizedAddress(right);
  if (a === b) return true;
  const family = net.isIP(a);
  if (!family || family !== net.isIP(b)) return false;
  const block = new net.BlockList();
  block.addAddress(a, family === 4 ? 'ipv4' : 'ipv6');
  return block.check(b, family === 4 ? 'ipv4' : 'ipv6');
}

export function isGloballyRoutableAddress(address) {
  const normalized = normalizedAddress(address);
  const family = net.isIP(normalized);
  if (family === 4) return !blockedV4.check(normalized, 'ipv4');
  if (family === 6) {
    return globalV6.check(normalized, 'ipv6') && !blockedV6.check(normalized, 'ipv6');
  }
  return false;
}

function isSpecialUseHostname(hostname) {
  return specialUseSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function parseAndCanonicalizeTarget(input) {
  if (typeof input !== 'string' || input.length < 1 || input.length > MAX_URL_LENGTH) reject('URL_LENGTH_INVALID');
  if (input.trim() !== input || /[\u0000-\u001f\u007f]/u.test(input)) reject('URL_CONTROL_OR_WHITESPACE_FORBIDDEN');
  if (input.includes('\\')) reject('URL_BACKSLASH_FORBIDDEN');

  let url;
  try {
    url = new URL(input);
  } catch {
    reject('URL_INVALID');
  }
  if (!['http:', 'https:'].includes(url.protocol)) reject('URL_SCHEME_FORBIDDEN', { protocol: url.protocol });
  if (url.username || url.password) reject('URL_CREDENTIALS_FORBIDDEN');
  if (url.hash) reject('URL_FRAGMENT_FORBIDDEN');
  const expectedPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== expectedPort) reject('URL_PORT_FORBIDDEN', { port: url.port });

  const rawHostname = String(url.hostname || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!rawHostname) reject('HOSTNAME_MISSING');
  if (net.isIP(rawHostname)) reject('IP_LITERAL_FORBIDDEN');
  const hostname = domainToASCII(rawHostname).toLowerCase();
  if (!hostname || hostname.length > 253 || hostname.includes('..')) reject('HOSTNAME_INVALID');
  if (hostname.split('.').length < 2) reject('SINGLE_LABEL_HOSTNAME_FORBIDDEN');
  if (isSpecialUseHostname(hostname)) reject('SPECIAL_USE_HOSTNAME_FORBIDDEN', { hostname });
  for (const label of hostname.split('.')) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) reject('HOSTNAME_LABEL_INVALID', { hostname });
  }

  url.hostname = hostname;
  url.port = '';
  return {
    url: url.toString(),
    protocol: url.protocol,
    hostname,
    port: Number(expectedPort),
    path: `${url.pathname || '/'}${url.search || ''}`
  };
}

export async function validateAndResolveTarget(input, options = {}) {
  const parsed = parseAndCanonicalizeTarget(input);
  const resolver = options.resolver;
  if (typeof resolver !== 'function') {
    reject('TRUSTED_RESOLVER_REQUIRED', {
      hostname: parsed.hostname,
      reason: 'SYSTEM_DEFAULT_RESOLVER_IS_NOT_AN_AUTHORIZED_CONTROL_PLANE'
    });
  }
  let rawAnswers;
  try {
    rawAnswers = await resolver(parsed.hostname);
  } catch (error) {
    reject('DNS_RESOLUTION_FAILED', { hostname: parsed.hostname, resolver_error: String(error?.code || error?.message || error) });
  }
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
  if (answers.length < 1) reject('DNS_NO_ADDRESSES', { hostname: parsed.hostname });
  if (answers.length > MAX_DNS_ANSWERS) reject('DNS_ANSWER_LIMIT_EXCEEDED', { hostname: parsed.hostname, count: answers.length });

  const normalized = answers.map((answer) => {
    const address = normalizedAddress(typeof answer === 'string' ? answer : answer?.address);
    const detectedFamily = net.isIP(address);
    const declaredFamily = Number(typeof answer === 'string' ? detectedFamily : answer?.family);
    if (!detectedFamily || (declaredFamily && declaredFamily !== detectedFamily)) {
      reject('DNS_ANSWER_INVALID', { hostname: parsed.hostname, address });
    }
    return { address, family: detectedFamily };
  });
  const uniqueAnswers = [...new Map(normalized.map((answer) => [`${answer.family}:${answer.address}`, answer])).values()]
    .sort((a, b) => a.family - b.family || a.address.localeCompare(b.address));
  const rejectedAnswers = uniqueAnswers.filter((answer) => !isGloballyRoutableAddress(answer.address));
  if (rejectedAnswers.length > 0) {
    reject('DNS_NON_GLOBAL_OR_MIXED_ANSWER', {
      hostname: parsed.hostname,
      rejected_answers: rejectedAnswers,
      all_answers: uniqueAnswers
    });
  }

  const selected = uniqueAnswers[0];
  return {
    ...parsed,
    resolution: {
      policy_id: POLICY_ID,
      all_answers: uniqueAnswers,
      selected_address: selected.address,
      selected_family: selected.family,
      all_answers_globally_routable: true,
      mixed_global_non_global_answers_rejected: true,
      address_pin_required: true
    }
  };
}

async function readBoundedBody(response, limit) {
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = limit - bytes;
    if (remaining <= 0) {
      truncated = true;
      response.destroy();
      break;
    }
    const slice = buffer.length > remaining ? buffer.subarray(0, remaining) : buffer;
    chunks.push(slice);
    bytes += slice.length;
    if (buffer.length > remaining || bytes >= limit) {
      truncated = true;
      response.destroy();
      break;
    }
  }
  const body = Buffer.concat(chunks);
  return { bodyText: body.toString('utf8'), bodyBytes: body.length, bodyDigest: sha256(body), bodyTruncated: truncated };
}

function pinnedLookup(address, family) {
  return (_hostname, options, callback) => {
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export async function pinnedRequestOnce(validated, options = {}) {
  const method = String(options.method || 'HEAD').toUpperCase();
  if (!['HEAD', 'GET'].includes(method)) reject('HTTP_METHOD_FORBIDDEN', { method });
  const timeoutMs = boundedInteger(options.timeoutMs, {
    name: 'REQUEST_TIMEOUT', fallback: DEFAULT_TIMEOUT_MS, minimum: 1_000, maximum: DEFAULT_TIMEOUT_MS
  });
  const bodyLimit = boundedInteger(options.bodyLimit, {
    name: 'RESPONSE_BODY_LIMIT', fallback: DEFAULT_BODY_LIMIT, minimum: 0, maximum: DEFAULT_BODY_LIMIT
  });
  const client = validated.protocol === 'https:' ? https : http;
  const selectedAddress = validated.resolution.selected_address;
  const selectedFamily = validated.resolution.selected_family;

  return new Promise((resolve, rejectPromise) => {
    let settled = false;
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error instanceof SafeEgressError ? error : new SafeEgressError('PINNED_REQUEST_FAILED', { error: String(error?.code || error?.message || error) }));
    };
    const request = client.request({
      protocol: validated.protocol,
      hostname: validated.hostname,
      port: validated.port,
      path: validated.path,
      method,
      servername: validated.hostname,
      lookup: pinnedLookup(selectedAddress, selectedFamily),
      family: selectedFamily,
      agent: false,
      rejectUnauthorized: true,
      headers: {
        accept: method === 'HEAD' ? '*/*' : 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1',
        host: validated.hostname,
        'user-agent': options.userAgent || 'KIDULTS-ASI-SSRF-Safe-Preflight/1.0',
        ...(method === 'GET' ? { range: `bytes=0-${Math.max(0, bodyLimit - 1)}` } : {})
      }
    }, async (response) => {
      try {
        const body = method === 'GET'
          ? await readBoundedBody(response, bodyLimit)
          : { bodyText: '', bodyBytes: 0, bodyDigest: null, bodyTruncated: false };
        if (settled) return;
        settled = true;
        resolve({
          statusCode: Number(response.statusCode || 0),
          headers: {
            location: Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location || null,
            contentType: response.headers['content-type'] || null,
            contentLength: response.headers['content-length'] || null
          },
          remoteAddress: normalizedAddress(response.socket?.remoteAddress),
          ...body
        });
      } catch (error) {
        finishError(error);
      }
    });
    request.once('socket', (socket) => {
      socket.once('connect', () => {
        const remoteAddress = normalizedAddress(socket.remoteAddress);
        if (!addressesEqual(remoteAddress, selectedAddress)) {
          socket.destroy(new SafeEgressError('REMOTE_ADDRESS_PIN_MISMATCH', { expected: selectedAddress, observed: remoteAddress }));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new SafeEgressError('PINNED_REQUEST_TIMEOUT')));
    request.once('error', finishError);
    request.end();
  });
}

function destinationEvidence(validated) {
  return {
    policy_id: validated.resolution.policy_id,
    canonical_url_digest: sha256(validated.url),
    protocol: validated.protocol,
    hostname: validated.hostname,
    port: validated.port,
    resolved_addresses: validated.resolution.all_answers,
    selected_address: validated.resolution.selected_address,
    selected_family: validated.resolution.selected_family,
    address_pin_required: true,
    transport: 'ADDRESS_PINNED_TLS_HOSTNAME_VERIFIED',
    all_answers_globally_routable: true
  };
}

export async function requestWithSafeRedirects(input, options = {}) {
  const resolver = options.resolver;
  if (typeof resolver !== 'function') {
    reject('TRUSTED_RESOLVER_REQUIRED', {
      reason: 'AN_EXPLICIT_CONTROL_PLANE_RESOLVER_MUST_BE_BOUND_BEFORE_NETWORK_EXECUTION'
    });
  }
  const requestOnce = options.requestOnce || pinnedRequestOnce;
  if (typeof requestOnce !== 'function') reject('PINNED_TRANSPORT_REQUIRED');
  const maxRedirects = boundedInteger(options.maxRedirects, {
    name: 'REDIRECT_LIMIT', fallback: DEFAULT_REDIRECT_LIMIT, minimum: 0, maximum: DEFAULT_REDIRECT_LIMIT
  });
  const method = String(options.method || 'HEAD').toUpperCase();
  if (!['HEAD', 'GET'].includes(method)) reject('HTTP_METHOD_FORBIDDEN', { method });
  const hops = [];
  const seen = new Set();
  let currentUrl = input;
  let previousProtocol = null;

  for (let hopIndex = 0; hopIndex <= maxRedirects; hopIndex += 1) {
    const validated = await validateAndResolveTarget(currentUrl, { resolver });
    if (previousProtocol === 'https:' && validated.protocol !== 'https:') {
      reject('REDIRECT_DOWNGRADE_FORBIDDEN', { hop_index: hopIndex, target_digest: sha256(validated.url), prior_hops: hops });
    }
    if (seen.has(validated.url)) reject('REDIRECT_LOOP_DETECTED', { hop_index: hopIndex, target_digest: sha256(validated.url), prior_hops: hops });
    seen.add(validated.url);

    const response = await requestOnce(validated, {
      method,
      timeoutMs: options.timeoutMs,
      bodyLimit: options.bodyLimit,
      userAgent: options.userAgent
    });
    if (!addressesEqual(response.remoteAddress, validated.resolution.selected_address)) {
      reject('REMOTE_ADDRESS_PIN_MISMATCH', {
        hop_index: hopIndex,
        expected: validated.resolution.selected_address,
        observed: response.remoteAddress,
        prior_hops: hops
      });
    }
    const statusCode = Number(response.statusCode || 0);
    const isRedirect = [301, 302, 303, 307, 308].includes(statusCode);
    const hopReceipt = {
      hop_index: hopIndex,
      destination: destinationEvidence(validated),
      response: {
        status_code: statusCode,
        content_type: response.headers?.contentType || null,
        content_length: response.headers?.contentLength || null,
        remote_address_matches_pin: true,
        body_bytes: Number(response.bodyBytes || 0),
        body_digest: response.bodyDigest || null,
        body_truncated: Boolean(response.bodyTruncated),
        redirect: isRedirect,
        redirect_location_digest: isRedirect && response.headers?.location ? sha256(response.headers.location) : null
      }
    };
    hops.push(hopReceipt);

    if (!isRedirect) {
      return {
        bodyText: response.bodyText || '',
        receipt: {
          id: 'kidults-asi-ssrf-safe-request-receipt-v1',
          version: '1.0.0',
          state: 'ADDRESS_PINNED_REQUEST_COMPLETED',
          observed_at: options.clock ? options.clock() : nowIso(),
          method,
          initial_url_digest: sha256(input),
          redirect_hops_followed: hops.length - 1,
          maximum_redirect_hops: maxRedirects,
          hops,
          final_status_code: statusCode,
          final_destination: hopReceipt.destination,
          robots_or_terms_observation_creates_rights: false,
          reachability_creates_admission: false,
          response_creates_evidence: false,
          market_claim_authorized: false,
          public_release: 'HOLD',
          production: 'HOLD'
        }
      };
    }
    if (!response.headers?.location) reject('REDIRECT_LOCATION_MISSING', { hop_index: hopIndex, prior_hops: hops });
    if (hopIndex >= maxRedirects) reject('REDIRECT_LIMIT_EXCEEDED', { maximum_redirect_hops: maxRedirects, prior_hops: hops });
    try {
      currentUrl = new URL(response.headers.location, validated.url).toString();
    } catch {
      reject('REDIRECT_LOCATION_INVALID', { hop_index: hopIndex, prior_hops: hops });
    }
    previousProtocol = validated.protocol;
  }
  reject('REDIRECT_LIMIT_EXCEEDED', { maximum_redirect_hops: maxRedirects, prior_hops: hops });
}

export const ssrfSafePolicy = Object.freeze({
  id: POLICY_ID,
  default_network_execution: 'HOLD',
  permitted_schemes: ['http', 'https'],
  permitted_methods: ['HEAD', 'GET'],
  default_ports_only: true,
  ip_literals_allowed: false,
  trusted_control_plane_resolver_required: true,
  system_default_resolver_allowed: false,
  mixed_dns_answers_allowed: false,
  automatic_redirects_allowed: false,
  address_pin_required: true,
  remote_address_pin_verification_required: true,
  maximum_redirect_hops: DEFAULT_REDIRECT_LIMIT,
  maximum_body_bytes: DEFAULT_BODY_LIMIT,
  raw_canonical_url_in_receipt: false,
  robots_terms_reachability_are_rights: false,
  preflight_is_admission: false,
  preflight_is_evidence: false,
  public_release: 'HOLD',
  production: 'HOLD',
  policy_digest: sha256(canonicalJson({ id: POLICY_ID, redirect_limit: DEFAULT_REDIRECT_LIMIT, body_limit: DEFAULT_BODY_LIMIT }))
});
