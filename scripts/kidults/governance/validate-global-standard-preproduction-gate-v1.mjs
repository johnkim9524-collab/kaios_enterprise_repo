import fs from 'node:fs';
import process from 'node:process';

const file = 'coordination/kidults/kpmo/global-standard-preproduction-gate-v1.json';
const gate = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(gate.status === 'ACTIVE_FAIL_CLOSED', 'Global-standard gate must remain fail-closed.');
assert(gate.production === 'HOLD', 'Production must remain HOLD.');
assert(Array.isArray(gate.required_gates) && gate.required_gates.length >= 14, 'Required global-standard gates are incomplete.');
assert(new Set(gate.required_gates.map(item => item.id)).size === gate.required_gates.length, 'Gate IDs must be unique.');

const unresolved = gate.required_gates.filter(item => item.status !== 'PASS');
const mayClaim100 = unresolved.length === 0 && gate.hundred_percent_rule?.all_required_gates_must_pass === true;
assert(gate.completion_claim === (mayClaim100 ? '100_PERCENT_EVIDENCED' : 'NOT_100_PERCENT'), 'Completion claim does not match gate evidence.');
assert(gate.hundred_percent_rule?.unresolved_p0_allowed === 0, '100% must allow zero unresolved P0s.');
assert(gate.hundred_percent_rule?.g5_separate_owner_decision === true, 'G5 must remain a separate Program Owner decision.');

if (errors.length) {
  console.error(`Global-standard preproduction gate: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log('Global-standard preproduction gate: PASS');
console.log(`Required gates: ${gate.required_gates.length}`);
console.log(`Unresolved gates: ${unresolved.length}`);
console.log(`Completion claim: ${gate.completion_claim}`);
console.log(`Production: ${gate.production}`);
