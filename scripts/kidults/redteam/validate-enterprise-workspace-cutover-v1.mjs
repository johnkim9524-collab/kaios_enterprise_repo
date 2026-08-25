import fs from 'node:fs';

const policyPath = 'coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json';
const contractPath = 'coordination/kidults/redteam/enterprise-workspace-cutover-contract-v1.json';

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const errors = [];

function requireTrue(condition, message) {
  if (!condition) errors.push(message);
}

function requireFile(relativePath, label) {
  requireTrue(fs.existsSync(relativePath), `${label} missing: ${relativePath}`);
}

requireTrue(contract.contract_id === 'KIDULTS_ENTERPRISE_WORKSPACE_CUTOVER_V1', 'Unexpected cutover contract id.');
requireTrue(contract.status === 'CUTOVER_PREPARED_PRODUCTION_HOLD', 'Cutover must remain prepared/HOLD before G5.');
requireTrue(contract.source?.project === 'kidults-enterprise', 'Legacy source project must be kidults-enterprise.');
requireTrue(contract.source?.custom_domain === 'enterprise.kidults.com', 'Enterprise custom domain mismatch.');
requireTrue(contract.source?.deletion_allowed_before_cutover === false, 'Legacy Pages deletion must be prohibited before cutover.');

requireTrue(policy.migrate_then_retire?.includes('kidults-enterprise'), 'kidults-enterprise must be MIGRATE_THEN_RETIRE.');
requireTrue(!policy.quarantine_retire_candidates?.includes('kidults-enterprise'), 'kidults-enterprise must not remain a direct quarantine/delete candidate.');
requireTrue(policy.forbidden_new_deploy_targets?.includes('kidults-enterprise'), 'Legacy project name must remain forbidden for new deployments.');

const target = contract.target || {};
requireFile(target.canonical_publish_root, 'Canonical portal publish root');
requireFile(target.canonical_workspace_entry, 'Canonical Workspace entry');
requireFile(target.workspace_contract, 'Workspace contract');
requireFile(target.workspace_validator, 'Workspace validator');
requireTrue(target.recommended_remote_staging_project !== contract.source.project, 'Remote staging project must not reuse legacy project name.');
requireTrue(target.recommended_canonical_project !== contract.source.project, 'Canonical target must not reuse legacy project name.');
requireTrue(!policy.forbidden_new_deploy_targets?.includes(target.recommended_remote_staging_project), 'Recommended staging project is forbidden by estate policy.');
requireTrue(!policy.forbidden_new_deploy_targets?.includes(target.recommended_canonical_project), 'Recommended canonical project is forbidden by estate policy.');
requireTrue(target.remote_staging_deployment === 'NOT_YET_PROVEN', 'Remote staging must not be falsely claimed as proven.');
requireTrue(target.custom_domain_cutover === 'NOT_AUTHORIZED', 'Custom-domain cutover must remain unauthorized before G5.');
requireTrue(target.production_public === 'HOLD_EXPLICIT_G5_APPROVAL_REQUIRED', 'Production/Public must remain explicit-G5 HOLD.');

const workspaceContract = JSON.parse(fs.readFileSync(target.workspace_contract, 'utf8'));
requireTrue(workspaceContract.truth_rules?.allow_data_mutation === false, 'Canonical Workspace must prohibit data mutation.');
requireTrue(workspaceContract.truth_rules?.allow_registry_mutation === false, 'Canonical Workspace must prohibit Registry mutation.');
requireTrue(workspaceContract.truth_rules?.preserve_fail_closed_states === true, 'Canonical Workspace must preserve fail-closed states.');

const workspaceHtml = fs.readFileSync(target.canonical_workspace_entry, 'utf8');
for (const marker of ['data-page="workspace"', 'data-workspace-context', 'data-workspace-mount', 'KIDULTS Intelligence Workspace']) {
  requireTrue(workspaceHtml.includes(marker), `Canonical Workspace entry missing marker: ${marker}`);
}

const risks = contract.source?.observed_risks || {};
requireTrue(risks.raw_javascript_text_visible_in_ui === true, 'Observed raw-JS legacy risk must remain recorded until retirement.');
requireTrue(risks.legacy_operational_claims_visible === true, 'Observed legacy operational-claim risk must remain recorded until retirement.');

const gates = new Set(contract.pre_cutover_gates || []);
for (const gate of [
  'CANONICAL_WORKSPACE_VALIDATOR_PASS',
  'REMOTE_STAGING_DEPLOYMENT_PROVEN',
  'FAIL_CLOSED_TRUTH_STATE_PASS',
  'NO_UNSUPPORTED_OPERATIONAL_CLAIMS_PASS',
  'ROLLBACK_TARGET_PRESERVED',
  'EXPLICIT_G5_APPROVAL_BEFORE_CUSTOM_DOMAIN_CUTOVER',
]) {
  requireTrue(gates.has(gate), `Missing pre-cutover gate: ${gate}`);
}

const sequence = contract.cutover_sequence || [];
requireTrue(sequence.indexOf('OBTAIN_EXPLICIT_G5_APPROVAL') < sequence.indexOf('MOVE_ENTERPRISE_CUSTOM_DOMAIN_TO_CANONICAL_TARGET'), 'G5 approval must precede enterprise domain cutover.');
requireTrue(sequence.indexOf('OBSERVE_72H_BEFORE_LEGACY_DELETE') < sequence.indexOf('DELETE_LEGACY_KIDULTS_ENTERPRISE_PAGES_PROJECT'), '72h observation must precede legacy Pages deletion.');
requireTrue(contract.rollback?.required === true, 'Rollback must be mandatory.');
requireTrue(contract.rollback?.legacy_project_must_remain_intact_until === 'POST_CUTOVER_72H_PASS', 'Legacy Pages must remain intact through 72h post-cutover observation.');
requireTrue(contract.rollback?.data_store_deletion === 'NOT_AUTHORIZED', 'Data-store deletion must not be authorized by this cutover contract.');

if (errors.length) {
  console.error(JSON.stringify({
    suite: 'KIDULTS_ENTERPRISE_WORKSPACE_CUTOVER_V1',
    result: 'FAIL',
    errors,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_ENTERPRISE_WORKSPACE_CUTOVER_V1',
  result: 'PASS',
  source_state: contract.source.remote_observed_state,
  target_remote_staging: contract.target.remote_staging_deployment,
  production_public: contract.target.production_public,
  legacy_delete: 'BLOCKED_UNTIL_POST_CUTOVER_72H_PASS',
}, null, 2));
