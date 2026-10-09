import crypto from 'node:crypto';
const canonicalize = value => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonicalize(value[key])])) : value;
export const canonicalJson = value => JSON.stringify(canonicalize(value));
export const sha256 = value => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
