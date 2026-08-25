import fs from 'node:fs';

const path = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const policy = JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];
const requireTrue = (condition, message) => { if (!condition) errors.push(message); };

const groups = {
  canonical_keep: policy.canonical_keep ?? [],
  temporary_staging_keep: policy.temporary_staging_keep ?? [],
  inspect_before_decision: policy.inspect_before_decision ?? [],
  migrate_then_retire: policy.migrate_then_retire ?? [],
  quarantine_retire_candidates: policy.quarantine_retire_candidates ?? [],
  retired_confirmed: (policy.retired_confirmed ?? []).map(item => item.name),
};

for (const [name, values] of Object.entries(groups)) {
  requireTrue(Array.isArray(values), `${name} must be an array.`);
  requireTrue(new Set(values).size === values.length, `${name} contains duplicate resource names.`);
}

const seen = new Map();
for (const [group, values] of Object.entries(groups)) {
  for (const name of values) {
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name).push(group);
  }
}
for (const [name, memberships] of seen) {
  requireTrue(memberships.length === 1, `${name} appears in multiple lifecycle classifications: ${memberships.join(', ')}`);
}

const forbidden = new Set(policy.forbidden_new_deploy_targets ?? []);
for (const item of policy.retired_confirmed ?? []) {
  requireTrue(typeof item.name === 'string' && item.name.length > 0, 'Every retired record requires a name.');
  requireTrue(String(item.status ?? '').startsWith('RETIRED_'), `${item.name}: retired status must begin RETIRED_.`);
  requireTrue(typeof item.proof === 'string' && item.proof.length > 10, `${item.name}: retirement proof is missing.`);
  requireTrue(forbidden.has(item.name), `${item.name}: retired resources must remain forbidden as new deploy targets.`);
}

for (const name of [...groups.canonical_keep, ...groups.temporary_staging_keep]) {
  requireTrue(!forbidden.has(name), `${name}: KEEP resource must not be in forbidden_new_deploy_targets.`);
}

const expectedRetired = [
  'kidults-automation-engine',
  'raspy-fog-3002',
  'hidden-firefly-d588',
  'kaios-collector',
  'kidults-global-standard-preview',
  'kidults-one-dev',
];
for (const name of expectedRetired) {
  requireTrue(groups.retired_confirmed.includes(name), `${name}: confirmed retirement missing from canonical estate truth.`);
}

requireTrue(groups.temporary_staging_keep.includes('kidults-workspace-staging'), 'Canonical remote Workspace staging project must be classified as temporary staging KEEP.');
requireTrue(groups.migrate_then_retire.includes('kidults-enterprise'), 'Legacy enterprise Pages must remain MIGRATE_THEN_RETIRE until cutover observation completes.');
requireTrue(policy.production_public_g5 === 'NO_CHANGE_WITHOUT_EXISTING_APPROVAL_GATE', 'Production/Public/G5 gate must remain unchanged.');
requireTrue(policy.d1_deletion === 'NOT_AUTHORIZED_BY_THIS_POLICY', 'Estate cleanup must not authorize D1 deletion.');

if (errors.length) {
  console.error(JSON.stringify({ suite: 'KIDULTS_CLOUDFLARE_ESTATE_CLASSIFICATION_V1', result: 'FAIL', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_ESTATE_CLASSIFICATION_V1',
  result: 'PASS',
  active_or_pending_resources: Object.entries(groups)
    .filter(([key]) => key !== 'retired_confirmed')
    .reduce((sum, [, values]) => sum + values.length, 0),
  retired_confirmed: groups.retired_confirmed.length,
  temporary_staging_keep: groups.temporary_staging_keep,
  production_public_g5: policy.production_public_g5,
}, null, 2));
