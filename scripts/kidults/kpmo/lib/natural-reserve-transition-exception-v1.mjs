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

const bootstrapTransition=JSON.parse('{"id":"NATURAL_CHAIN_ORCHESTRATION_REPAIR_PR2584_V1","paths":[".github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml",".github/workflows/kidults-asi-p1-source-preflight-v1.yml",".github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml",".github/workflows/kidults-asi-sharded-source-reserve-v1.yml",".github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml",".github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml","coordination/kidults/governance/approval-policy-file-manifest-v1.json","coordination/kidults/governance/approval-policy-inventory-v1.json","scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs","scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs","scripts/kidults/kpmo/validate-continuous-assurance-success-authority-gate-v1.mjs","scripts/kidults/kpmo/wait-exact-sha-producer-cohort-v1.mjs","scripts/kidults/kpmo/wait-for-natural-sentinel-terminal-v1.mjs","scripts/kidults/source-intelligence/validate-asi-sharded-source-reserve-provenance-v1.mjs","tests/kidults/kpmo/sentinel-trigger-v1.test.mjs","tests/kidults/kpmo/wait-exact-sha-producer-cohort-v1.test.mjs"],"require_complete_path_set":true,"content_binding":"EXACT_IMMUTABLE_BASE_HEAD_SHA256","content_digests":[{"path":".github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml","base_sha256":"sha256:08c3083c5db4b00ebc58880f17ad256c8ffccc953016be133823ff05f0575d18","head_sha256":"sha256:bbdaa099e164d710dd5c5139331139228f52cf4c8da925517dd10b09d119077c"},{"path":".github/workflows/kidults-asi-p1-source-preflight-v1.yml","base_sha256":"sha256:0e1ef1eb8150218c128c4d677ec272426735cb353df5292edd07587eb59d0a10","head_sha256":"sha256:126abe06819dec1415fb28d511fcfe18234e616fde13b48d50d3191dace20271"},{"path":".github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml","base_sha256":"sha256:c54df2d62451fe74fd03a03898dcf06d180819f8de9dd96f2a2637dc5efb1f05","head_sha256":"sha256:b8053d2703fa4967cdc67553a647a0cbf6dfd76d5fd7992943473ea074eef28a"},{"path":".github/workflows/kidults-asi-sharded-source-reserve-v1.yml","base_sha256":"sha256:572e65be92c513896686efb68aa86e3cb0c9ebb6726acfd4ffaa88696b983133","head_sha256":"sha256:9ef361c29c8362203bac48bcacc5a6c9312f2e3e838d0fd1eae4589c08b854bb"},{"path":".github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml","base_sha256":"sha256:a9467ff04780bf6bc605643fa312d140541a553beb5d797d942729bd9f8c3d13","head_sha256":"sha256:c73369c3e63529db93163a4ae5aeabf07f49ffbd93c79d6848f008f51a8a12b1"},{"path":".github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml","base_sha256":"sha256:7e19943748445c75993880c9194f2fbba0f0bf39653aff2815a48a90bb195464","head_sha256":"sha256:7a4726a257e1876f8fd18870de2d4bcbcbdbb31515f3c168ec5d0c7ee04caff9"},{"path":"coordination/kidults/governance/approval-policy-file-manifest-v1.json","base_sha256":"sha256:63b1594742cc6e990987c45459e3afc63f53b85ebc834a8438b62e15edaf63d8","head_sha256":"sha256:f3fcc670085350cf6ba33dbb02ec097ddd4d0b637a9ba9917919034a5ee60590"},{"path":"coordination/kidults/governance/approval-policy-inventory-v1.json","base_sha256":"sha256:4140e3a1fd9ac204427b48c68ff87470016bf02bc05cdcb013d3662aa57f6a42","head_sha256":"sha256:b9a00c7a72c8b8f97aa6451c8aa0f4626ab9d886ac6955835bff12beda7fd7"},{"path":"scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs","base_sha256":"sha256:9d04c43aa0732c81f43051741ad573eb5aa6623d5735f15d09320adb06e5b274","head_sha256":"sha256:adfee7a39c3f39b9046ed70df2161e0f89d549cb4a5e2097935dc34d69b08900"},{"path":"scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs","base_sha256":"sha256:b2c140bcc26b3edaba49b4a6784e752c504149d7bca4f295acd4ff00d851b980","head_sha256":"sha256:d81c274d56346e871feaa82e24c8b8217329142cb51d2ad4d0799dec88cd2769"},{"path":"scripts/kidults/kpmo/validate-continuous-assurance-success-authority-gate-v1.mjs","base_sha256":"sha256:5b7d950c6ed517d28b6574b81d9c83e789b888f0a5e952759bcf6f53304cfb06","head_sha256":"sha256:b65a8aeca470eab694a1f6a4ff620742a55152f6e2160e5214a25515eb32f9f1"},{"path":"scripts/kidults/kpmo/wait-exact-sha-producer-cohort-v1.mjs","base_sha256":"sha256:947b5662b8aac9c7859670a91528545e98fa57d7cb3faca1f68cb94dcf4c9c43","head_sha256":"sha256:6eb35718cabc980f44a431c291fc387f57d7f60e2112bf675c6d47d5bf752684"},{"path":"scripts/kidults/kpmo/wait-for-natural-sentinel-terminal-v1.mjs","base_sha256":"sha256:eaa22e567ed946b0e000572046aa73acf53e71f4ffbdbf1ebfe9b7f6c4d4e496","head_sha256":"sha256:451aaa67dd5ac4fb0bf3d26227efa02ad7474fb6d04d376c7e2edbf2d1b1ca47"},{"path":"scripts/kidults/source-intelligence/validate-asi-sharded-source-reserve-provenance-v1.mjs","base_sha256":"sha256:35a0037c60adfc2f58b8aa253cfbea5fb93caeebd1f704698b2ce1ebdd4628a5","head_sha256":"sha256:8c2f6c38773c305d346146c7c956191a194eb48afa523da653942e2bd6564e5f"},{"path":"tests/kidults/kpmo/sentinel-trigger-v1.test.mjs","base_sha256":"sha256:76a0175cb1999e743aa8bc923fd7b40ac0a60d8e13ed1dd3c3adce24bb0cdc87","head_sha256":"sha256:a137fb844bbd714aea53381b4af7c44a64d804e6f31ba1b3d16ccf91631af8a6"},{"path":"tests/kidults/kpmo/wait-exact-sha-producer-cohort-v1.test.mjs","base_sha256":"sha256:0234e36bb6a8a8ed358d15384f062a7eac6e73b839f41b2943a7e34ba54c0cc8","head_sha256":"sha256:f8e5295d86d4335bdfc508380342edc3fb54f3b1cc3734d3a1a3a3ff2c988a49"}]}');

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
  if (matchesConfiguredTransition({files, policy:{delegated_internal_transition_exceptions:[bootstrapTransition]}, exceptionId:bootstrapTransition.id})) return bootstrapTransition.id;
  return null;
};

export const naturalReserveTransitionId = ({files, policy}) =>
  matchesNaturalReserveTransition({files, policy}) ? 'NATURAL_RESERVE_CHAIN_REPAIR_V1' : null;
