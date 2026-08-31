import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CONTROL_TOWER_SOURCE_PATHS = Object.freeze({
  tower_contract: 'coordination/kidults/governance/management-control-tower-contract-v1.json',
  rights_fast_lane: 'coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json',
  preflight: 'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json',
  alignment: 'coordination/kidults/governance/current-sold-sample-governance-alignment-v1.json',
  sample_policy: 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json',
  release_assurance: 'coordination/kidults/governance/release-assurance-contract-v1.json',
  production_promotion: 'contracts/certification/kidults-controlled-production-promotion.v1.json'
});

export const CONTROL_TOWER_REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
export const CONTROL_TOWER_WORKFLOW_PATH = '.github/workflows/kidults-management-control-tower-refresh-v1.yml';
export const CONTROL_TOWER_COMPONENT_PATHS = Object.freeze({
  builder: 'scripts/kidults/kpmo/build-management-control-tower-snapshot-v1.mjs',
  model: 'scripts/kidults/kpmo/lib/management-control-tower-model-v1.mjs',
  validator: 'scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs'
});
export const CONTROL_TOWER_EVIDENCE_TIME_FIELDS = Object.freeze({
  rights_fast_lane: 'as_of',
  preflight: 'as_of',
  alignment: 'effective_at'
});

export const sha256Text = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;

export function resolveControlTowerRoot() {
  const cwdRoot = resolve(process.cwd());
  const requested = process.env.KIDULTS_REPO_ROOT ? resolve(process.env.KIDULTS_REPO_ROOT) : cwdRoot;
  if (requested !== cwdRoot && process.env.KIDULTS_ALLOW_TEST_ROOT !== '1') {
    throw new Error('CONTROL_TOWER_REPO_ROOT_OVERRIDE_FORBIDDEN');
  }
  return requested;
}

export function loadControlTowerSources(root) {
  return Object.fromEntries(Object.entries(CONTROL_TOWER_SOURCE_PATHS).map(([name, relative]) => {
    const text = readFileSync(resolve(root, relative), 'utf8');
    return [name, { path: relative, text, json: JSON.parse(text), digest: sha256Text(text) }];
  }));
}

function componentDigests(root) {
  return Object.fromEntries(Object.entries(CONTROL_TOWER_COMPONENT_PATHS).map(([name, relative]) => [
    name,
    sha256Text(readFileSync(resolve(root, relative), 'utf8'))
  ]));
}

