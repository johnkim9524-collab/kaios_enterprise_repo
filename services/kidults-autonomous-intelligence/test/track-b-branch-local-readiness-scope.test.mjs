import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '../scripts/track-b-assessment-readiness-synthesis.mjs');
const source = fs.readFileSync(SCRIPT, 'utf8');

test('labels Track B readiness as current-checkout registry state only', () => {
  assert.match(source, /registry_scope:\s*'CURRENT_CHECKOUT_ONLY'/);
  assert.match(source, /program_state_authority:\s*'KPMO_INTEGRATED_CANONICAL_BRANCH_REQUIRED'/);
});

test('does not infer cross-branch canonical program state from branch-local readiness', () => {
  assert.match(source, /branch_local_registry_view_only:\s*true/);
  assert.match(source, /cross_branch_canonical_state_not_inferred:\s*true/);
  assert.match(source, /references_are_outside_current_checkout:\s*true/);
});

test('classifies the legacy P0 measurements as an engineering comparator after the KPMO reset', () => {
  assert.match(source, /external_governance_reference:\s*'KPMO_ISSUE_307_PROGRAM_RESET'/);
  assert.match(source, /successor_execution_reference:\s*'KPMO_ISSUE_308_ASI_10K'/);
  assert.match(source, /legacy_p0_measurement_role:\s*'CURRENT_CHECKOUT_ENGINEERING_COMPARATOR_ONLY'/);
  assert.match(source, /legacy_300_plus_and_fixed_vertical_quota_is_canonical_forward_target:\s*false/);
  assert.match(source, /canonical_forward_path:\s*'M2_ASI_10K_TO_CATEGORY_1000_TO_CANDIDATE_R2_TO_TRACK_B_INTERNAL_INDEX'/);
});

test('requires KPMO canonical branch integration before any gate reclassification', () => {
  assert.match(source, /legacy_production_gate_enforcement:\s*'UNCHANGED_FAIL_CLOSED'/);
  assert.match(source, /canonical_metric_reclassification_permitted:\s*false/);
  assert.match(source, /requires_kpmo_integrated_canonical_branch_before_gate_reclassification:\s*true/);
  assert.match(source, /legacy_production_gate_semantics_changed:\s*false/);
});

test('keeps Track B safety claims intact while scoping the diagnostic', () => {
  assert.match(source, /creates_or_modifies_evidence:\s*false/);
  assert.match(source, /registry_mutated:\s*false/);
  assert.match(source, /rights_or_provenance_weakened:\s*false/);
  assert.match(source, /production_gate_weakened:\s*false/);
  assert.match(source, /production_input:\s*false/);
  assert.match(source, /production_evidence:\s*false/);
});
