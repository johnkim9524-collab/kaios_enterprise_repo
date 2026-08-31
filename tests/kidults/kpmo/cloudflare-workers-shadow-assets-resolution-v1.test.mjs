#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const configPath = 'infrastructure/cloudflare/workers/kidults-public-portal-shadow/wrangler.jsonc';
const portalPath = 'apps/kidults-enterprise-staging/public/portal';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const configDirectory = path.dirname(path.resolve(configPath));
const resolved = path.resolve(configDirectory, config.assets.directory);
const expected = path.resolve(portalPath);
const legacyBad = path.resolve(configDirectory, 'apps/kidults-enterprise-staging/public/portal');

assert.equal(
  config.assets.directory,
  '../../../../apps/kidults-enterprise-staging/public/portal',
  'assets.directory must be relative to wrangler.jsonc, not to repository root',
);
assert.equal(resolved, expected, 'Wrangler config-relative resolution must target the canonical portal');
assert.equal(fs.statSync(resolved).isDirectory(), true, 'resolved static assets directory must exist');
assert.equal(fs.existsSync(path.join(resolved, 'index.html')), true, 'resolved portal index must exist');
assert.equal(fs.existsSync(path.join(resolved, 'workspace.html')), true, 'resolved portal workspace must exist');
assert.notEqual(legacyBad, expected, 'legacy repository-relative value must resolve to a different path');
assert.equal(fs.existsSync(legacyBad), false, 'legacy misresolved path must remain absent so regression is detectable');

const negative = structuredClone(config);
negative.assets.directory = 'apps/kidults-enterprise-staging/public/portal';
const negativeResolved = path.resolve(configDirectory, negative.assets.directory);
assert.notEqual(negativeResolved, expected, 'legacy value must be rejected under Wrangler config-relative semantics');
assert.equal(fs.existsSync(negativeResolved), false, 'legacy value must fail the existence guard');

console.log(JSON.stringify({
  id: 'kidults-cloudflare-workers-shadow-assets-resolution-regression-v1',
  state: 'VERIFIED_PASS',
  config_relative_semantics: true,
  configured_directory: config.assets.directory,
  resolved_directory: path.relative(process.cwd(), resolved),
  legacy_repository_relative_value_rejected: true,
  index_present: true,
  workspace_present: true,
}, null, 2));