export function resolveControlTowerProducer(root, environment = process.env) {
  const components = componentDigests(root);
  if (environment.GITHUB_ACTIONS !== 'true') {
    return {
      generation_class: 'LOCAL_VERIFIED_FALLBACK',
      repository: CONTROL_TOWER_REPOSITORY,
      workflow_path: CONTROL_TOWER_WORKFLOW_PATH,
      workflow_ref: 'UNATTESTED',
      event_name: 'LOCAL_BUILD',
      trigger_ref: 'UNATTESTED',
      source_ref: 'UNATTESTED',
      source_sha: 'UNATTESTED',
      run_id: 'UNATTESTED',
      run_attempt: 'UNATTESTED',
      artifact_name: 'kidults-management-control-tower-local-fallback',
      component_digests: components
    };
  }

  const required = name => {
    const value = environment[name];
    if (typeof value !== 'string' || value.length === 0) throw new Error(`CONTROL_TOWER_PRODUCER_ENV_MISSING:${name}`);
    return value;
  };
  const generationClass = required('KIDULTS_CONTROL_TOWER_GENERATION_CLASS');
  const eventName = required('GITHUB_EVENT_NAME');
  const triggerRef = required('GITHUB_REF');
  const sourceRef = generationClass === 'CANDIDATE_PR'
    ? `refs/heads/${required('GITHUB_HEAD_REF')}`
    : triggerRef;
  const sourceSha = required('KIDULTS_EXACT_SOURCE_SHA');
  const runId = required('GITHUB_RUN_ID');
  const runAttempt = required('GITHUB_RUN_ATTEMPT');
  const artifactName = required('KIDULTS_CONTROL_TOWER_ARTIFACT_NAME');
  const workflowRef = required('GITHUB_WORKFLOW_REF');
  if (required('GITHUB_REPOSITORY') !== CONTROL_TOWER_REPOSITORY) throw new Error('CONTROL_TOWER_PRODUCER_REPOSITORY');
  if (!workflowRef.includes(`${CONTROL_TOWER_WORKFLOW_PATH}@`)) throw new Error('CONTROL_TOWER_PRODUCER_WORKFLOW_REF');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('CONTROL_TOWER_PRODUCER_SOURCE_SHA');
  if (!/^[1-9][0-9]*$/.test(runId) || !/^[1-9][0-9]*$/.test(runAttempt)) throw new Error('CONTROL_TOWER_PRODUCER_RUN_IDENTITY');
  if (generationClass === 'CANDIDATE_PR') {
    if (eventName !== 'pull_request' || !triggerRef.startsWith('refs/pull/')) throw new Error('CONTROL_TOWER_CANDIDATE_PRODUCER_BOUNDARY');
    if (artifactName !== `kidults-management-control-tower-candidate-${sourceSha}-${runId}-${runAttempt}`) throw new Error('CONTROL_TOWER_CANDIDATE_ARTIFACT_IDENTITY');
  } else if (generationClass === 'CANONICAL_MAIN') {
    if (!['push', 'schedule', 'workflow_dispatch'].includes(eventName) || triggerRef !== 'refs/heads/main') throw new Error('CONTROL_TOWER_CANONICAL_PRODUCER_BOUNDARY');
    if (artifactName !== `kidults-management-control-tower-canonical-${sourceSha}-${runId}-${runAttempt}`) throw new Error('CONTROL_TOWER_CANONICAL_ARTIFACT_IDENTITY');
  } else {
    throw new Error('CONTROL_TOWER_PRODUCER_GENERATION_CLASS');
  }
  return {
    generation_class: generationClass,
    repository: CONTROL_TOWER_REPOSITORY,
    workflow_path: CONTROL_TOWER_WORKFLOW_PATH,
    workflow_ref: workflowRef,
    event_name: eventName,
    trigger_ref: triggerRef,
    source_ref: sourceRef,
    source_sha: sourceSha,
    run_id: runId,
    run_attempt: runAttempt,
    artifact_name: artifactName,
    component_digests: components
  };
}

