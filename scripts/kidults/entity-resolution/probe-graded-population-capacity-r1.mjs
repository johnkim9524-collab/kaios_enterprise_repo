import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseJsonNoDuplicateKeys} from './parse-json-no-duplicate-keys.mjs';

const [samplingPath, pcgsRightsPath, providerGatePath, trustedSourcesPath, outputPath = '/tmp/kidults-er-graded-population-capacity-r1.json'] = process.argv.slice(2);
if (!samplingPath || !pcgsRightsPath || !providerGatePath || !trustedSourcesPath) {
  throw new Error('usage: node probe-graded-population-capacity-r1.mjs <sampling.json> <pcgs-rights.json> <provider-gate.json> <trusted-sources.json> [output.json]');
}

const ARTIFACT_ID = 'kidults-er-graded-population-live-capacity-r1';
const STRATUM_ID = 'er-stratum-graded-population';
const WIKIDATA_LICENSE = 'https://www.wikidata.org/wiki/Wikidata:Licensing';
const WIKIDATA_ENTITY_DATA = 'https://www.wikidata.org/wiki/Special:EntityData';
const CGC_TERMS = 'https://www.cgccomics.com/legal/terms-of-use/';
const USER_AGENT = 'KAIOS-KIDULTS-ER-graded-population-capacity-r1/1.0 (read-only CC0 source-fit preflight)';
const PROPERTY_CANDIDATES = [
  {id:'P10611', expected_label:'has certification', expected_description_fragment:'certain certification', candidate_role:'CERTIFICATION_NUMBER', decision:'REJECT_NOT_AN_IDENTIFIER'},
  {id:'P5021', expected_label:'assessment', expected_description_fragment:'test or exam', candidate_role:'COLLECTIBLE_GRADE', decision:'REJECT_TEST_OR_METHOD_ASSESSMENT_NOT_GRADE_LITERAL'},
  {id:'P1082', expected_label:'population', expected_description_fragment:'number of people', candidate_role:'GRADED_POPULATION_CONTEXT', decision:'REJECT_DEMOGRAPHIC_POPULATION_SEMANTICS'},
  {id:'P2598', expected_label:'serial number', expected_description_fragment:'specific object', candidate_role:'PHYSICAL_OBJECT_IDENTIFIER', decision:'ALLOW_ONLY_AS_OBJECT_SERIAL_NOT_GRADING_CERTIFICATION'},
];

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const CGC_MANUAL_REVIEW = {
  evidence_mode:'MANUAL_CONSERVATIVE_REPOSITORY_REVIEW_NO_AUTOMATED_FETCH',
  reviewed_on:'2026-08-19',
  terms_url:CGC_TERMS,
  sections:['1.2 Prohibited Uses', '2.2 Your Rights to Use the Website Content'],
  observed_controls:['NO_ROBOT_OR_OTHER_AUTOMATIC_DEVICE_ACCESS_WITHOUT_PRIOR_WRITTEN_CONSENT', 'PERSONAL_INFORMATIONAL_NON_COMMERCIAL_CONTENT_USE_ONLY'],
};
const CGC_MANUAL_REVIEW_EVIDENCE = {
  ...CGC_MANUAL_REVIEW,
  review_projection_sha256:digest(CGC_MANUAL_REVIEW),
};
const assert = (condition, code) => { if (!condition) throw new Error(code); };

