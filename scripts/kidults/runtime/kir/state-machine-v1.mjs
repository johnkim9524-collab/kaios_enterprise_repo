import { CURRENT_BLOCKED_STATE, DIGEST, nonNegativeInt, req } from './constants-v1.mjs';
import { validateForwardDependencyClosure, validateTransitionEvidence } from './graph-v1.mjs';

export function validateStateMachine(contract, registry, readiness, modules) {
  const truth = readiness?.truth_boundary;
  const ceiling = registry?.truth_ceiling;
  req(truth && ceiling, 'KIR_TRUTH_BOUNDARY_MISSING');
  const empirical = truth.lawful_empirical_current_sold_admitted;
  req(nonNegativeInt(empirical), 'KIR_EMPIRICAL_TRUTH_INVALID');
  req(ceiling.lawful_empirical_current_sold_admitted === empirical, 'KIR_EMPIRICAL_CEILING_DRIFT');
  req(truth.public === 'HOLD' && truth.production === 'HOLD' && truth.g5 === 'HOLD', 'KIR_READINESS_RELEASE_HOLD');
  req(ceiling.public === 'HOLD' && ceiling.production === 'HOLD' && ceiling.g5 === 'HOLD', 'KIR_REGISTRY_RELEASE_HOLD');

  const source = modules.get('SOURCE_RIGHTS');
  const authority = modules.get('RECEIPT_AUTHORITY');
  const admission = modules.get('CURRENT_SOLD_ADMISSION');
  const evidence = modules.get('CURRENT_SOLD_EVIDENCE');
  const ledger = modules.get('APPEND_ONLY_LEDGER');
  const pair = modules.get('CANDIDATE_EVIDENCE_PAIR');
  const trackB = modules.get('TRACK_B_ASSESSMENT');
  const projection = modules.get('PROJECTION_RELEASE');

  req(nonNegativeInt(admission.empirical_count), 'KIR_ADMISSION_EMPIRICAL_INVALID');
  req(nonNegativeInt(evidence.empirical_count), 'KIR_EVIDENCE_EMPIRICAL_INVALID');
  req(admission.empirical_count === empirical, 'KIR_ADMISSION_EMPIRICAL_DRIFT');
  req(evidence.empirical_count === empirical, 'KIR_EVIDENCE_EMPIRICAL_DRIFT');
  if (empirical === 0) {
    req(source.state === CURRENT_BLOCKED_STATE.SOURCE_RIGHTS || source.state === 'READY', 'KIR_SOURCE_RIGHTS_ZERO_STATE');
    req(authority.state === CURRENT_BLOCKED_STATE.RECEIPT_AUTHORITY || authority.state === 'READY', 'KIR_RECEIPT_AUTHORITY_ZERO_STATE');
    req(admission.state === CURRENT_BLOCKED_STATE.CURRENT_SOLD_ADMISSION, 'KIR_ADMISSION_FALSE_GREEN');
    req(evidence.state === CURRENT_BLOCKED_STATE.CURRENT_SOLD_EVIDENCE, 'KIR_EVIDENCE_FALSE_GREEN');
  } else {
    req(source.state === 'READY', 'KIR_SOURCE_RIGHTS_NOT_READY_FOR_EMPIRICAL');
    req(authority.state === 'READY', 'KIR_RECEIPT_AUTHORITY_NOT_READY_FOR_EMPIRICAL');
    req(admission.state === 'EMPIRICAL_VALIDATED', 'KIR_ADMISSION_STATE_NOT_EMPIRICAL_VALIDATED');
    req(evidence.state === 'EMPIRICAL_VALIDATED', 'KIR_EVIDENCE_STATE_NOT_EMPIRICAL_VALIDATED');
  }

  req(typeof ledger.postgres_migration_applied === 'boolean', 'KIR_LEDGER_MIGRATION_TYPE');
  req(nonNegativeInt(ledger.postgres_rows_written), 'KIR_LEDGER_ROWS_INVALID');
  req(ceiling.postgres_rows_written === ledger.postgres_rows_written, 'KIR_LEDGER_CEILING_DRIFT');
  if (!ledger.postgres_migration_applied) {
    req(ledger.postgres_rows_written === 0, 'KIR_LEDGER_ROWS_WITHOUT_MIGRATION');
    req(ledger.state === CURRENT_BLOCKED_STATE.APPEND_ONLY_LEDGER, 'KIR_LEDGER_FALSE_GREEN');
  } else {
    req(ledger.postgres_rows_written > 0, 'KIR_LEDGER_MIGRATION_WITHOUT_FIRST_WRITE');
    req(ledger.state === 'EMPIRICAL_VALIDATED', 'KIR_LEDGER_STATE_NOT_EMPIRICAL_VALIDATED');
    req(empirical > 0, 'KIR_LEDGER_EMPIRICAL_WITHOUT_CURRENT_SOLD');
  }

  const pairAbsent = pair.candidate === 'NONE' && pair.evidence_package === 'NONE';
  const pairPresent = DIGEST.test(pair.candidate || '') && DIGEST.test(pair.evidence_package || '');
  req(pairAbsent || pairPresent, 'KIR_PAIR_PARTIAL_OR_MALFORMED');
  req(ceiling.candidate === pair.candidate && ceiling.evidence_package === pair.evidence_package, 'KIR_PAIR_CEILING_DRIFT');
  if (pairAbsent) {
    req(pair.state === CURRENT_BLOCKED_STATE.CANDIDATE_EVIDENCE_PAIR, 'KIR_PAIR_FALSE_GREEN');
  } else {
    req(pair.state === 'PAIR_READY', 'KIR_PAIR_STATE_NOT_READY');
    req(ledger.state === 'EMPIRICAL_VALIDATED' && ledger.postgres_rows_written > 0, 'KIR_PAIR_WITHOUT_LEDGER');
    req(evidence.state === 'EMPIRICAL_VALIDATED' && empirical > 0, 'KIR_PAIR_WITHOUT_EVIDENCE');
  }

  req(typeof trackB.assessment_started === 'boolean', 'KIR_TRACK_B_STARTED_TYPE');
  req(ceiling.track_b_started === trackB.assessment_started, 'KIR_TRACK_B_CEILING_DRIFT');
  if (!trackB.assessment_started) {
    req(trackB.state === CURRENT_BLOCKED_STATE.TRACK_B_ASSESSMENT, 'KIR_TRACK_B_FALSE_GREEN');
  } else {
    req(trackB.state === 'COMPLETE_INDEPENDENT_ASSESSMENT', 'KIR_TRACK_B_STATE_NOT_COMPLETE');
    req(pair.state === 'PAIR_READY', 'KIR_TRACK_B_WITHOUT_PAIR');
  }

  const projectionAbsent = projection.approved_projection === 'NONE';
  const projectionPresent = DIGEST.test(projection.approved_projection || '');
  req(projectionAbsent || projectionPresent, 'KIR_PROJECTION_MALFORMED');
  req(ceiling.approved_projection === projection.approved_projection, 'KIR_PROJECTION_CEILING_DRIFT');
  if (projectionAbsent) {
    req(projection.state === CURRENT_BLOCKED_STATE.PROJECTION_RELEASE, 'KIR_PROJECTION_FALSE_GREEN');
  } else {
    req(projection.state === 'APPROVED_PROJECTION_READY', 'KIR_PROJECTION_STATE_NOT_READY');
    req(trackB.state === 'COMPLETE_INDEPENDENT_ASSESSMENT', 'KIR_PROJECTION_WITHOUT_TRACK_B');
  }

  validateTransitionEvidence(contract, modules);
  validateForwardDependencyClosure(modules);
  return {
    empirical,
    postgresRows: ledger.postgres_rows_written,
    pairReady: pair.state === 'PAIR_READY',
    trackBComplete: trackB.state === 'COMPLETE_INDEPENDENT_ASSESSMENT',
    projectionReady: projection.state === 'APPROVED_PROJECTION_READY',
  };
}