export function buildControlTowerModel(sources, generatedAt, producer) {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('CONTROL_TOWER_GENERATED_AT_INVALID');
  if (!producer || typeof producer !== 'object') throw new Error('CONTROL_TOWER_PRODUCER_REQUIRED');
  const rights = sources.rights_fast_lane.json;
  const preflight = sources.preflight.json;
  const alignment = sources.alignment.json;
  const samplePolicy = sources.sample_policy.json;
  const productionPromotion = sources.production_promotion.json;
  const contract = sources.tower_contract.json;
  if (contract.id !== 'kidults-management-control-tower-contract-v1' || contract.version !== '1.1.0') {
    throw new Error('CONTROL_TOWER_CONTRACT_IDENTITY');
  }
  const expectedSourceContracts = Object.entries(CONTROL_TOWER_SOURCE_PATHS)
    .filter(([name]) => name !== 'tower_contract')
    .map(([, path]) => path);
  if (JSON.stringify(contract.source_contracts) !== JSON.stringify(expectedSourceContracts)) {
    throw new Error('CONTROL_TOWER_SOURCE_CONTRACT_POLICY');
  }
  if (JSON.stringify(contract.snapshot_integrity?.evidence_time_sources) !== JSON.stringify(Object.keys(CONTROL_TOWER_EVIDENCE_TIME_FIELDS))) {
    throw new Error('CONTROL_TOWER_EVIDENCE_TIME_SOURCE_POLICY');
  }
  const producerFields = ['generation_class', 'repository', 'workflow_path', 'workflow_ref', 'event_name', 'trigger_ref', 'source_ref', 'source_sha', 'run_id', 'run_attempt', 'artifact_name', 'component_digests'];
  if (JSON.stringify(contract.snapshot_integrity?.producer_provenance_required) !== JSON.stringify(producerFields)) {
    throw new Error('CONTROL_TOWER_PRODUCER_POLICY');
  }
  if (contract.snapshot_integrity?.local_fallback_is_unattested_and_never_canonical !== true
      || contract.snapshot_integrity?.local_fallback_must_be_visibly_unattested !== true) {
    throw new Error('CONTROL_TOWER_LOCAL_FALLBACK_POLICY');
  }
  if (productionPromotion.id !== 'KIDULTS_CONTROLLED_PRODUCTION_PROMOTION_V1'
      || productionPromotion.version !== '1.1.0'
      || productionPromotion.canonical_policy !== CONTROL_TOWER_SOURCE_PATHS.sample_policy
      || productionPromotion.canonical_policy_version !== samplePolicy.version) {
    throw new Error('CONTROL_TOWER_PRODUCTION_PROMOTION_POLICY_BINDING');
  }
  const productionEvidenceProducer = {
    contract_id: productionPromotion.id,
    contract_version: productionPromotion.version,
    canonical_policy_version: productionPromotion.canonical_policy_version,
    exact_workflow_path: productionPromotion.evidence_producer?.exact_workflow_path,
    availability: productionPromotion.evidence_producer?.availability,
    certification_state: productionPromotion.evidence_producer?.certification_state,
    production_authority: productionPromotion.evidence_producer?.production_authority
  };
  if (productionEvidenceProducer.exact_workflow_path !== '.github/workflows/kidults-production-release-evidence-v1.yml'
      || productionEvidenceProducer.availability !== 'NOT_IMPLEMENTED_PENDING_SEPARATE_GOVERNED_PRODUCER'
      || productionEvidenceProducer.certification_state !== 'HOLD'
      || productionEvidenceProducer.production_authority !== 'HARD_DISABLED') {
    throw new Error('CONTROL_TOWER_PRODUCTION_EVIDENCE_PRODUCER_STATE');
  }
  for (const field of producerFields) {
    if (producer[field] === undefined || producer[field] === null) throw new Error(`CONTROL_TOWER_PRODUCER_FIELD:${field}`);
  }
  const sourceAsOfByInput = Object.fromEntries(Object.keys(CONTROL_TOWER_SOURCE_PATHS).map(name => [name, null]));
  for (const [name, field] of Object.entries(CONTROL_TOWER_EVIDENCE_TIME_FIELDS)) {
    const value = sources[name]?.json?.[field];
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`CONTROL_TOWER_SOURCE_AS_OF_INVALID:${name}`);
    sourceAsOfByInput[name] = value;
  }
  const evidenceTimes = Object.entries(CONTROL_TOWER_EVIDENCE_TIME_FIELDS)
    .map(([name, field]) => Date.parse(sources[name].json[field]));
  const sourceAsOf = new Date(Math.min(...evidenceTimes)).toISOString();
  if (Date.parse(generatedAt) < Math.max(...evidenceTimes)) throw new Error('CONTROL_TOWER_BUILD_PRECEDES_SOURCE_AS_OF');
  if (contract.snapshot_integrity?.evidence_freshness_threshold !== 'NOT_DEFINED'
      || contract.snapshot_integrity?.evidence_freshness_state !== 'UNASSESSED_AND_VISIBLE') {
    throw new Error('CONTROL_TOWER_EVIDENCE_FRESHNESS_POLICY');
  }
  const oldestMaterialAgeMinutesAtBuild = (Date.parse(generatedAt) - Date.parse(sourceAsOf)) / 60_000;
  const freshnessSloMinutes = Number(contract.refresh_contract?.freshness_slo_minutes);
  if (!Number.isInteger(freshnessSloMinutes) || freshnessSloMinutes < 1) throw new Error('CONTROL_TOWER_FRESHNESS_SLO_INVALID');
  const staleAfter = new Date(Date.parse(generatedAt) + freshnessSloMinutes * 60_000).toISOString();
  const counts = rights.records.reduce((accumulator, row) => {
    accumulator[row.decision] = (accumulator[row.decision] || 0) + 1;
    return accumulator;
  }, {});
  const portfolio = preflight.portfolio;
  return {
    id: 'kidults-management-control-tower-snapshot-v1',
    version: '1.1.0',
    generated_by: 'KPMO_TRACK_D_GOVERNED_BUILDER',
    producer,
    as_of: generatedAt,
    generated_at: generatedAt,
    source_as_of: sourceAsOf,
    source_as_of_by_input: sourceAsOfByInput,
    stale_after: staleAfter,
    freshness: {
      state_at_build: 'TRANSPORT_FRESH',
      freshness_slo_minutes: freshnessSloMinutes,
      stale_after: staleAfter,
      failure_mode: contract.refresh_contract.failure,
      transport: {
        generated_at: generatedAt,
        stale_after: staleAfter
      },
      evidence: {
        state_at_build: 'UNASSESSED',
        threshold: 'NOT_DEFINED',
        oldest_material_age_minutes_at_build: oldestMaterialAgeMinutesAtBuild,
        aggregate_as_of: sourceAsOf,
        time_sources: Object.keys(CONTROL_TOWER_EVIDENCE_TIME_FIELDS),
        by_input: sourceAsOfByInput
      }
    },
    production_evidence_producer: productionEvidenceProducer,
    snapshot_state: alignment.release_state,
    headline: `내부 정책 상태는 ${alignment.release_state}. Production evidence producer는 HARD_DISABLED(미구현), 권리-clear current-SOLD ${portfolio.rights_clear_current_sold_sources}, 활성 어댑터 ${portfolio.empirically_activated}이므로 외부 실증·Production·Public·G5는 HOLD.`,
    source_digests: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.digest])),
    sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.path])),
    kpis: [
      ['권리-clear SOLD', String(portfolio.rights_clear_current_sold_sources), `12 Fast Lane 중 ${portfolio.rights_clear_current_sold_sources}`],
      ['활성 어댑터', `${portfolio.empirically_activated} / ${portfolio.software_adapters_implemented_fixture_verified}`, `구현·fixture 검증 ${portfolio.software_adapters_implemented_fixture_verified}`],
      ['검증 SOLD 이벤트', String(portfolio.verified_current_sold_events), `Evidence admitted ${portfolio.evidence_admitted}`],
      ['자연 실행', '0 / 30', 'Production 최소 조건'],
      ['Production evidence producer', 'HARD_DISABLED', '별도 governed producer 미구현'],
      ['외부 출시', 'HOLD', 'Public · Production · G5'],
      ['표본·무결성 정책', 'ACTIVE', 'protected main 기준']
    ],
    funnel: [
      ['Internal policy', 'ACTIVE', 100, 'pass'],
      ['Value + rights census', `${portfolio.rights_clear_current_sold_sources} eligible`, 0, 'block'],
      ['Schema + live snapshot', `${portfolio.immutable_live_source_snapshots_verified} verified`, 0, 'block'],
      ['Adapter activation', `${portfolio.empirically_activated} / ${portfolio.software_adapters_implemented_fixture_verified}`, 0, 'block'],
      ['Evidence cohort', `${portfolio.verified_current_sold_events} events`, 0, 'block'],
      ['Natural SLO', '0 / 30 runs', 0, 'hold'],
      ['Producer gate', 'NOT IMPLEMENTED', 0, 'block'],
      ['Production / Public', 'HOLD', 0, 'hold']
    ],
    decisions: [
      ['1. 별도 governed Production evidence producer를 protected main에 등재', 'producer 실행 전에는 내부 통제가 증거 생산을 대체하지 않음'],
      ['2. HOLD 소스의 capture·reuse 권리 증거 확보', 'TRACK Z · 서면 목적별 허가 없이는 수집하지 않음'],
      ['3. Fast Lane 12건을 PASS / CONDITIONAL / HOLD / NO-GO로 종결', 'KPMO Rights Ops · 공식 evidence snapshot 결속'],
      ['4. 첫 권리·가치·schema 통과 소스만 adapter 활성화', 'Track A/B/D · 동적 cohort와 영구 receipt'],
      ['5. Production 주장을 요청할 때 30 natural runs / 7일 충족', '자동 승격·기준 하향 금지']
    ],
    rights_summary: {
      total: rights.records.length,
      pass: counts.PASS || 0,
      conditional: counts.CONDITIONAL || 0,
      hold: counts.HOLD || 0,
      no_go: counts.NO_GO || 0
    },
    records: rights.records.map(row => [row.source_id, row.decision, row.route.replaceAll('_', ' '), row.next_action]),
    governance: [
      ['내부 정책', alignment.release_state, 'pass'],
      ['권리·schema 통과 source', String(portfolio.rights_clear_current_sold_sources), 'hold'],
      ['current-SOLD event', String(portfolio.verified_current_sold_events), 'hold'],
      ['주장 가능한 데이터상품', '없음', 'hold'],
      ['Production evidence producer', 'HARD_DISABLED', 'hold'],
      ['Production / Public / G5', 'HOLD', 'hold']
    ]
  };
}
