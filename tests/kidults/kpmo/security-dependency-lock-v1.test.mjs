import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateDependencyLock, versionAtLeast, WRANGLER_VERSION} from '../../../scripts/kidults/kpmo/security-dependency-lock-v1.mjs';
const node = (name, version, dependencies = {}) => ({version, dependencies,
  resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity: `sha512-${'A'.repeat(86)}==`});
const fixture = () => ({manifest: {packageManager: 'npm@11.17.0', devDependencies: {wrangler: WRANGLER_VERSION}},
  lock: {lockfileVersion: 3, packages: {
    '': {devDependencies: {wrangler: WRANGLER_VERSION}},
    'node_modules/wrangler': node('wrangler', WRANGLER_VERSION, {miniflare: '5.20260901.0-alpha'}),
    'node_modules/miniflare': node('miniflare', '5.20260901.0-alpha', {sharp: '0.35.4'}),
    'node_modules/sharp': node('sharp', '0.35.4'),
  }}});
test('pure policy accepts a patched graph without changing its input', () => {
  const x = fixture(), before = JSON.stringify(x), out = validateDependencyLock(x.manifest, x.lock);
  assert.equal(out.state, 'VERIFIED_PASS'); assert.equal(out.provider_authority, false);
  assert.equal(out.production, 'HOLD'); assert.equal(out.public, 'HOLD'); assert.equal(out.g5, 'HOLD');
  assert.equal(JSON.stringify(x), before); assert.ok(Object.isFrozen(out));
});
const mutations = [
  ['npm pin', x => x.manifest.packageManager = 'npm@latest'],
  ['manifest range', x => x.manifest.devDependencies.wrangler = '^4.131.2'],
  ['root pin', x => x.lock.packages[''].devDependencies.wrangler = '4.127.1'],
  ['installed pin', x => x.lock.packages['node_modules/wrangler'].version = '4.127.1'],
  ['schema', x => x.lock.lockfileVersion = 2],
  ['missing packages', x => delete x.lock.packages],
  ['missing wrangler', x => delete x.lock.packages['node_modules/wrangler']],
  ['missing miniflare', x => delete x.lock.packages['node_modules/miniflare']],
  ['missing sharp', x => delete x.lock.packages['node_modules/sharp']],
  ['broken miniflare edge', x => x.lock.packages['node_modules/wrangler'].dependencies.miniflare = '1.0.0'],
  ['broken sharp edge', x => x.lock.packages['node_modules/miniflare'].dependencies.sharp = '0.35.2'],
  ['linked sharp', x => x.lock.packages['node_modules/sharp'].link = true],
  ['missing integrity', x => delete x.lock.packages['node_modules/sharp'].integrity],
  ['wrong registry', x => x.lock.packages['node_modules/sharp'].resolved = 'https://example.invalid/sharp.tgz'],
  ['vulnerable root', x => {x.lock.packages['node_modules/sharp'] = node('sharp', '0.35.2'); x.lock.packages['node_modules/miniflare'].dependencies.sharp = '0.35.2';}],
  ['vulnerable nested', x => x.lock.packages['node_modules/other/node_modules/sharp'] = node('sharp', '0.35.3')],
  ['vulnerable alias', x => x.lock.packages['node_modules/alias'] = {...node('sharp', '0.35.3'), name: 'sharp'}],
  ['prerelease', x => x.lock.packages['node_modules/other/node_modules/sharp'] = node('sharp', '0.35.4-rc.1')],
];
for (const [name, mutate] of mutations) test(`reject ${name}`, () => {
  const x = fixture(); mutate(x); assert.throws(() => validateDependencyLock(x.manifest, x.lock));
});
for (const value of ['0.35.4', '0.35.10', '0.36.0', '1.0.0']) test(`numeric minimum ${value}`, () => assert.equal(versionAtLeast(value, '0.35.4'), true));
for (const value of ['0.35.3', '0.34.100', '0.0.0']) test(`numeric rejection ${value}`, () => assert.equal(versionAtLeast(value, '0.35.4'), false));
for (const value of ['', null, '0.35', '0.35.4-rc.1', '0.35.4+build', '00.35.4', '9007199254740992.0.0']) test(`malformed version ${value}`, () => assert.throws(() => versionAtLeast(value, '0.35.4')));
test('full audit scope and recursive dependency changes remain enforced', () => {
  const source = fs.readFileSync('.github/workflows/kidults-security-assurance-empirical-r1.yml', 'utf8');
  for (const text of ['"**/package.json"', '"**/package-lock.json"', 'node --test tests/kidults/kpmo/security-dependency-lock-v1.test.mjs',
    'node scripts/kidults/kpmo/validate-security-dependency-lock-v1.mjs', 'npm audit --audit-level=high --json', 'FULL_LOCKFILE_INCLUDING_DEV']) assert.ok(source.includes(text), text);
  assert.ok(!source.includes('--omit=dev'));
});
