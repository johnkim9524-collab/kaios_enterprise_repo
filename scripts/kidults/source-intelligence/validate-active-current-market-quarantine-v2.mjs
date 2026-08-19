import fs from 'node:fs';

const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const revocation = read('coordination/kidults/source-intelligence/collectaio-exposure-revocation-v1.json');
const remediation = read('coordination/kidults/source-intelligence/collectaio-public-exposure-remediation-v1.json');

const requireValue = (condition, code) => {
  if (!condition) throw new Error(code);
};

requireValue(revocation.status === 'ACTIVE_REVOCATION_AND_QUARANTINE', 'REVOCATION_STATUS_INVALID');
requireValue(revocation.scope_boundary === 'COLLECTIBLES_ONLY', 'SCOPE_BOUNDARY_INVALID');
requireValue(revocation.production === 'HOLD' && revocation.public_release === 'HOLD', 'RELEASE_BOUNDARY_INVALID');
requireValue(revocation.active_applicability?.collectaio_shadow_sold_admission_r1 === 'REVOKED_NOT_AN_ACTIVE_ADMISSION', 'ADMISSION_NOT_REVOKED');
requireValue(revocation.active_applicability?.owned_fabric_current_sold_lineage_r2 === 'REVOKED_NOT_AN_ACTIVE_LINEAGE', 'CURRENT_LINEAGE_NOT_REVOKED');
requireValue(revocation.active_applicability?.owned_fabric_multicell_lineage_r2 === 'REVOKED_NOT_AN_ACTIVE_LINEAGE', 'MULTICELL_LINEAGE_NOT_REVOKED');
requireValue(revocation.active_applicability?.minimum_lawful_claim_profile_v1 === 'REVOKED_NO_ACTIVE_MARKET_CLAIM', 'CLAIM_PROFILE_NOT_REVOKED');
requireValue(revocation.active_applicability?.single_provider_concentration_decision_v1 === 'REVOKED_NO_ACTIVE_CONCENTRATION_ACCEPTANCE', 'CONCENTRATION_NOT_REVOKED');
requireValue(revocation.active_applicability?.strict_current_market_binding_v1 === 'REVOKED_NO_ACTIVE_EMPIRICAL_BINDING', 'STRICT_GATE_NOT_REVOKED');
requireValue(revocation.active_market_claim?.state === 'NONE', 'MARKET_CLAIM_MUST_BE_NONE');
requireValue(revocation.active_market_claim?.dated_observed_sold_transaction === 'BLOCKED_PENDING_PRIVATE_REACQUISITION', 'DATED_SOLD_NOT_BLOCKED');
requireValue(revocation.immutable_candidate === 'BLOCKED_NOT_CREATED' && revocation.track_b === 'BLOCKED_EXACT_PAIR_ABSENT', 'DOWNSTREAM_MUST_BLOCK');
requireValue(revocation.historical_cleanup?.state === 'PENDING_OWNER_ACTION', 'HISTORICAL_CLEANUP_STATE_INVALID');
requireValue(Array.isArray(revocation.historical_cleanup?.affected_workflow_runs) && revocation.historical_cleanup.affected_workflow_runs.length === 3, 'AFFECTED_RUNS_INVALID');
requireValue(remediation.status === 'P0_REMEDIATION_IN_PROGRESS', 'REMEDIATION_STATUS_INVALID');
requireValue(remediation.actions?.future_public_provider_execution === 'REMOVE_LEGACY_LIVE_WORKFLOWS_AND_SCRIPTS', 'LEGACY_REMOVAL_NOT_REQUIRED');
requireValue(remediation.actions?.active_market_claim === 'REVOKE_AND_QUARANTINE', 'QUARANTINE_NOT_REQUIRED');

console.log('KIDULTS_ACTIVE_CURRENT_MARKET_QUARANTINE_V2_PASS');