function targetFromSampling(sampling) {
  const row = (sampling?.strata || []).find((item) => item.stratum_id === STRATUM_ID);
  assert(row, 'GRADED_POPULATION_SAMPLING_STRATUM_REQUIRED');
  const classes = row.case_class_targets || {};
  const boundaries = row.identity_boundary_targets || {};
  assert(row.cases === 120 && row.blind === 60, 'GRADED_POPULATION_120_60_TARGET_REQUIRED');
  assert(classes.SAME_OBJECT_NORMALIZATION === 40 && classes.HARD_NEGATIVE === 40 && classes.CROSS_MARKET_ALIAS === 40,
    'GRADED_POPULATION_40_40_40_CLASS_TARGET_REQUIRED');
  assert(boundaries.SOURCE_RECORD === 60 && boundaries.PHYSICAL_OBJECT === 60,
    'GRADED_POPULATION_60_60_BOUNDARY_TARGET_REQUIRED');
  return {
    cases:row.cases,
    blind:row.blind,
    per_class:{
      SAME_OBJECT_NORMALIZATION:classes.SAME_OBJECT_NORMALIZATION,
      HARD_NEGATIVE:classes.HARD_NEGATIVE,
      CROSS_MARKET_ALIAS:classes.CROSS_MARKET_ALIAS,
    },
    per_boundary:{SOURCE_RECORD:boundaries.SOURCE_RECORD, PHYSICAL_OBJECT:boundaries.PHYSICAL_OBJECT},
  };
}

