#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function readText(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

export function validateTrackACurrentSoldOwnership({
  jd,
  engine,
  readiness,
  readme,
  directive,
}) {
  assert(jd?.id === 'kidults-track-a-current-sold-job-description-v1', 'TRACK_A_CURRENT_SOLD_JD_ID_INVALID');
  assert(jd.primary_track === 'TRACK_A' && jd.accountable_track === 'TRACK_A',
    'TRACK_A_CURRENT_SOLD_ACCOUNTABILITY_INVALID');
  assert(jd.product_owner === 'KIDULTS', 'TRACK_A_CURRENT_SOLD_PRODUCT_OWNER_INVALID');
  assert(jd.governance_owner === 'KPMO', 'TRACK_A_CURRENT_SOLD_GOVERNANCE_OWNER_INVALID');
  assert(jd.runtime_owner === 'ASI', 'TRACK_A_CURRENT_SOLD_RUNTIME_OWNER_INVALID');
  assert(jd.raci?.TRACK_A?.role === 'ACCOUNTABLE_AND_RESPONSIBLE',
    'TRACK_A_CURRENT_SOLD_RACI_TRACK_A_INVALID');
  assert(jd.raci?.TRACK_Z?.role === 'UPSTREAM_RESPONSIBLE',
    'TRACK_A_CURRENT_SOLD_RACI_TRACK_Z_INVALID');
  assert(jd.raci?.TRACK_D?.role === 'PERSISTENCE_AND_RUNTIME_SUPPORT',
    'TRACK_A_CURRENT_SOLD_RACI_TRACK_D_INVALID');
  assert(jd.raci?.TRACK_B?.role === 'INDEPENDENT_DOWNSTREAM_VALIDATOR',
    'TRACK_A_CURRENT_SOLD_RACI_TRACK_B_INVALID');
  assert(jd.handoff_contract?.to_track_b ===
      'EXACT_IMMUTABLE_SNAPSHOT_CANDIDATE_PLUS_EVIDENCE_PACKAGE_ONLY',
    'TRACK_A_CURRENT_SOLD_HANDOFF_INVALID');
  assert(jd.handoff_contract.track_b_may_mutate_evidence === false,
    'TRACK_A_CURRENT_SOLD_TRACK_B_MUTATION_INVALID');
  assert(jd.handoff_contract.track_a_may_self_approve === false,
    'TRACK_A_CURRENT_SOLD_SELF_APPROVAL_INVALID');
  for (const forbidden of [
    'TRACK_A_DIRECT_PUBLICATION',
    'TRACK_A_PRODUCTION_APPROVAL',
    'CONTROL_SYNTHETIC_AS_EMPIRICAL',
    'PRIVATE_CANDIDATE_AS_LAWFUL_EMPIRICAL',
  ]) {
    assert(jd.prohibited_actions_and_claims?.includes(forbidden),
      'TRACK_A_CURRENT_SOLD_PROHIBITION_MISSING', forbidden);
  }

  assert(engine?.product_owner === 'KIDULTS', 'TRACK_A_CURRENT_SOLD_ENGINE_PRODUCT_OWNER_DRIFT');
  assert(engine?.governance_owner === 'KPMO', 'TRACK_A_CURRENT_SOLD_ENGINE_GOVERNANCE_OWNER_DRIFT');
  assert(engine?.runtime_owner === 'ASI', 'TRACK_A_CURRENT_SOLD_ENGINE_RUNTIME_OWNER_DRIFT');
  assert(Array.isArray(engine?.canonical_chain) && engine.canonical_chain.includes('TRACK_B'),
    'TRACK_A_CURRENT_SOLD_ENGINE_TRACK_B_CHAIN_MISSING');

  assert(readiness?.primary_track === 'TRACK_A', 'TRACK_A_CURRENT_SOLD_READINESS_OWNER_DRIFT');
  assert(
    readiness?.overall_state === 'CORE_ENGINE_COMPLETE_EMPIRICAL_RUNTIME_AND_PRODUCT_CHAIN_NOT_COMPLETE',
    'TRACK_A_CURRENT_SOLD_READINESS_TRUTH_INVALID'
  );
  assert(readiness?.truth_boundary?.lawful_empirical_current_sold_admitted === 0,
    'TRACK_A_CURRENT_SOLD_FALSE_EMPIRICAL');
  assert(readiness?.truth_boundary?.public === 'HOLD' &&
      readiness?.truth_boundary?.production === 'HOLD' &&
      readiness?.truth_boundary?.g5 === 'HOLD',
    'TRACK_A_CURRENT_SOLD_RELEASE_BOUNDARY_INVALID');

  assert(readme.includes('Track A — Intelligence Factory & Current-SOLD Engine'),
    'TRACK_A_CURRENT_SOLD_README_ASSIGNMENT_MISSING');
  assert(readme.includes('Track Z: lawful source, provider and rights authority'),
    'TRACK_A_CURRENT_SOLD_README_UPSTREAM_MISSING');
  assert(directive.includes('Track A is accountable for the Current-SOLD engine'),
    'TRACK_A_CURRENT_SOLD_DIRECTIVE_ASSIGNMENT_MISSING');
  assert(directive.includes('Track B remains an independent downstream validator'),
    'TRACK_A_CURRENT_SOLD_DIRECTIVE_TRACK_B_BOUNDARY_MISSING');

  return {
    state: 'PASS',
    primary_track: 'TRACK_A',
    runtime_owner: 'ASI',
    governance_owner: 'KPMO',
    upstream_owner: 'TRACK_Z',
    persistence_owner: 'TRACK_D',
    downstream_validator: 'TRACK_B',
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}

export function validateTrackACurrentSoldOwnershipFromRepository(rootDirectory = process.cwd()) {
  const root = path.resolve(rootDirectory);
  return validateTrackACurrentSoldOwnership({
    jd: readJson(root, 'coordination/kidults/governance/track-a-current-sold-job-description-v1.json'),
    engine: readJson(root, 'coordination/kidults/market/current-sold-engine-v1.json'),
    readiness: readJson(root, 'coordination/kidults/market/current-sold-value-chain-readiness-v1.json'),
    readme: readText(root, 'coordination/kidults/README.md'),
    directive: readText(root, 'docs/kidults/platform-track-alignment-directive-v1.md'),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(validateTrackACurrentSoldOwnershipFromRepository(process.argv[2] || process.cwd()), null, 2));
}
