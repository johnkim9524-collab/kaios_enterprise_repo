export const CONTROL_MODE = 'CONTROL_ONLY_SYNTHETIC';
export const DIGEST = /^sha256:[a-f0-9]{64}$/;
export const FIXTURE_PREFIX = 'kir-fixture-';

export const req = (condition, code) => {
  if (!condition) throw new Error(code);
};

export function requireRecord(value, keys, code) {
  req(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  const proto = Object.getPrototypeOf(value);
  req(proto === Object.prototype || proto === null, code);
  const own = Reflect.ownKeys(value);
  req(own.length === keys.length && own.every(key => keys.includes(key)), code);
  for (const key of own) {
    req(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), code);
  }
}
