import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesizeTrackBAssessmentReadiness } from './lib/track-b-assessment-readiness.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPORT_ROOT = path.join(SERVICE_ROOT, 'reports', 'engineering-hardening');
const INTEGRATED_PATH = path.resolve(process.env.KIDULTS_TRACK_B_INTEGRATED_GATE_REPORT || path.join(REPORT_ROOT, 'integrated-program-registry-gate-latest.json'));
const SNAPSHOT_PATH = path.resolve(process.env.KIDULTS_TRACK_B_SNAPSHOT_INTEGRITY_REPORT || path.join(REPORT_ROOT, 'track-b-snapshot-artifact-integrity-latest.json'));
const EVIDENCE_PATH = path.resolve(process.env.KIDULTS_TRACK_B_EVIDENCE_INTEGRITY_REPORT || path.join(REPORT_ROOT, 'track-b-evidence-package-registry-integrity-latest.json'));
const OUTPUT_PATH = path.resolve(process.env.KIDULTS_TRACK_B_READINESS_SYNTHESIS_OUTPUT || path.join(REPORT_ROOT, 'track-b-assessment-readiness-latest.json'));

function readJson(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`MISSING_DIAGNOSTIC:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

let result;
try {
  result = synthesizeTrackBAssessmentReadiness({
    integrated: readJson(INTEGRATED_PATH),
    snapshot: readJson(SNAPSHOT_PATH),
    evidence: readJson(EVIDENCE_PATH),
  });
} catch (error) {
  result = {
    status: 'FAIL_CLOSED',
    waiting_state: 'WAITING_FOR_VALIDATION',
    reason: error instanceof SyntaxError ? 'TRACK_B_READINESS_DIAGNOSTIC_JSON_INVALID' : (error instanceof Error ? error.message : String(error)),
    current_snapshot_id: null,
    assessment_permitted: false,
  };
}

const report = {
  schema_version: '1.1.0',
  mode: 'TRACK_B_ASSESSMENT_READINESS_SYNTHESIS',
  generated_at: new Date().toISOString(),
  registry_scope: 'CURRENT_CHECKOUT_ONLY',
  program_state_authority: 'KPMO_INTEGRATED_CANONICAL_BRANCH_REQUIRED',
  planning_context: {
    external_governance_reference: 'KPMO_ISSUE_307_PROGRAM_RESET',
    successor_execution_reference: 'KPMO_ISSUE_308_ASI_10K',
    references_are_outside_current_checkout: true,
    legacy_p0_measurement_role: 'CURRENT_CHECKOUT_ENGINEERING_COMPARATOR_ONLY',
    legacy_production_gate_enforcement: 'UNCHANGED_FAIL_CLOSED',
    legacy_300_plus_and_fixed_vertical_quota_is_canonical_forward_target: false,
    canonical_forward_path: 'M2_ASI_10K_TO_CATEGORY_1000_TO_CANDIDATE_R2_TO_TRACK_B_INTERNAL_INDEX',
    canonical_metric_reclassification_permitted: false,
    requires_kpmo_integrated_canonical_branch_before_gate_reclassification: true,
  },
  ...result,
  proof_sources: {
    integrated_program_gate: path.relative(SERVICE_ROOT, INTEGRATED_PATH),
    snapshot_artifact_integrity: path.relative(SERVICE_ROOT, SNAPSHOT_PATH),
    evidence_package_registry_integrity: path.relative(SERVICE_ROOT, EVIDENCE_PATH),
  },
  claims: {
    observational_engineering_guard_only: true,
    official_inputs_unchanged: true,
    official_output_unchanged: true,
    creates_or_modifies_evidence: false,
    creates_snapshot: false,
    assessment_generated: false,
    registry_mutated: false,
    rights_or_provenance_weakened: false,
    production_gate_weakened: false,
    production_input: false,
    production_evidence: false,
    legacy_production_gate_semantics_changed: false,
    all_three_readiness_proofs_required_before_assessment_permission: true,
    branch_local_registry_view_only: true,
    cross_branch_canonical_state_not_inferred: true,
  },
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(`Track B assessment readiness synthesis: ${report.status}; snapshot=${report.current_snapshot_id ?? 'null'}; permitted=${report.assessment_permitted}; reason=${report.reason}; scope=${report.registry_scope}; role=${report.planning_context.legacy_p0_measurement_role}`);
if (report.status === 'FAIL_CLOSED') process.exitCode = 1;
