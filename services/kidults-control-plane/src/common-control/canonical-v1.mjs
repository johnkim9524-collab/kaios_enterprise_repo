import { createHash } from 'node:crypto';

export const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function fail(code) {
  throw new Error(code);
}

export function requireValue(condition, code) {
  if (!condition) fail(code);
}

export function requireIdentifier(value, code) {
  requireValue(typeof value === 'string' && IDENTIFIER.test(value), code);
  return value;
}

export function requireDigest(value, code) {
  requireValue(typeof value === 'string' && DIGEST.test(value), code);
  return value;
}

export function requireInstant(value, code) {
  requireValue(typeof value === 'string', code);
  const parsed = new Date(value);
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, code);
  return parsed;
}

export function requireExactRecord(value, keys, code) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  const prototype = Object.getPrototypeOf(value);
  requireValue(prototype === Object.prototype || prototype === null, code);
  const ownKeys = Reflect.ownKeys(value);
  requireValue(ownKeys.length === keys.length && ownKeys.every((key) => typeof key === 'string' && keys.includes(key)), code);
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValue(descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value'), code);
  }
  return value;
}

export function snapshotJson(value, { maxBytes = 1024 * 1024, maxDepth = 32, maxNodes = 100000 } = {}) {
  let nodes = 0;
  const visiting = new Set();
  const visit = (item, depth) => {
    requireValue(++nodes <= maxNodes && depth <= maxDepth, 'COMMON_CONTROL_INPUT_COMPLEXITY');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      requireValue(Number.isFinite(item), 'COMMON_CONTROL_JSON_NUMBER_INVALID');
      return item;
    }
    requireValue(typeof item === 'object' && !visiting.has(item), 'COMMON_CONTROL_JSON_DATA_INVALID');
    visiting.add(item);
    let copy;
    if (Array.isArray(item)) {
      requireValue(Reflect.ownKeys(item).length === item.length + 1, 'COMMON_CONTROL_JSON_ARRAY_INVALID');
      copy = Array.from({ length: item.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        requireValue(descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value'), 'COMMON_CONTROL_JSON_ARRAY_INVALID');
        return visit(descriptor.value, depth + 1);
      });
    } else {
      const prototype = Object.getPrototypeOf(item);
      requireValue(prototype === Object.prototype || prototype === null, 'COMMON_CONTROL_JSON_OBJECT_INVALID');
      copy = Object.create(null);
      for (const key of Reflect.ownKeys(item)) {
        requireValue(typeof key === 'string' && key !== '__proto__', 'COMMON_CONTROL_JSON_KEY_INVALID');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        requireValue(descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value'), 'COMMON_CONTROL_JSON_DESCRIPTOR_INVALID');
        copy[key] = visit(descriptor.value, depth + 1);
      }
    }
    visiting.delete(item);
    return copy;
  };
  const snapshot = visit(value, 0);
  requireValue(Buffer.byteLength(JSON.stringify(snapshot), 'utf8') <= maxBytes, 'COMMON_CONTROL_INPUT_TOO_LARGE');
  return snapshot;
}

export function canonicalJson(value) {
  const snapshot = snapshotJson(value);
  const encode = (item) => {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
  };
  return encode(snapshot);
}

export function digestObject(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export function verifySelfDigest(record, digestKey, code) {
  requireExactRecord(record, Object.keys(record), code);
  requireDigest(record[digestKey], code);
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== digestKey));
  requireValue(digestObject(unsigned) === record[digestKey], code);
  return record;
}
