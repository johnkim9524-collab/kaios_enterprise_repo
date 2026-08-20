import fs from 'node:fs';
import { createHash } from 'node:crypto';

const [samplingPath, outPath = '/tmp/provenance-aggregate-blind60-r1.json', ...packetPaths] = process.argv.slice(2);
if (!samplingPath || packetPaths.length < 1) {
  throw new Error('usage: build-provenance-aggregate-blind60-r1 <sampling-plan> <out> <packet...>');
}

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sampling = JSON.parse(fs.readFileSync(samplingPath, 'utf8'));
const target = (sampling.strata || []).find((x) => x.stratum_id === 'er-stratum-provenance-unique-object');
if (!target || target.cases !== 120 || target.blind !== 60) throw new Error('PROVENANCE_SAMPLING_TARGET_INVALID');
if (sampling.production !== 'HOLD') throw new Error('SAMPLING_PRODUCTION_BOUNDARY_WEAKENED');

const packets = packetPaths.map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
const cases = [];
for (const packet of packets) {
  if (packet.stratum_id !== target.stratum_id) throw new Error('WRONG_STRATUM_PACKET');
  if (packet.production !== 'HOLD' || packet.public_release !== 'HOLD') throw new Error('PACKET_RELEASE_BOUNDARY_WEAKENED');
  for (const c of packet.cases || []) {
    if (!c.case_id || c.stratum_id !== target.stratum_id) throw new Error('CASE_ID_OR_STRATUM_INVALID');
    if (c.rights_state !== 'ALLOW') throw new Error(`RIGHTS_NOT_ALLOW:${c.case_id}`);
    if (c.label != null) throw new Error(`LABEL_PRESENT:${c.case_id}`);
    if (c.model_prediction != null) throw new Error(`MODEL_PREDICTION_PRESENT:${c.case_id}`);
    cases.push(c);
  }
}

if (cases.length !== target.cases) throw new Error(`EXACT_120_REQUIRED:${cases.length}`);
const caseIds = cases.map((c) => c.case_id);
if (new Set(caseIds).size !== caseIds.length) throw new Error('DUPLICATE_CASE_ID');

const countBy = (key) => cases.reduce((acc, c) => {
  const v = c[key];
  acc[v] = (acc[v] || 0) + 1;
  return acc;
}, {});
const assertExactCounts = (actual, expected, label) => {
  const a = JSON.stringify(Object.fromEntries(Object.entries(actual).sort()));
  const e = JSON.stringify(Object.fromEntries(Object.entries(expected).sort()));
  if (a !== e) throw new Error(`${label}_MISMATCH:${a}:${e}`);
};
assertExactCounts(countBy('case_class'), target.case_class_targets, 'CASE_CLASS');
assertExactCounts(countBy('identity_boundary'), target.identity_boundary_targets, 'IDENTITY_BOUNDARY');

const domain = 'KIDULTS_ER_PROVENANCE_AGGREGATE_BLIND60_R1\u0000';
const ranked = [...caseIds]
  .map((caseId) => ({ case_id: caseId, rank_hash: sha256(`${domain}${caseId}`) }))
  .sort((a, b) => a.rank_hash.localeCompare(b.rank_hash) || a.case_id.localeCompare(b.case_id));
const selected = ranked.slice(0, target.blind);
if (selected.length !== 60 || new Set(selected.map((x) => x.case_id)).size !== 60) throw new Error('EXACT_60_BLIND_REQUIRED');

const sortedCaseIds = [...caseIds].sort();
const selectedIds = selected.map((x) => x.case_id);
const artifact = {
  id: 'kidults-er-provenance-aggregate-blind60-r1',
  version: '1.0.0',
  status: 'EXACT_60_PREMODEL_BLIND_CANDIDATES_READY_UNSEALED',
  parent_issue: 609,
  stratum_id: target.stratum_id,
  truth_boundary: 'This artifact repairs packet-local floor-rounding by selecting the blind candidate set once over the complete 120-case Provenance stratum. It creates no labels, reviewers, adjudication, model result, empirical PASS, Track B PASS, public release or Production authority.',
  source_case_count: cases.length,
  target_blind_count: target.blind,
  selection_method: 'SHA256_DOMAIN_SEPARATED_CASE_ID_RANK_FIRST_60',
  case_set_sha256: sha256(sortedCaseIds.join('\n')),
  blind_partition_sha256: sha256(selectedIds.join('\n')),
  blind_partition_state: 'CANDIDATE_NOT_SEALED',
  blind_case_ids: selectedIds,
  labels_present: false,
  model_predictions_present: false,
  reviewer_a: 'NOT_ASSIGNED',
  reviewer_b: 'NOT_ASSIGNED',
  adjudication: 'NOT_STARTED',
  empirical_pass: false,
  track_b: 'NOT_STARTED',
  public_release: 'HOLD',
  production: 'HOLD'
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (/source_[ab]_(reference|payload)|license_evidence|provenance_refs|reviewer_prompt_context|"label"\s*:|"model_prediction"\s*:/.test(serialized)) {
  throw new Error('PUBLIC_BLIND_MANIFEST_LEAKAGE');
}
fs.writeFileSync(outPath, serialized);
console.log(JSON.stringify({
  status: artifact.status,
  source_case_count: artifact.source_case_count,
  blind_candidate_count: artifact.blind_case_ids.length,
  case_set_sha256: artifact.case_set_sha256,
  blind_partition_sha256: artifact.blind_partition_sha256,
  production: artifact.production
}));