// Pure lock-graph policy. No file, process, network or Provider authority.
export const WRANGLER_VERSION = '4.131.2';
export const SHARP_MINIMUM = '0.35.4';
export const LOCK_DIRECTORIES = Object.freeze([
  'services/kidults-autonomous-intelligence',
  'tooling/kidults-cloudflare-workers-shadow',
]);
const requireValue = (value, code) => { if (!value) throw new Error(code); };
const stableVersion = value => {
  requireValue(typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value), 'INVALID_STABLE_VERSION');
  const parts = value.split('.').map(Number);
  requireValue(parts.every(Number.isSafeInteger), 'INVALID_STABLE_VERSION');
  return parts;
};
export function versionAtLeast(value, minimum) {
  const left = stableVersion(value), right = stableVersion(minimum);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return true;
}
function validatePackage(node, name) {
  requireValue(node && !node.link, `MISSING_OR_LINKED_${name}`);
  requireValue(typeof node.integrity === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(node.integrity), `INTEGRITY_REQUIRED_${name}`);
  requireValue(node.resolved === `https://registry.npmjs.org/${name}/-/${name}-${node.version}.tgz`, `REGISTRY_BINDING_${name}`);
}
export function validateDependencyLock(manifest, lock) {
  requireValue(manifest?.packageManager === 'npm@11.17.0', 'PINNED_NPM_REQUIRED');
  requireValue(lock?.lockfileVersion === 3 && lock.packages && !Array.isArray(lock.packages), 'LOCK_V3_REQUIRED');
  const packages = lock.packages, wrangler = packages['node_modules/wrangler'];
  requireValue(packages['']?.packageManager === manifest.packageManager, 'LOCK_ROOT_NPM_PIN');
  requireValue(manifest.devDependencies?.wrangler === WRANGLER_VERSION, 'MANIFEST_WRANGLER_PIN');
  requireValue(packages['']?.devDependencies?.wrangler === WRANGLER_VERSION, 'LOCK_ROOT_WRANGLER_PIN');
  requireValue(wrangler?.version === WRANGLER_VERSION, 'LOCKED_WRANGLER_PIN');
  validatePackage(wrangler, 'wrangler');
  const miniflare = packages['node_modules/miniflare'];
  requireValue(miniflare?.version === wrangler.dependencies?.miniflare, 'MINIFLARE_GRAPH_BINDING');
  validatePackage(miniflare, 'miniflare');
  const sharp = packages['node_modules/sharp'];
  requireValue(sharp?.version === miniflare.dependencies?.sharp, 'SHARP_GRAPH_BINDING');
  const copies = Object.entries(packages).filter(([path, node]) => /(^|\/)node_modules\/sharp$/.test(path) || node?.name === 'sharp');
  requireValue(copies.length > 0, 'SHARP_MISSING');
  for (const [, node] of copies) {
    validatePackage(node, 'sharp');
    requireValue(versionAtLeast(node.version, SHARP_MINIMUM), 'VULNERABLE_SHARP');
  }
  return Object.freeze({state: 'VERIFIED_PASS', scope: 'LOCK_GRAPH_POLICY_ONLY_NOT_LIVE_AUDIT',
    wrangler: wrangler.version, miniflare: miniflare.version, sharp: sharp.version,
    sharp_copy_count: copies.length, provider_authority: false, production: 'HOLD', public: 'HOLD', g5: 'HOLD'});
}
