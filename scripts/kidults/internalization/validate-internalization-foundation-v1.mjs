import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const suites = [
  'scripts/kidults/internalization/validate-rights-intelligence-policy-v1.mjs',
  'scripts/kidults/internalization/validate-provider-economics-v1.mjs',
  'scripts/kidults/internalization/validate-source-reputation-v1.mjs',
  'scripts/kidults/internalization/validate-market-integrity-v1.mjs',
  'scripts/kidults/internalization/validate-canonical-ontology-evolution-v1.mjs',
  'scripts/kidults/internalization/validate-historical-learning-memory-v1.mjs',
  'scripts/kidults/internalization/validate-provider-removal-simulation-v1.mjs',
  'scripts/kidults/internalization/validate-provider-internalization-matrix-v1.mjs'
];

const removalPath = 'coordination/kidults/internalization/provider-removal-simulation-contract-v1.json';
const removal = JSON.parse(fs.readFileSync(removalPath, 'utf8'));
const errors = [];

const requiredInvariants = [
  'canonical_identity_continuity',
  'normalization_continuity',
  'methodology_continuity',
  'confidence_provenance_continuity',
  'historical_learning_continuity',
  'downstream_contract_continuity',
  'provider_adapter_replaceability'
];
const prohibited = [
  'provider_native_id_as_canonical',
  'provider_taxonomy_as_canonical_ontology',
  'provider_score_as_kidults_score',
  'provider_direct_to_portal',
  'provider_direct_to_index',
  'single_provider_global_truth'
];

if (removal.contract_id !== 'KIDULTS_PROVIDER_REMOVAL_SIMULATION_V1') errors.push('invalid removal simulation contract id');
for (const x of requiredInvariants) if (!removal.required_continuity_invariants?.includes(x)) errors.push(`missing continuity invariant: ${x}`);
for (const x of prohibited) if (!removal.prohibited_dependencies?.includes(x)) errors.push(`missing prohibited dependency: ${x}`);
if (removal.non_bypass?.production !== 'HOLD') errors.push('production boundary drift');
if (removal.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('g5 boundary drift');
if (removal.non_bypass?.external_spend !== 'EXPLICIT_APPROVAL_REQUIRED') errors.push('external spend boundary drift');

const suiteResults = [];
for (const suite of suites) {
  if (!fs.existsSync(suite)) {
    errors.push(`missing validator: ${suite}`);
    continue;
  }
  const r = spawnSync(process.execPath, [suite], { encoding: 'utf8' });
  suiteResults.push({ suite, status: r.status, stdout: r.stdout?.trim(), stderr: r.stderr?.trim() });
  if (r.status !== 0) errors.push(`validator failed: ${suite}: ${r.stderr || r.stdout}`);
}

if (errors.length) {
  console.error(JSON.stringify({ suite: 'KIDULTS_INTERNALIZATION_FOUNDATION_V1', result: 'FAIL', errors, suiteResults }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_INTERNALIZATION_FOUNDATION_V1',
  result: 'PASS',
  component_validators: suites.length,
  provider_removal_invariants: removal.required_continuity_invariants.length,
  prohibited_dependencies: removal.prohibited_dependencies.length,
  production: removal.non_bypass.production,
  g5: removal.non_bypass.g5,
  suiteResults
}, null, 2));
