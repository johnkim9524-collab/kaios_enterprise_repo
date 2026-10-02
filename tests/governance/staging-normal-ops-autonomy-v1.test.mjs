import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wf = name => fs.readFileSync(`.github/workflows/${name}`, 'utf8');

test('broker normal STAGING updates are natural and authority bounded', () => {
  const x=wf('kidults-autonomous-event-broker-deploy-v1.yml');
  assert.match(x,/push:[\s\S]*autonomous-event-token-broker-v1\.cjs[\s\S]*autonomous-event-token-broker-v1\.json/);
  assert.match(x,/validate-staging-no-authority-expansion-v1\.mjs/);
  assert.match(x,/AUTO-STAGING-BROKER/);
  assert.match(x,/workflow_dispatch:/);
});
test('autonomous landing uses existing exact delta verifier on natural main updates', () => {
  const x=wf('kidults-autonomous-landing-staging-deploy-v1.yml');
  assert.match(x,/push:[\s\S]*autonomous-internal-landing-v1\.json/);
  assert.match(x,/validate-autonomous-landing-staging-deployment-v1\.mjs/);
  assert.match(x,/AUTO-STAGING-AUTONOMOUS-LANDING/);
});
test('natural clock auto deploy is code-only and template changes remain owner bounded', () => {
  const x=wf('kidults-natural-clock-deploy-v1.yml');
  const push=x.slice(x.indexOf('  push:'),x.indexOf('  workflow_dispatch:'));
  assert.match(push,/natural-clock-dispatcher-v1\.cjs/);
  assert.doesNotMatch(push,/natural-clock-dispatcher-v1\.json/);
  assert.match(x,/validate-staging-no-authority-expansion-v1\.mjs/);
  assert.match(x,/AUTO-STAGING-NATURAL-CLOCK/);
});
test('fresh owner approval creation cannot revoke itself', () => {
  const x=wf('kidults-direct-owner-landing-handoff-v1.yml');
  const event=x.slice(x.indexOf('  issue_comment:'),x.indexOf('\n\nconcurrency:'));
  assert.match(event,/types:\s*\[edited, deleted\]/);
  assert.doesNotMatch(event,/created/);
});
test('external Cloudflare staging lane stays fail closed', () => {
  const x=wf('kidults-cloudflare-pages-staging-deploy-v1.yml');
  assert.match(x,/if:\s*\$\{\{ false \}\}/);
  assert.match(x,/external authorization/i);
});
test('existing DigitalOcean portal normal operation remains naturally triggered', () => {
  const x=wf('digitalocean-staging-portal-deploy.yml');
  assert.match(x,/push:/);
});
test('classification validator itself passes the complete current estate', async () => {
  const {spawnSync}=await import('node:child_process');
  const r=spawnSync(process.execPath,['scripts/governance/validate-staging-normal-ops-autonomy-v1.mjs'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr || r.stdout);
  assert.match(r.stdout,/VERIFIED_PASS/);
});
