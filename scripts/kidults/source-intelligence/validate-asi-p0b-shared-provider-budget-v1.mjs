#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath = '.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function validateWorkflow(source) {
  const required = [
    'Restore exact-main shared Source Fabric provider state',
    'scripts/kidults/supply-chain/restore-exact-github-artifact-v1.mjs',
    "--workflow-path .github/workflows/kidults-asi-source-fabric-scale-pi1.yml",
    "--workflow-name 'KIDULTS ASI Source Fabric Scale PI1'",
    '--artifact-name kidults-asi-source-fabric-scale-pi1',
    '--required-basename asi-public-metadata-source-fabric-v1.json',
    '--required-basename asi-discovery-provider-health-circuit-v1.json',
    'EXPECTED_PROTECTED_MAIN_SHA',
    '.producer_source_sha == env.EXPECTED_PROTECTED_MAIN_SHA',
    "provider_budget_authority:'KIDULTS_ASI_SOURCE_FABRIC_SCALE_PI1'",
    'provider_requests_issued_by_p0b:0',
    '/tmp/p0b-source-fabric-restore-receipt-v1.json',
    '/tmp/asi-discovery-provider-health-circuit-v1.json',
  ];
  for (const fragment of required) {
    if (!source.includes(fragment)) fail('P0B_SHARED_PROVIDER_INVARIANT_MISSING:' + fragment);
  }
  const forbidden = [
    'ASI_PROVIDER_CIRCUIT=/tmp/p0b-no-prior-circuit.json',
    '--allow-no-producer-history',
    '/tmp/p0b-rotations',
  ];
  for (const fragment of forbidden) {
    if (source.includes(fragment)) fail('P0B_DUPLICATE_PROVIDER_BUDGET_PRESENT:' + fragment);
  }
  const liveInvocation = /node\s+scripts\/kidults\/source-intelligence\/asi-openalex-gdelt-public-metadata-discovery-v1\.mjs\s+/;
  if (liveInvocation.test(source)) fail('P0B_LIVE_PROVIDER_INVOCATION_PRESENT');
  const restoreCount = (source.match(/node\s+scripts\/kidults\/supply-chain\/restore-exact-github-artifact-v1\.mjs\s+/g) || []).length;
  if (restoreCount !== 1) fail('P0B_RESTORE_EXECUTION_CARDINALITY_INVALID:' + restoreCount);
  return {
    state: 'VERIFIED_PASS',
    p0b_live_provider_invocations: 0,
    provider_budget_authority: 'KIDULTS_ASI_SOURCE_FABRIC_SCALE_PI1',
    exact_main_source_sha_bound: true,
    shared_circuit_required: true,
    restore_receipt_terminally_preserved: true,
    evidence_admission: 'NONE',
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

function expectReject(source, expectedPrefix) {
  try {
    validateWorkflow(source);
  } catch (error) {
    if (String(error.code || error.message).startsWith(expectedPrefix)) return;
    throw error;
  }
  fail('NEGATIVE_MUTATION_ACCEPTED:' + expectedPrefix);
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const receipt = validateWorkflow(source);
  expectReject(source.replace(
    "--workflow-path .github/workflows/kidults-asi-source-fabric-scale-pi1.yml",
    "--workflow-path .github/workflows/wrong-producer.yml",
  ), 'P0B_SHARED_PROVIDER_INVARIANT_MISSING');
  expectReject(source.replace(
    '--required-basename asi-discovery-provider-health-circuit-v1.json',
    '--required-basename wrong-circuit.json',
  ), 'P0B_SHARED_PROVIDER_INVARIANT_MISSING');
  expectReject(source.split('EXPECTED_PROTECTED_MAIN_SHA').join('UNBOUND_SOURCE_SHA'), 'P0B_SHARED_PROVIDER_INVARIANT_MISSING');
  expectReject(source + "\nnode scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs /tmp/x.json\n", 'P0B_LIVE_PROVIDER_INVOCATION_PRESENT');
  expectReject(source.split('/tmp/p0b-source-fabric-restore-receipt-v1.json').join('/tmp/missing-receipt.json'), 'P0B_SHARED_PROVIDER_INVARIANT_MISSING');
  process.stdout.write(JSON.stringify({
    ...receipt,
    negative_mutation_families_rejected: 5,
  }, null, 2) + '\n');
}
