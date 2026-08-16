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
});

test('keeps Track B safety claims intact while scoping the diagnostic', () => {
  assert.match(source, /creates_or_modifies_evidence:\s*false/);
  assert.match(source, /registry_mutated:\s*false/);
  assert.match(source, /rights_or_provenance_weakened:\s*false/);
  assert.match(source, /production_gate_weakened:\s*false/);
});
