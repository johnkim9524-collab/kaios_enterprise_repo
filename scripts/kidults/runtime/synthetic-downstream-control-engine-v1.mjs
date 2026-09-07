import crypto from 'node:crypto';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const OBJECT = /^kir-fixture:[a-z0-9-]+:object-[0-9]{2}$/;
const req = (condition, code) => { if (!condition) throw new Error(code); };

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function syntheticControlDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function exact(value, keys, code) {
  req(value && typeof value === 'object' && !Array.isArray(value), code);
  const own = Object.keys(value);
  req(own.length === keys.length && own.every(key => keys.includes(key)), code);
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export function createSyntheticCandidateControl(input) {
  exact(input, ['canonical_object_id', 'provenance_digest'], 'SMT_CANDIDATE_INPUT_SCHEMA');
  req(OBJECT.test(input.canonical_object_id), 'SMT_CANDIDATE_NAMESPACE');
  req(SHA256.test(input.provenance_digest), 'SMT_CANDIDATE_PROVENANCE');
  const evidence = {
    schema_version:'synthetic-evidence-control-v1',
    evidence_id:`evidence:${input.canonical_object_id}`,
    canonical_object_id:input.canonical_object_id,
    provenance_digest:input.provenance_digest,
    synthetic:true, empirical:false, rights_state:'CONTROL_ONLY', promotable:false
  };
  const candidate = {
    schema_version:'synthetic-candidate-control-v1',
    candidate_id:`candidate:${input.canonical_object_id}`,
    canonical_object_id:input.canonical_object_id,
    evidence_digest:syntheticControlDigest(evidence),
    synthetic:true, empirical:false, rankable:false, promotable:false
  };
  return freeze({evidence, candidate});
}

export function assessSyntheticTrackBControl(input) {
  exact(input, ['evidence', 'candidate'], 'SMT_TRACK_B_INPUT_SCHEMA');
  const {evidence, candidate} = input;
  req(evidence?.schema_version === 'synthetic-evidence-control-v1', 'SMT_TRACK_B_EVIDENCE_SCHEMA');
  req(candidate?.schema_version === 'synthetic-candidate-control-v1', 'SMT_TRACK_B_CANDIDATE_SCHEMA');
  req(evidence.canonical_object_id === candidate.canonical_object_id, 'SMT_TRACK_B_OBJECT_BINDING');
  req(candidate.evidence_digest === syntheticControlDigest(evidence), 'SMT_TRACK_B_EVIDENCE_DIGEST');
  req(evidence.synthetic === true && evidence.empirical === false && evidence.rights_state === 'CONTROL_ONLY', 'SMT_TRACK_B_EVIDENCE_AUTHORITY');
  req(candidate.synthetic === true && candidate.empirical === false && candidate.rankable === false && candidate.promotable === false, 'SMT_TRACK_B_CANDIDATE_AUTHORITY');
  const assessment = {
    schema_version:'synthetic-track-b-control-v1',
    assessment_id:`assessment:${candidate.canonical_object_id}`,
    canonical_object_id:candidate.canonical_object_id,
    candidate_digest:syntheticControlDigest(candidate),
    evidence_digest:candidate.evidence_digest,
    decision:'CONTROL_PASS', rankable:false, promotable:false
  };
  return freeze(assessment);
}

export function buildSyntheticProjectionControl(input) {
  exact(input, ['evidence', 'candidate', 'assessment'], 'SMT_PROJECTION_INPUT_SCHEMA');
  const {evidence, candidate, assessment} = input;
  req(assessment?.schema_version === 'synthetic-track-b-control-v1', 'SMT_PROJECTION_ASSESSMENT_SCHEMA');
  req(assessment.canonical_object_id === candidate?.canonical_object_id && candidate.canonical_object_id === evidence?.canonical_object_id, 'SMT_PROJECTION_OBJECT_BINDING');
  req(assessment.candidate_digest === syntheticControlDigest(candidate), 'SMT_PROJECTION_CANDIDATE_DIGEST');
  req(assessment.evidence_digest === syntheticControlDigest(evidence), 'SMT_PROJECTION_EVIDENCE_DIGEST');
  req(assessment.decision === 'CONTROL_PASS' && assessment.rankable === false && assessment.promotable === false, 'SMT_PROJECTION_ASSESSMENT_AUTHORITY');
  req(candidate.synthetic === true && candidate.empirical === false && candidate.promotable === false, 'SMT_PROJECTION_CANDIDATE_AUTHORITY');
  const projection = {
    schema_version:'synthetic-projection-control-v1',
    projection_id:`projection:${candidate.canonical_object_id}`,
    canonical_object_id:candidate.canonical_object_id,
    state:'NO_PROJECTION', synthetic:true, promotable:false,
    production:false, public:false, customer_visible:false,
    pair_digest:syntheticControlDigest({candidate, evidence, assessment})
  };
  return freeze(projection);
}

export function runSyntheticDownstreamControlBatch(records) {
  req(Array.isArray(records) && records.length > 0 && records.length <= 10000, 'SMT_DOWNSTREAM_BATCH_SIZE');
  const ids = new Set();
  const outputs = records.map(record => {
    const {evidence, candidate} = createSyntheticCandidateControl(record);
    req(!ids.has(candidate.canonical_object_id), 'SMT_DOWNSTREAM_DUPLICATE_OBJECT');
    ids.add(candidate.canonical_object_id);
    const assessment = assessSyntheticTrackBControl({evidence, candidate});
    const projection = buildSyntheticProjectionControl({evidence, candidate, assessment});
    return freeze({object_id:candidate.canonical_object_id, evidence, candidate, assessment, projection, portal_state:'NO_PROJECTION', customer_visible:false});
  });
  req(new Set(outputs.map(output => output.projection.pair_digest)).size === outputs.length, 'SMT_DOWNSTREAM_DIGEST_COLLISION');
  return freeze(outputs);
}