function validateRepositoryRightsEvidence(pcgsRights, providerGate, trustedSources) {
  assert(pcgsRights.id === 'pcgs-eula-rights-terminalization-v1' && pcgsRights.provider === 'pcgs-public-api',
    'PCGS_RIGHTS_TERMINALIZATION_REQUIRED');
  assert(pcgsRights.bounded_evaluation?.raw_bulk_collection === 'BLOCK' &&
    pcgsRights.bounded_evaluation?.research_single_record_probe === 'ALLOW' &&
    pcgsRights.bounded_evaluation?.internal_er_calibration_reference === 'ALLOW_BOUNDED',
  'PCGS_BOUNDED_NOT_BULK_RIGHTS_REQUIRED');
  const pcgs = (providerGate.providers || []).find((provider) => provider.provider_id === 'pcgs-public-api');
  const psa = (providerGate.providers || []).find((provider) => provider.provider_id === 'psa-public-api');
  assert(providerGate.founder_approval?.decision === 'APPROVE_PCGS_BOUNDED_API_EVALUATION' &&
    providerGate.founder_approval?.authorized_scope?.includes('MINIMAL_SINGLE_RECORD_DEV_SHADOW_PROBES'),
  'PCGS_MINIMAL_PROBE_APPROVAL_REQUIRED');
  assert(pcgs?.prohibited?.includes('BULK_ENUMERATION') && psa?.prohibited?.includes('BULK_ENUMERATION') &&
    psa?.state === 'CONDITIONAL_OFFICIAL_API_ACCOUNT_EULA_GATE' && psa?.credential_model === 'ACCOUNT_PLUS_BEARER_TOKEN',
  'PCGS_PSA_BULK_AND_CREDENTIAL_GATES_REQUIRED');
  const psaRegistry = (trustedSources.source_candidates || []).find((source) => source.source_id === 'psa-population-and-verification');
  const cgcRegistry = (trustedSources.source_candidates || []).find((source) => source.source_id === 'cgc-population-and-certification');
  assert(psaRegistry?.rights_state === 'REFERENCE_USE_ONLY_PENDING_TERMS_REVIEW' && psaRegistry?.commercial_use_state === 'NOT_CLEARED',
    'PSA_REGISTRY_RIGHTS_NOT_CLEARED_REQUIRED');
  assert(cgcRegistry?.rights_state === 'REFERENCE_USE_ONLY_PENDING_TERMS_REVIEW' && cgcRegistry?.commercial_use_state === 'NOT_CLEARED',
    'CGC_REGISTRY_RIGHTS_NOT_CLEARED_REQUIRED');
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(url, {
        method:'GET',
        headers:{accept:'application/json', 'user-agent':USER_AGENT},
        redirect:'error',
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return parseJsonNoDuplicateKeys(await response.text(), url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function fetchPropertyEvidence(candidate) {
  const sourceUrl = `${WIKIDATA_ENTITY_DATA}/${candidate.id}.json`;
  const payload = await fetchJson(sourceUrl);
  const entity = payload?.entities?.[candidate.id];
  assert(entity && entity.missing === undefined, `WIKIDATA_PROPERTY_MISSING:${candidate.id}`);
  const label = entity.labels?.en?.value;
  const description = entity.descriptions?.en?.value;
  assert(label === candidate.expected_label && typeof description === 'string' && description.includes(candidate.expected_description_fragment),
    `WIKIDATA_PROPERTY_SEMANTICS_CHANGED:${candidate.id}`);
  return {
    ...candidate,
    observed_label:label,
    observed_description:description,
    observed_datatype:entity.datatype,
    source_url:sourceUrl,
    source_payload_sha256:digest(payload),
    license_evidence_refs:[WIKIDATA_LICENSE],
  };
}

function readiness(metrics, target) {
  const requirements = {
    rights_and_grammar_fit_source_family_floor:1,
    grammar_complete_real_record_floor:target.cases,
    normalization_candidate_floor:target.per_class.SAME_OBJECT_NORMALIZATION,
    hard_negative_pair_floor:target.per_class.HARD_NEGATIVE,
    cross_registry_alias_pair_floor:target.per_class.CROSS_MARKET_ALIAS,
    blind_source_record_capacity_floor:target.blind,
    source_record_boundary_floor:target.per_boundary.SOURCE_RECORD,
    physical_object_boundary_floor:target.per_boundary.PHYSICAL_OBJECT,
  };
  const checks = {
    rights_and_grammar_fit_source_family_floor_met:metrics.rights_and_grammar_fit_source_family_count >= requirements.rights_and_grammar_fit_source_family_floor,
    grammar_complete_real_record_floor_met:metrics.rights_admitted_grammar_complete_real_record_count >= requirements.grammar_complete_real_record_floor,
    normalization_candidate_floor_met:metrics.normalization_candidate_capacity >= requirements.normalization_candidate_floor,
    hard_negative_pair_floor_met:metrics.hard_negative_pair_capacity >= requirements.hard_negative_pair_floor,
    cross_registry_alias_pair_floor_met:metrics.cross_registry_alias_pair_capacity >= requirements.cross_registry_alias_pair_floor,
    blind_source_record_capacity_floor_met:metrics.rights_admitted_grammar_complete_real_record_count >= requirements.blind_source_record_capacity_floor,
    source_record_boundary_floor_met:metrics.source_record_boundary_capacity >= requirements.source_record_boundary_floor,
    physical_object_boundary_floor_met:metrics.physical_object_boundary_capacity >= requirements.physical_object_boundary_floor,
    conservative_120_case_class_capacity_met:metrics.conservative_case_capacity >= target.cases,
  };
  const ready = Object.values(checks).every(Boolean);
  const blockers = [
    'NO_RIGHTS_ADMITTED_GRADED_COLLECTIBLES_SOURCE_FIT_IDENTIFIED',
    'PCGS_CURRENT_AUTHORIZATION_EXCLUDES_120_CASE_BULK_COLLECTION',
    'PSA_BULK_RIGHTS_AND_CREDENTIAL_GATE_UNSATISFIED',
    'CGC_MANUAL_CONSERVATIVE_TERMS_REVIEW_NOT_CLEARED_NO_AUTOMATED_FETCH',
    'WIKIDATA_CC0_NO_EXACT_MAPPING_IDENTIFIED_IN_BOUNDED_FOUR_PROPERTY_AUDIT',
    'RIGHTS_ADMITTED_GRAMMAR_COMPLETE_RECORDS_0_OF_120',
    'SAME_OBJECT_NORMALIZATION_CAPACITY_0_OF_40',
    'HARD_NEGATIVE_CAPACITY_0_OF_40',
    'CROSS_MARKET_ALIAS_CAPACITY_0_OF_40',
    'BLIND_CAPACITY_0_OF_60',
    'SOURCE_RECORD_BOUNDARY_CAPACITY_0_OF_60',
    'PHYSICAL_OBJECT_BOUNDARY_CAPACITY_0_OF_60',
  ];
  return {requirements, checks, ready, blockers};
}

async function writeArtifact(artifact) {
  const sealed = {...artifact, integrity:{canonical_payload_sha256:digest(artifact)}};
  await fs.mkdir(path.dirname(outputPath), {recursive:true});
  await fs.writeFile(outputPath, `${JSON.stringify(sealed, null, 2)}\n`);
  return sealed;
}

async function run() {
  const [sampling, pcgsRights, providerGate, trustedSources] = await Promise.all(
    [samplingPath, pcgsRightsPath, providerGatePath, trustedSourcesPath]
      .map(async (filePath) => parseJsonNoDuplicateKeys(await fs.readFile(filePath, 'utf8'), filePath))
  );
  const target = targetFromSampling(sampling);
  validateRepositoryRightsEvidence(pcgsRights, providerGate, trustedSources);
  const generatedAt = new Date().toISOString();

  // The only remote source queried is Wikidata CC0. Provider APIs and websites
  // that lack compatible bulk rights receive zero requests and contribute zero.
  const propertyEvidence = await Promise.all(PROPERTY_CANDIDATES.map(fetchPropertyEvidence));

  const sourceCandidates = [
    {
      source_family:'pcgs-public-api',
      scope_fit:'BOUNDED_COIN_BANKNOTE_REFERENCE_NOT_DECLARED_CARDS_COMICS_VIDEO_GAMES_EXAMPLES',
      rights_state:'BLOCK_BULK_BOUNDED_EVALUATION_ONLY',
      grammar_fit_state:'NOT_EVALUATED_FOR_BULK',
      rights_evidence_refs:[pcgsRightsPath, providerGatePath],
      blocking_controls:['raw_bulk_collection=BLOCK', 'BULK_ENUMERATION_PROHIBITED', 'MINIMAL_SINGLE_RECORD_DEV_SHADOW_ONLY'],
      authenticated_requests:0,
      provider_record_requests:0,
      source_records_observed:0,
      rights_admitted_records:0,
      capacity_contribution:0,
    },
    {
      source_family:'psa-public-api-and-population-report',
      scope_fit:'COLLECTIBLES_FIT_CARDS_AND_VIDEO_GAMES',
      rights_state:'BLOCK_PENDING_ACCOUNT_EULA_AND_BULK_RIGHTS',
      grammar_fit_state:'POPULATION_FIELD_NOT_ASSUMED',
      rights_evidence_refs:[providerGatePath, trustedSourcesPath],
      blocking_controls:['ACCOUNT_PLUS_BEARER_TOKEN_REQUIRED', 'BULK_ENUMERATION_PROHIBITED', 'POPULATION_FIELD_ASSUMPTION_PROHIBITED', 'COMMERCIAL_USE_NOT_CLEARED'],
      authenticated_requests:0,
      provider_record_requests:0,
      source_records_observed:0,
      rights_admitted_records:0,
      capacity_contribution:0,
    },
    {
      source_family:'cgc-population-and-certification-web',
      scope_fit:'COLLECTIBLES_FIT_CARDS_AND_COMICS',
      rights_state:'BLOCK_CONSERVATIVE_MANUAL_TERMS_REVIEW_NOT_CLEARED',
      grammar_fit_state:'NOT_ENUMERATED_BECAUSE_RIGHTS_NOT_CLEARED',
      rights_evidence_refs:[CGC_TERMS, trustedSourcesPath],
      manual_terms_review:CGC_MANUAL_REVIEW_EVIDENCE,
      blocking_controls:['AUTOMATIC_DEVICE_ACCESS_PROHIBITED_WITHOUT_PRIOR_WRITTEN_CONSENT', 'CONTENT_USE_PERSONAL_INFORMATIONAL_NON_COMMERCIAL_ONLY', 'COMMERCIAL_USE_NOT_CLEARED'],
      prior_written_consent_present:false,
      authenticated_requests:0,
      provider_record_requests:0,
      source_records_observed:0,
      rights_admitted_records:0,
      capacity_contribution:0,
    },
    {
      source_family:'wikidata-cc0-graded-collectible-schema-fit',
      scope_fit:'CC0_ALTERNATIVE_BOUNDED_FOUR_PROPERTY_AUDIT_NO_EXACT_MAPPING_IDENTIFIED',
      rights_state:'ALLOW_CC0_STRUCTURED_DATA',
      grammar_fit_state:'NO_EXACT_MAPPING_IDENTIFIED_IN_BOUNDED_FOUR_PROPERTY_AUDIT',
      rights_evidence_refs:[WIKIDATA_LICENSE],
      blocking_controls:['P10611_NOT_A_CERTIFICATION_NUMBER', 'P5021_NOT_A_COLLECTIBLE_GRADE_LITERAL', 'P1082_DEMOGRAPHIC_POPULATION_NOT_GRADED_POPULATION_CONTEXT', 'P2598_OBJECT_SERIAL_NOT_GRADING_CERTIFICATION'],
      authenticated_requests:0,
      provider_record_requests:0,
      source_records_observed:0,
      rights_admitted_records:0,
      capacity_contribution:0,
    },
  ];
  const metrics = {
    candidate_source_families_assessed:sourceCandidates.length,
    rights_compatible_source_family_count:sourceCandidates.filter((source) => source.rights_state.startsWith('ALLOW')).length,
    grammar_fit_source_family_count:0,
    rights_and_grammar_fit_source_family_count:0,
    total_remote_get_requests:propertyEvidence.length,
    authenticated_requests:0,
    provider_record_requests:0,
    blocked_provider_source_records_observed:0,
    wikidata_schema_entities_observed:propertyEvidence.length,
    rights_admitted_grammar_complete_real_record_count:0,
    normalization_candidate_capacity:0,
    hard_negative_pair_capacity:0,
    cross_registry_alias_pair_capacity:0,
    source_record_boundary_capacity:0,
    physical_object_boundary_capacity:0,
    conservative_case_capacity:0,
    empirical_cases_created:0,
    labels_created:0,
    reviewers_created:0,
    market_or_current_price_fields_observed:0,
  };
  const gate = readiness(metrics, target);
  assert(gate.ready === false, 'ZERO_ADMITTED_SOURCE_MUST_NOT_BECOME_READY');

  const artifact = {
    id:ARTIFACT_ID,
    version:'1.2.0',
    stratum_id:STRATUM_ID,
    generated_at:generatedAt,
    probe_status:'COMPLETE_FAIL_CLOSED_NO_RIGHTS_ADMITTED_SOURCE_FIT',
    environment_class:'READ_ONLY_LIVE_RIGHTS_AND_SOURCE_FIT_PREFLIGHT',
    audit_scope:'BOUNDED_REPOSITORY_NAMED_TIER1_GRADING_AUTHORITIES_PLUS_WIKIDATA_CC0_ALTERNATIVE',
    collectible_scope:{allowed:['trading_cards', 'comic_books', 'video_games_consoles'], non_collectibles_admitted:false},
    request_boundary:{
      http_method:'GET',
      authenticated:false,
      credentials_used:false,
      spend_usd:0,
      remote_mutation:false,
      provider_record_requests:0,
      blocked_provider_web_or_api_requests:0,
      maximum_cc0_requests:4,
      actual_cc0_requests:metrics.total_remote_get_requests,
      local_output_only:true,
    },
    repository_evidence_bindings:{
      sampling_plan:{path:samplingPath, canonical_payload_sha256:digest(sampling)},
      pcgs_rights_terminalization:{path:pcgsRightsPath, canonical_payload_sha256:digest(pcgsRights)},
      provider_probe_gate:{path:providerGatePath, canonical_payload_sha256:digest(providerGate)},
      trusted_collectibles_sources:{path:trustedSourcesPath, canonical_payload_sha256:digest(trustedSources)},
    },
    sampling_target:target,
    strict_record_grammar:{
      required:['title_or_subject', 'issue_or_card', 'printing_or_variant', 'grade', 'certification_number', 'population_context'],
      required_identity_aliases:['grading_certification_number', 'independent_authoritative_object_or_registry_identifier'],
      admitted_wikidata_property_mappings:{
        title_or_subject:'ENTITY_LABEL_ONLY_INSUFFICIENT_ALONE',
        issue_or_card:null,
        printing_or_variant:null,
        grade:null,
        certification_number:null,
        population_context:null,
        physical_object_serial:'P2598_ONLY_NOT_CERTIFICATION',
      },
      inference_prohibited:true,
      rejected_substitutions:['P10611_AS_CERTIFICATION_NUMBER', 'P5021_AS_COLLECTIBLE_GRADE', 'P1082_AS_GRADED_POPULATION_CONTEXT', 'P2598_AS_GRADING_CERTIFICATION_WITHOUT_AUTHORITY_BINDING'],
    },
    source_candidates:sourceCandidates,
    cc0_live_schema_observation:{
      source_family:'wikidata-cc0-structured-data',
      license:'CC0-1.0',
      license_evidence_ref:WIKIDATA_LICENSE,
      accessed_at:generatedAt,
      property_evidence:propertyEvidence,
      strict_grammar_record_query_executed:false,
      strict_grammar_record_query_reason:'NO_EXACT_MAPPING_IDENTIFIED_IN_BOUNDED_FOUR_PROPERTY_AUDIT; FORMULATING A RECORD QUERY FROM THESE REJECTED MAPPINGS WOULD INFER SEMANTICS',
    },
    records:[],
    hard_negative_pairs:[],
    cross_registry_alias_pairs:[],
    metrics,
    readiness_gate:{
      requirements:gate.requirements,
      checks:gate.checks,
      source_capacity_ready_for_120_cases:false,
      acquisition_lane_state:'BLOCKED_RIGHTS_AND_SOURCE_FIT',
      blockers:gate.blockers,
    },
    downstream_claims:{
      empirical_cases_created:0,
      labels_collected:0,
      independent_reviewers_assigned:0,
      independent_label_review_complete:false,
      blind_holdout_sealed:false,
      empirical_benchmark_ready:false,
      track_b_started:false,
      publication:'HOLD',
      production:'HOLD',
    },
    truth_boundary:'This bounded preflight makes four unauthenticated GET requests only to Wikidata CC0 property-schema endpoints and makes zero provider-record requests. PCGS and PSA contribute zero because current bulk rights are blocked or not cleared. CGC contributes zero under a dated manual conservative terms review and the repository pending-terms/not-cleared gate; this probe does not fetch CGC. This four-property Wikidata audit identified no exact grade, grading-certification-number and graded-population-context mapping; it does not claim an exhaustive catalog-wide absence, and rejected generic properties are never reinterpreted. No cases, labels, reviewers, market/current-price claims, publication or Production authority are created.',
  };
  const sealed = await writeArtifact(artifact);
  console.log(JSON.stringify({
    id:sealed.id,
    probe_status:sealed.probe_status,
    candidate_source_families_assessed:metrics.candidate_source_families_assessed,
    rights_compatible_source_family_count:metrics.rights_compatible_source_family_count,
    rights_and_grammar_fit_source_family_count:metrics.rights_and_grammar_fit_source_family_count,
    rights_admitted_grammar_complete_real_record_count:metrics.rights_admitted_grammar_complete_real_record_count,
    same_object_normalization_capacity:metrics.normalization_candidate_capacity,
    hard_negative_capacity:metrics.hard_negative_pair_capacity,
    cross_market_alias_capacity:metrics.cross_registry_alias_pair_capacity,
    conservative_case_capacity:metrics.conservative_case_capacity,
    source_capacity_ready_for_120_cases:false,
    output:outputPath,
  }, null, 2));
}

try {
  await run();
} catch (error) {
  console.error(`FAIL_CLOSED: ${String(error?.message || error?.name || 'UNKNOWN_ERROR').slice(0, 300)}`);
  process.exitCode = 2;
}
