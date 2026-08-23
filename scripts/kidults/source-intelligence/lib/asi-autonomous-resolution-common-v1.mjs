import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
export const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
export const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
export const hash = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
export const short = (prefix, value) => `${prefix}_${crypto.createHash('sha256').update(`${prefix}::${value}`).digest('hex').slice(0, 32)}`;
export const uniq = (values) => [...new Set((values || []).filter(Boolean))].sort();
export const countBy = (values, keyFn) => Object.fromEntries([...values.reduce((map, value) => {
  const key = keyFn(value);
  map.set(key, (map.get(key) || 0) + 1);
  return map;
}, new Map()).entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
export const parsePsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines.shift().split('|');
  return lines.map((line) => {
    const fields = line.split('|');
    return Object.fromEntries(header.map((key, index) => [key, fields[index] ?? '']));
  });
};
export const makeWriter = (outputDir) => async (name, value) => {
  const text = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), text);
  return { name, bytes: Buffer.byteLength(text), sha256: hash(text) };
};
export { fs, path };
