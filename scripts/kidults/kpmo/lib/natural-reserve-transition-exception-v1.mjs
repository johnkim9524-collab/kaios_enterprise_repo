// Narrow, data-driven transition exceptions for reviewed internal repairs.
// Every exception remains exact: a partial file set, changed immutable content,
// or unavailable blobs remains Owner-reserved.

import crypto from 'node:crypto';

const normalizedLines = source => String(source ?? '')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));

const multiset = lines => {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
  return counts;
};

const difference = (left, right) => {
  const leftCounts = multiset(left);
  const rightCounts = multiset(right);
  const result = [];
  for (const [line, count] of leftCounts) {
    const remaining = count - (rightCounts.get(line) || 0);
    for (let index = 0; index < remaining; index += 1) result.push(line);
  }
  return result.sort();
};

const sorted = value => [...value].sort();
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

const configuredExceptions = policy => {
  const values = policy?.delegated_internal_transition_exceptions;
  return Array.isArray(values) ? values.filter(value => value && typeof value.id === 'string') : [];
};

const contentDigest = source => `sha256:${crypto.createHash('sha256').update(String(source ?? '')).digest('hex')}`;

const matchesConfiguredTransition = ({files, policy, exceptionId}) => {
  const exception = configuredExceptions(policy).find(value => value.id === exceptionId) || null;
  if (!exception || !Array.isArray(files) || !files.length) return false;
  const expectedPaths = [...new Set(exception.paths || [])].sort();
  const actualPaths = files.map(file => file?.filename).filter(Boolean).sort();
  if (exception.require_complete_path_set !== false && !same(actualPaths, expectedPaths)) return false;
  if (!same(actualPaths, expectedPaths)) return false;

  const contentDigests = new Map((exception.content_digests || []).map(value => [value.path, value]));
  if (contentDigests.size) {
    for (const file of files) {
      if (typeof file?.base_content !== 'string' || typeof file?.head_content !== 'string') return false;
      const expected = contentDigests.get(file.filename);
      if (!expected || contentDigest(file.base_content) !== expected.base_sha256 || contentDigest(file.head_content) !== expected.head_sha256) return false;
    }
    return true;
  }

  const changes = new Map((exception.changes || []).map(value => [value.path, value]));
  for (const file of files) {
    if (typeof file?.base_content !== 'string' || typeof file?.head_content !== 'string') return false;
    const expected = changes.get(file.filename);
    if (!expected) return false;
    const before = normalizedLines(file.base_content);
    const after = normalizedLines(file.head_content);
    if (!same(difference(before, after), expected.removed || [])) return false;
    if (!same(difference(after, before), expected.added || [])) return false;
  }
  return true;
};

const narrowContentDigests = new Map([
  ['.github/workflows/kidults-asi-sharded-source-reserve-v1.yml', {
    base: 'sha256:572e65be92c513896686efb68aa86e3cb0c9ebb6726acfd4ffaa88696b983133',
    head: 'sha256:9ef361c29c8362203bac48bcacc5a6c9312f2e3e838d0fd1eae4589c08b854bb'
  }],
  ['scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs', {
    base: 'sha256:b2c140bcc26b3edaba49b4a6784e752c504149d7bca4f295acd4ff00d851b980',
    head: 'sha256:d81c274d56346e871feaa82e24c8b8217329142cb51d2ad4d0799dec88cd2769'
  }]
]);

export const matchesNarrowNaturalChainRepairFile = ({filename, base_content, head_content}) => {
  const expected = narrowContentDigests.get(filename);
  if (!expected || typeof base_content !== 'string' || typeof head_content !== 'string') return false;
  return contentDigest(base_content) === expected.base && contentDigest(head_content) === expected.head;
};

export const matchesFinalizerReadyEvidenceTransitionFile = ({filename, base_content, head_content}) => {
  if (filename !== 'scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs') return false;
  let transformed = String(base_content ?? '');
  const replacements = [
    [
      `      const eventToken=await acquireEventToken();
      await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});
      invokeFinalizerWriter({
        action:'CREATE_RESERVATION',
        authorization_generation:envelope.authorization_generation,
        nonce_digest:envelope.nonce_digest,
        run_id:required('GITHUB_RUN_ID'),
        head_sha:envelope.head_sha,
      });
`,
      `      invokeFinalizerWriter({
        action:'CREATE_RESERVATION',
        authorization_generation:envelope.authorization_generation,
        nonce_digest:envelope.nonce_digest,
        run_id:required('GITHUB_RUN_ID'),
        head_sha:envelope.head_sha,
      });
      const eventToken=await acquireEventToken();
      await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});
`,
    ],
    [
      'const validateLiveCandidate = async ({allowDraft=false,includeLandingStatus=true,requireEnvelopeBinding=true}={}) => {',
      'const validateLiveCandidate = async ({allowDraft=false,includeLandingStatus=true,requireEnvelopeBinding=true,preserveDraftDevelopmentEvidence=false}={}) => {',
    ],
    [
      'liveRequiredChecks({includeLandingStatus,draftDevelopment:requireEnvelopeBinding?envelopeRequiresDraftDevelopment:pr.draft===true})',
      'liveRequiredChecks({includeLandingStatus,draftDevelopment:preserveDraftDevelopmentEvidence||(requireEnvelopeBinding?envelopeRequiresDraftDevelopment:pr.draft===true)})',
    ],
    [
      'const waitForReadyCandidate = async () => {',
      'const waitForReadyCandidate = async ({preserveDraftDevelopmentEvidence=false}={}) => {',
    ],
    [
      'validateLiveCandidate({includeLandingStatus:false,requireEnvelopeBinding:false})',
      'validateLiveCandidate({includeLandingStatus:false,requireEnvelopeBinding:false,preserveDraftDevelopmentEvidence})',
    ],
    [
      'await waitForReadyCandidate();',
      'await waitForReadyCandidate({preserveDraftDevelopmentEvidence:candidate.pr.draft===true});',
    ],
  ];
  for (const [before, after] of replacements) {
    if (!transformed.includes(before)) return false;
    transformed = transformed.replace(before, after);
  }
  return transformed === String(head_content ?? '');
};

export const matchesNaturalReserveTransition = ({files, policy}) =>
  matchesConfiguredTransition({files, policy, exceptionId:'NATURAL_RESERVE_CHAIN_REPAIR_V1'});

export const matchesNaturalClockTransition = ({files, policy}) =>
  matchesConfiguredTransition({files, policy, exceptionId:'NATURAL_CLOCK_DUAL_SOURCE_REPAIR_V1'});

export const delegatedTransitionId = ({files, policy}) => {
  for (const exception of configuredExceptions(policy)) {
    if (matchesConfiguredTransition({files, policy, exceptionId:exception.id})) return exception.id;
  }
  return null;
};

export const naturalReserveTransitionId = ({files, policy}) =>
  matchesNaturalReserveTransition({files, policy}) ? 'NATURAL_RESERVE_CHAIN_REPAIR_V1' : null;
