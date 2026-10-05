import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'coordination/kidults/governance/staging-normal-ops-autonomy-policy-v1.json'), 'utf8'));
const workflowDir = path.join(root, '.github/workflows');
const files = fs.readdirSync(workflowDir).filter(x => /\.ya?ml$/.test(x));
const auto = new Set(policy.auto_normal_ops);
const owner = new Set(policy.owner_boundary_exact);
const manualPattern = new RegExp(policy.manual_diagnostic_recovery_name_pattern, 'i');
const naturalPattern = /^\s*(push|schedule|workflow_run|repository_dispatch):/m;
const dispatchPattern = /^\s*workflow_dispatch:/m;
const failures = [];
const inventory = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(workflowDir, file), 'utf8');
  if (!/staging/i.test(text) || !dispatchPattern.test(text)) continue;
  const natural = naturalPattern.test(text);
  let classification = natural ? 'AUTO_OR_DUAL_TRIGGER' : null;
  if (auto.has(file)) {
    classification = 'AUTO_NORMAL_OPS';
    if (!natural) failures.push(`AUTO_NORMAL_OPS_MISSING_NATURAL_TRIGGER:${file}`);
  } else if (owner.has(file)) {
    classification = 'OWNER_BOUNDARY';
  } else if (!natural && manualPattern.test(file)) {
    classification = 'MANUAL_DIAGNOSTIC_RECOVERY';
  } else if (!natural) {
    failures.push(`UNCLASSIFIED_MANUAL_STAGING_BOTTLENECK:${file}`);
  }
  inventory.push({file, classification, workflow_dispatch: true, natural_trigger: natural});
}
for (const required of auto) {
  if (!files.includes(required)) failures.push(`AUTO_NORMAL_OPS_WORKFLOW_MISSING:${required}`);
}
const handoff = fs.readFileSync(path.join(workflowDir, 'kidults-direct-owner-landing-handoff-v1.yml'), 'utf8');
if (/types:\s*\[[^\]]*created/.test(handoff)) failures.push('FRESH_OWNER_APPROVAL_MUST_NOT_REVOKE_ITSELF');
const broker = fs.readFileSync(path.join(workflowDir, 'kidults-autonomous-event-broker-deploy-v1.yml'), 'utf8');
if (!broker.includes('validate-staging-no-authority-expansion-v1.mjs')) failures.push('BROKER_AUTO_DEPLOY_MISSING_NO_EXPANSION_GUARD');
const landing = fs.readFileSync(path.join(workflowDir, 'kidults-autonomous-landing-staging-deploy-v1.yml'), 'utf8');
if (!landing.includes('validate-autonomous-landing-staging-deployment-v1.mjs')) failures.push('LANDING_AUTO_DEPLOY_MISSING_DELTA_GUARD');
if (failures.length) {
  console.error(JSON.stringify({state:'VERIFIED_FAIL', failures, inventory}, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  classified: inventory.length,
  auto_normal_ops: inventory.filter(x => x.classification === 'AUTO_NORMAL_OPS').map(x => x.file),
  owner_boundary: inventory.filter(x => x.classification === 'OWNER_BOUNDARY').map(x => x.file),
  manual_diagnostic_recovery: inventory.filter(x => x.classification === 'MANUAL_DIAGNOSTIC_RECOVERY').map(x => x.file),
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}, null, 2));
