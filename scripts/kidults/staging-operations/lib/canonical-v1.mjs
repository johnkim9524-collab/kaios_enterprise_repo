import { createHash } from 'node:crypto';

export const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const sha256 = value => `sha256:${createHash('sha256').update(
  Buffer.isBuffer(value) || typeof value === 'string' ? value : canonical(value),
).digest('hex')}`;

export const idFrom = (prefix, value) => `${prefix}:${sha256(value).slice(7)}`;
