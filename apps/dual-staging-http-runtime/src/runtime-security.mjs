import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const NONCE = /^[A-Za-z0-9._~-]{24,128}$/;
const HEX_256 = /^[a-f0-9]{64}$/;

export class RuntimeControlError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'RuntimeControlError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) {
  throw new RuntimeControlError(code, status);
}

function requireIdentifier(value, code) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail(code, 400);
  return value;
}

function safeSegment(value, code) {
  return requireIdentifier(value, code);
}

async function readJson(file, missingCode) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') fail(missingCode, 503);
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    fail('RUNTIME_CONTROL_JSON_INVALID', 503);
  }
}

export function digestProjection(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function equalDigest(left, right) {
  if (!HEX_256.test(left || '') || !HEX_256.test(right || '')) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function entitlementList(document) {
  const list = Array.isArray(document) ? document : document?.entitlements;
  if (!Array.isArray(list)) fail('ENTITLEMENT_REGISTRY_INVALID', 503);
  return list;
}

export function createFileRuntimeSecurity({ dataDir, now = () => new Date() }) {
  if (!dataDir) fail('RUNTIME_DATA_DIR_REQUIRED', 503);
  const root = path.resolve(dataDir);

  const projectionStore = {
    async getSnapshot({ vertical }) {
      const safeVertical = safeSegment(vertical, 'VERTICAL_INVALID');
      const document = await readJson(
        path.join(root, safeVertical, 'projection.json'),
        'PROJECTION_NOT_AVAILABLE'
      );
      const projection = Object.hasOwn(document, 'projection') ? document.projection : document;
      if (projection === null || typeof projection !== 'object') fail('PROJECTION_INVALID', 503);
      const digest = digestProjection(projection);
      const declaredDigest = document.projection_digest ?? document.digest ?? null;
      if (declaredDigest !== null && !equalDigest(String(declaredDigest), digest)) {
        fail('PROJECTION_DIGEST_INVALID', 503);
      }
      return {
        projection,
        digest,
        asOf: document.as_of ?? null
      };
    }
  };

  const exportControl = {
    async authorize({ vertical, subject, entitlementId, scope = 'EXPORT' }) {
      const safeVertical = safeSegment(vertical, 'VERTICAL_INVALID');
      const safeEntitlementId = requireIdentifier(entitlementId, 'ENTITLEMENT_ID_INVALID');
      const registry = await readJson(
        path.join(root, safeVertical, 'entitlements.json'),
        'ENTITLEMENT_REGISTRY_NOT_AVAILABLE'
      );
      const entitlement = entitlementList(registry).find((item) => item?.id === safeEntitlementId);
      if (!entitlement) fail('EXPORT_NOT_AUTHORIZED', 403);
      if (entitlement.vertical !== safeVertical || entitlement.subject !== subject) fail('EXPORT_NOT_AUTHORIZED', 403);
      if (entitlement.status !== 'active' || entitlement.revoked_at) fail('EXPORT_NOT_AUTHORIZED', 403);
      if (!Array.isArray(entitlement.scopes) || !entitlement.scopes.includes(scope)) fail('EXPORT_NOT_AUTHORIZED', 403);
      if (entitlement.expires_at) {
        const expiry = Date.parse(entitlement.expires_at);
        if (!Number.isFinite(expiry) || expiry <= now().getTime()) fail('EXPORT_NOT_AUTHORIZED', 403);
      }
      const expectedDigest = entitlement.projection_digest ?? null;
      if (expectedDigest !== null && !HEX_256.test(String(expectedDigest))) fail('ENTITLEMENT_REGISTRY_INVALID', 503);
      return { entitlement, expectedDigest };
    },

    async consumeNonce({ vertical, entitlementId, nonce, digest }) {
      const safeVertical = safeSegment(vertical, 'VERTICAL_INVALID');
      const safeEntitlementId = requireIdentifier(entitlementId, 'ENTITLEMENT_ID_INVALID');
      if (typeof nonce !== 'string' || !NONCE.test(nonce)) fail('NONCE_INVALID', 400);
      if (!HEX_256.test(digest || '')) fail('PROJECTION_DIGEST_INVALID', 409);

      const directory = path.join(root, 'nonces', safeVertical);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const key = createHash('sha256')
        .update(`${safeVertical}\u0000${safeEntitlementId}\u0000${nonce}`)
        .digest('hex');
      const marker = path.join(directory, `${key}.json`);
      let handle;
      try {
        handle = await open(marker, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({
          entitlement_id: safeEntitlementId,
          vertical: safeVertical,
          projection_digest: digest,
          consumed_at: now().toISOString()
        }));
      } catch (error) {
        if (error?.code === 'EEXIST') fail('NONCE_REPLAY', 409);
        throw error;
      } finally {
        await handle?.close();
      }
      return true;
    }
  };

  return { projectionStore, exportControl };
}
