import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [inputPath, manifestPath, admissionPath, outputPath = '/tmp/er-real-world-r7j.json'] = process.argv.slice(2);
if (!inputPath || !manifestPath || !admissionPath) {
  throw new Error('Usage: node extend-er-r7i-designer-maker-minimums-r7j.mjs <r7i.json> <manifest.json> <admission.json> [r7j.json]');
}

const dataset = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const admission = JSON.parse(await fs.readFile(admissionPath, 'utf8'));

const STRATUM = 'er-stratum-designer-maker-edition';
const EXPECTED_INPUT_ID = 'entity-resolution-live-source-derived-constructed-control-r7i-provenance-minimums';
const EXPECTED_INPUT_SCOPE = 'R7I_PARTIAL_APPROVED_STRATA_5_OF_7_FIVE_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL';
const EXPECTED_MANIFEST_ID = 'kidults-er-approved-bounded-poc-calibration-strata-v1';
const EXPECTED_ADMISSION_ID = 'designer-maker-moma-cooper-admission-r3';
const EXPECTED_INPUT_CASE_COUNT = 18;
const EXPECTED_REPRESENTED_STRATA = [
  'er-stratum-pressing-edition-media',
  'er-stratum-provenance-unique-object',
  'er-stratum-serialized-reference',
  'er-stratum-variant-release-heavy',
  'er-stratum-vehicle-mechanical-asset',
];
const EXPECTED_TARGET_MISSING_CASE_CLASSES = [
  'HARD_NEGATIVE',
  'SAME_DESIGN_DIFFERENT_OBJECT',
  'SAME_OBJECT_NORMALIZATION',
];
const EXPECTED_TARGET_MISSING_BOUNDARIES = ['CANONICAL_DESIGN', 'PHYSICAL_OBJECT', 'SOURCE_RECORD'];
const EXPECTED_SOURCE_IDS = ['cooper-hewitt-collection-json', 'moma-collection-research-dataset'];
const MOMA_SOURCE_ID = 'moma-collection-research-dataset';
const COOPER_SOURCE_ID = 'cooper-hewitt-collection-json';
const MOMA_URL = 'https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artworks.csv';
const COOPER_URL = 'https://raw.githubusercontent.com/cooperhewitt/collection/master/objects/187/349/45/18734945.json';
const MODEL_TOKEN = '3107';
const CANONICAL_ANCHOR = 'designer-maker:arne-jacobsen:fritz-hansen:model-3107';
const MOMA_TARGETS = [
  { work_id:'1611', object_number:'24.1997.1' },
  { work_id:'103159', object_number:'24.1997.2' },
];

const sortedUnique = (values) => [...new Set(values)].sort();
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sameStrings = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  new Set(left).size === left.length && new Set(right).size === right.length &&
  JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const validSourceEvidence = (evidence) =>
  typeof evidence?.source_url === 'string' && /^https:\/\//.test(evidence.source_url) &&
  /^sha256:[a-f0-9]{64}$/.test(evidence?.source_payload_sha256 || '') &&
  Array.isArray(evidence?.license_evidence_refs) && evidence.license_evidence_refs.length > 0 &&
  evidence.license_evidence_refs.every((ref) => typeof ref === 'string' && /^https:\/\//.test(ref));

const constructedControlInput = dataset.id === EXPECTED_INPUT_ID && dataset.dataset_scope === EXPECTED_INPUT_SCOPE &&
  dataset.dataset_class === 'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL' && dataset.synthetic === false &&
  dataset.constructed_control === true && dataset.empirical_benchmark_eligible === false &&
  dataset.independent_label_review_complete === false && dataset.label_adjudication_complete === false &&
  dataset.holdout_sealed_before_modeling === false && dataset.track_b_independent_review_complete === false &&
  dataset.pre_track_b_promotion_eligible === false && dataset.public_claim_authorized === false &&
  dataset.public_release_authorized === false && dataset.production_promotion_authorized === false &&
  dataset.production === 'HOLD' && dataset.scope_stratification_status === 'INCOMPLETE' &&
  /^sha256:[a-f0-9]{64}$/.test(dataset.prior_input_sha256 || '') &&
  dataset.prior_input_sha256_role === 'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE' &&
  Array.isArray(dataset.cases) && dataset.cases.length === EXPECTED_INPUT_CASE_COUNT &&
  new Set(dataset.cases.map((item) => item.case_id)).size === dataset.cases.length &&
  dataset.cases.every((item) => typeof item.case_id === 'string' && item.case_id.trim()) &&
  sameStrings(dataset.represented_approved_strata_ids, EXPECTED_REPRESENTED_STRATA) &&
  dataset.cases.every((item) => item.blind_holdout === false) &&
  dataset.cases.every((item) => Array.isArray(item.source_evidence) && item.source_evidence.length > 0 &&
    item.source_evidence.every(validSourceEvidence));
if (!constructedControlInput) throw new Error('R7I_EXACT_CONSTRUCTED_CONTROL_DATASET_REQUIRED');

const exactManifestBinding = manifest.id === EXPECTED_MANIFEST_ID && manifest.id === dataset.approved_strata_manifest_id &&
  manifest.status === 'APPROVED_BOUNDED_POC_CALIBRATION' &&
  sameStrings(manifest.approved_strata_ids, dataset.approved_scope_ids) &&
  sameStrings(manifest.required_strata_ids, dataset.required_scope_ids) &&
  (manifest.approved_strata_ids || []).includes(STRATUM) && (manifest.required_strata_ids || []).includes(STRATUM);
if (!exactManifestBinding) throw new Error('R7J_APPROVED_STRATA_MANIFEST_BINDING_REQUIRED');

const manifestByStratum = new Map((manifest.strata || []).map((row) => [row.stratum_id, row]));
if (manifestByStratum.size !== (manifest.strata || []).length) throw new Error('R7J_MANIFEST_DUPLICATE_STRATUM_ID');
const representedFromCases = sortedUnique(dataset.cases.map((item) => item.scope_id)
  .filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const representedGrammarValid = EXPECTED_REPRESENTED_STRATA.every((stratumId) => {
  const row = manifestByStratum.get(stratumId);
  const rows = dataset.cases.filter((item) => item.scope_id === stratumId);
  const allowedClasses = new Set(row?.minimum_case_classes || []);
  const allowedBoundaries = new Set(row?.minimum_boundaries || []);
  return rows.length >= 1 && rows.every((item) =>
    allowedClasses.has(item.case_class) && allowedBoundaries.has(item.identity_boundary));
});
if (!sameStrings(representedFromCases, EXPECTED_REPRESENTED_STRATA) ||
    !sameStrings(representedFromCases, dataset.represented_approved_strata_ids) || !representedGrammarValid) {
  throw new Error('R7I_DERIVED_REPRESENTED_STRATA_OR_GRAMMAR_INVALID');
}
const targetRow = manifestByStratum.get(STRATUM);
const targetCases = dataset.cases.filter((item) => item.scope_id === STRATUM);
const targetMissingClasses = sortedUnique((targetRow?.minimum_case_classes || [])
  .filter((value) => !targetCases.some((item) => item.case_class === value)));
const targetMissingBoundaries = sortedUnique((targetRow?.minimum_boundaries || [])
  .filter((value) => !targetCases.some((item) => item.identity_boundary === value)));
if (!sameStrings(targetMissingClasses, EXPECTED_TARGET_MISSING_CASE_CLASSES) ||
    !sameStrings(targetMissingBoundaries, EXPECTED_TARGET_MISSING_BOUNDARIES) || targetCases.length !== 0) {
  throw new Error('R7I_DESIGNER_MAKER_TARGET_DEFICIT_MISMATCH');
}

const admissionSources = Array.isArray(admission.sources) ? admission.sources : [];
const admissionSourceById = new Map(admissionSources.map((source) => [source.source_id, source]));
const accounting = admission.admission_accounting || {};
const assurance = admission.evidence_assurance || {};
const authorization = admission.authorization_boundaries || {};
const exactAdmissionBoundary = admission.id === EXPECTED_ADMISSION_ID && admission.version === '3.0.0' &&
  admission.production === 'HOLD' &&
  admission.admission_scope === 'DESIGNER_MAKER_EDITION_IDENTITY_CALIBRATION_ONLY' &&
  admission.admission_class === 'REPOSITORY_DECLARED_IDENTITY_CALIBRATION_METADATA_ONLY' &&
  admission.admitted_state_definition === 'ADMITTED_MEANS_REPOSITORY_DECLARED_FOR_BOUNDED_INTERNAL_IDENTITY_CALIBRATION_METADATA_ONLY' &&
  admission.purpose_rights_interpretation === 'SOURCE_LICENSE_FIELD_USE_CEILING_ONLY_NOT_PLATFORM_ADMISSION_OR_PUBLICATION_AUTHORIZATION' &&
  admissionSources.length === 2 && admissionSourceById.size === 2 &&
  sameStrings(admissionSources.map((source) => source.source_id), EXPECTED_SOURCE_IDS) &&
  accounting.repository_declared_identity_calibration_metadata_source_count === 2 &&
  accounting.strict_r1_evidence_bound_admitted_source_count === 0 &&
  accounting.full_source_pool_admitted_source_count === 0 && accounting.current_market_ready_source_count === 0 &&
  accounting.runtime_admitted_source_count === 0 && accounting.image_admitted_source_count === 0 &&
  assurance.repository_declaration_only === true && assurance.strict_r1_evidence_bound_revalidation_complete === false &&
  assurance.independent_legal_review_complete === false && assurance.source_content_bytes_archived === false &&
  assurance.source_content_archive_state === 'NOT_ARCHIVED' &&
  assurance.live_workflow_probe_is_archival_or_independent_review_evidence === false &&
  authorization.current_market_claim_authorized === false && authorization.full_source_pool_admission_authorized === false &&
  authorization.public_release_authorized === false && authorization.commercial_use_authorized === false &&
  authorization.public_commercial_admission_authorized === false && authorization.runtime_admission_authorized === false &&
  authorization.runtime_admission_events_emitted === 0 && authorization.image_admission_authorized === false &&
  authorization.market_observation_count === 0 && authorization.production_promotion_authorized === false &&
  admission.pool_effect?.current_market_claim_gate_satisfied === false &&
  admission.pool_effect?.full_source_pool_effect === 'NONE' && admission.pool_effect?.runtime_admission_effect === 'NONE' &&
  admissionSources.every((source) => source.admission_state === 'ADMITTED' &&
    source.admission_state_scope === 'REPOSITORY_DECLARED_BOUNDED_INTERNAL_IDENTITY_CALIBRATION_METADATA_ONLY' &&
    source.strict_r1_evidence_bound_admission === false && source.source_content_bytes_archived === false &&
    Array.isArray(source.rights_evidence) && source.rights_evidence.length > 0 &&
    source.rights_evidence.every((ref) => typeof ref === 'string' && /^https:\/\//.test(ref)) &&
    String(source.image_rule || '').startsWith('BLOCKED_OUTSIDE_THIS_ADMISSION'));
if (!exactAdmissionBoundary) throw new Error('R7J_EXACT_REPOSITORY_DECLARED_METADATA_ADMISSION_REQUIRED');

const topology = admission.target_evidence_topology || {};
const expectedTopology = topology.canonical_design === 'ARNE_JACOBSEN_SERIES_7_MODEL_3107' &&
  Array.isArray(topology.moma_exemplar_records) && topology.moma_exemplar_records.length === 2 &&
  sameStrings(topology.moma_exemplar_records.map((item) => item.object_number), MOMA_TARGETS.map((item) => item.object_number)) &&
  topology.cooper_hewitt_design_authority?.object_id === '18734945' &&
  topology.cooper_hewitt_design_authority?.accession_number === '2009-26-1-a,b' &&
  topology.cooper_hewitt_design_authority?.model_token === MODEL_TOKEN &&
  topology.cooper_hewitt_design_authority?.designer === 'Arne Jacobsen' &&
  topology.cooper_hewitt_design_authority?.manufacturer === 'Fritz Hansen Inc., Denmark';
if (!expectedTopology) throw new Error('R7J_EXACT_ADMISSION_TOPOLOGY_REQUIRED');

async function fetchText(url, attempts = 3, timeoutMs = 18000) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers:{
          'user-agent':'KIDULTS-ER-BENCHMARK-DEV-SHADOW/1.0',
          accept:'application/json,text/csv,text/plain',
        },
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('MOMA_CSV_UNTERMINATED_QUOTE');
  row.push(field);
  if (row.some((value) => value !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('MOMA_CSV_ROWS_REQUIRED');
  const headers = rows[0];
  if (new Set(headers).size !== headers.length) throw new Error('MOMA_CSV_DUPLICATE_HEADER');
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const [momaText, cooperText] = await Promise.all([
  fetchText(MOMA_URL, 3, 45000),
  fetchText(COOPER_URL, 3, 18000),
]);
const momaRows = parseCsv(momaText);
let cooperPayload;
try {
  cooperPayload = JSON.parse(cooperText);
} catch {
  throw new Error('COOPER_JSON_REQUIRED');
}

const momaRecords = MOMA_TARGETS.map((target) => {
  const matches = momaRows.filter((row) => row.ObjectID === target.work_id && row.AccessionNumber === target.object_number);
  if (matches.length !== 1) throw new Error(`MOMA_EXACT_EXEMPLAR_REQUIRED:${target.work_id}:${target.object_number}`);
  const row = matches[0];
  if (row.Title !== 'Chair Series 7 (3107)' || row.Artist !== 'Arne Jacobsen' ||
      row.URL !== `https://www.moma.org/collection/works/${target.work_id}`) {
    throw new Error(`MOMA_MODEL_DESIGNER_TOPOLOGY_REVALIDATION_FAILED:${target.work_id}`);
  }
  return {
    artist:row.Artist,
    collection_record_url:row.URL,
    object_id:row.ObjectID,
    object_number:row.AccessionNumber,
    title:row.Title,
  };
}).sort((left, right) => compareText(
  [left.object_id, left.object_number].join('\0'),
  [right.object_id, right.object_number].join('\0'),
));

const cooper = cooperPayload;
const roles = Object.fromEntries((cooper.participants ?? [])
  .filter((participant) => typeof participant?.role_name === 'string')
  .sort((left, right) => compareText(
    [left.role_name, left.person_name || ''].join('\0'),
    [right.role_name, right.person_name || ''].join('\0'),
  ))
  .map((participant) => [participant.role_name, participant.person_name]));
if (String(cooper.id) !== '18734945' || cooper.accession_number !== '2009-26-1-a,b' ||
    cooper.title_raw !== 'Model #3107' || roles.Designer !== 'Arne Jacobsen' ||
    !String(roles.Manufacturer || '').startsWith('Fritz Hansen') || !cooper.title_raw.includes(MODEL_TOKEN)) {
  throw new Error('COOPER_EXACT_DESIGNER_MAKER_MODEL_REVALIDATION_FAILED');
}

const admissionSha256 = digest(admission);
const momaCanonicalRowDigests = momaRows.map((row) => digest(row)).sort(compareText);
const momaPayloadSha256 = digest({
  canonicalization:'RECURSIVE_CANONICAL_PARSED_ROWS_SORTED_BY_ROW_DIGEST',
  row_sha256:momaCanonicalRowDigests,
  source_url:MOMA_URL,
});
const cooperPayloadSha256 = digest(cooperPayload);
const momaLicenseRefs = sortedUnique(admissionSourceById.get(MOMA_SOURCE_ID).rights_evidence);
const cooperLicenseRefs = sortedUnique(admissionSourceById.get(COOPER_SOURCE_ID).rights_evidence);
const momaEvidence = {
  license_evidence_refs:momaLicenseRefs,
  source_payload_digest_scope:'ALL_RECURSIVE_CANONICAL_PARSED_ROWS_FROM_LIVE_CSV_RESPONSE_BYTES',
  source_payload_sha256:momaPayloadSha256,
  source_url:MOMA_URL,
};
const cooperEvidence = {
  license_evidence_refs:cooperLicenseRefs,
  source_payload_digest_scope:'RECURSIVE_CANONICAL_JSON_FROM_LIVE_RESPONSE_BYTES',
  source_payload_sha256:cooperPayloadSha256,
  source_url:COOPER_URL,
};
const commonCaseBoundary = {
  blind_holdout:false,
  commercial_use_authorized:false,
  constructed_control:true,
  current_market_evidence:false,
  full_source_pool_admission_authorized:false,
  independent_legal_review_complete:false,
  independent_physical_inspection_complete:false,
  label_review_status:'NOT_INDEPENDENTLY_REVIEWED_OR_ADJUDICATED',
  marketplace_evidence:false,
  production_promotion_authorized:false,
  public_claim_authorized:false,
  public_commercial_admission_authorized:false,
  repository_declared_metadata_admission_only:true,
  rights_scope:'REPOSITORY_DECLARED_BOUNDED_INTERNAL_IDENTITY_CALIBRATION_METADATA_ONLY',
  runtime_admission_authorized:false,
  source_admission_id:EXPECTED_ADMISSION_ID,
  source_admission_sha256:admissionSha256,
  source_content_bytes_archived:false,
  strict_r1_evidence_bound_admission:false,
};

const sameObject = {
  ...commonCaseBoundary,
  case_id:'moma-designer-maker-normalization-1611-24.1997.1',
  case_class:'SAME_OBJECT_NORMALIZATION',
  expected:'MATCH',
  identity_boundary:'SOURCE_RECORD',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_ONE_LIVE_MOMA_CC0_COLLECTION_RECORD_WITH_EXACT_OBJECT_ID_AND_OBJECT_NUMBER',
  left:{
    anchors:{SOURCE_RECORD:'moma-collection-record:1611'},
    designer:'Arne Jacobsen',
    model_token:MODEL_TOKEN,
    object_number:'24.1997.1',
    source:MOMA_SOURCE_ID,
    unique_keys:{reference_id:'moma-work:1611'},
  },
  provenance_refs:[
    'moma-cc0-artworks-csv:object-id:1611',
    'moma-cc0-artworks-csv:object-number:24.1997.1',
    `source-admission:${EXPECTED_ADMISSION_ID}:repository-declared-metadata-only`,
  ],
  right:{
    anchors:{SOURCE_RECORD:'moma-collection-record:1611'},
    designer:'Arne Jacobsen',
    model_token:MODEL_TOKEN,
    object_number:'24.1997.1',
    source:MOMA_SOURCE_ID,
    unique_keys:{reference_id:'moma-object-number:24.1997.1'},
  },
  rights_state:'ALLOW',
  scope_id:STRATUM,
  source_evidence:[momaEvidence],
  claim_ceiling:'SOURCE_RECORD_NORMALIZATION_MECHANICS_ONLY_NO_IMAGE_PHYSICAL_INSPECTION_PROVENANCE_OR_CURRENT_MARKET_CLAIM',
};

const sameDesign = {
  ...commonCaseBoundary,
  case_id:'moma-cooper-series7-3107-same-design-24.1997.1-24.1997.2',
  case_class:'SAME_DESIGN_DIFFERENT_OBJECT',
  expected:'MATCH',
  identity_boundary:'CANONICAL_DESIGN',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_TWO_DISTINCT_MOMA_COLLECTION_RECORDS_AND_ONE_COOPER_HEWITT_MODEL_AUTHORITY_RECORD',
  left:{
    anchors:{CANONICAL_DESIGN:CANONICAL_ANCHOR},
    designer:'Arne Jacobsen',
    manufacturer:'Fritz Hansen',
    model_token:MODEL_TOKEN,
    source:MOMA_SOURCE_ID,
    unique_keys:{accession_number:'24.1997.1', object_id:'moma:1611'},
  },
  provenance_refs:[
    'moma-cc0-artworks-csv:object-id:1611:object-number:24.1997.1',
    'moma-cc0-artworks-csv:object-id:103159:object-number:24.1997.2',
    'cooper-hewitt:object:18734945:model-3107:designer-arne-jacobsen:manufacturer-fritz-hansen',
    `source-admission:${EXPECTED_ADMISSION_ID}:repository-declared-metadata-only`,
  ],
  right:{
    anchors:{CANONICAL_DESIGN:CANONICAL_ANCHOR},
    designer:'Arne Jacobsen',
    manufacturer:'Fritz Hansen',
    model_token:MODEL_TOKEN,
    source:MOMA_SOURCE_ID,
    unique_keys:{accession_number:'24.1997.2', object_id:'moma:103159'},
  },
  rights_state:'ALLOW',
  scope_id:STRATUM,
  source_evidence:[momaEvidence, cooperEvidence],
  claim_ceiling:'CANONICAL_DESIGN_RECORD_LINKAGE_MECHANICS_ONLY_DISTINCT_COLLECTION_OBJECT_RECORDS_REMAIN_DISTINCT_NO_IMAGE_PHYSICAL_INSPECTION_PROVENANCE_OR_CURRENT_MARKET_CLAIM',
};

const hardNegative = {
  ...commonCaseBoundary,
  case_id:'moma-series7-3107-collection-record-hard-negative-24.1997.1-24.1997.2',
  case_class:'HARD_NEGATIVE',
  expected:'NO_MATCH',
  identity_boundary:'PHYSICAL_OBJECT',
  label_basis:'ALGORITHMICALLY_CONSTRUCTED_FROM_TWO_DISTINCT_MOMA_COLLECTION_RECORD_IDENTIFIERS_FOR_ONE_SHARED_MODEL_WITHOUT_PHYSICAL_INSPECTION',
  left:{
    anchors:{PHYSICAL_OBJECT:'moma-collection-object-record:1611:24.1997.1'},
    canonical_design:CANONICAL_ANCHOR,
    source:MOMA_SOURCE_ID,
    unique_keys:{accession_number:'24.1997.1', object_id:'moma:1611'},
  },
  provenance_refs:[
    'moma-cc0-artworks-csv:object-id:1611:object-number:24.1997.1',
    'moma-cc0-artworks-csv:object-id:103159:object-number:24.1997.2',
    `source-admission:${EXPECTED_ADMISSION_ID}:repository-declared-metadata-only`,
  ],
  right:{
    anchors:{PHYSICAL_OBJECT:'moma-collection-object-record:103159:24.1997.2'},
    canonical_design:CANONICAL_ANCHOR,
    source:MOMA_SOURCE_ID,
    unique_keys:{accession_number:'24.1997.2', object_id:'moma:103159'},
  },
  rights_state:'ALLOW',
  scope_id:STRATUM,
  source_evidence:[momaEvidence],
  claim_ceiling:'PHYSICAL_OBJECT_BOUNDARY_COLLECTION_RECORD_IDENTITY_MECHANICS_ONLY_NO_INDEPENDENT_PHYSICAL_INSPECTION_FULL_PROVENANCE_IMAGE_OR_CURRENT_MARKET_CLAIM',
};

for (const item of [sameObject, sameDesign, hardNegative]) {
  if (dataset.cases.some((existing) => existing.case_id === item.case_id)) {
    throw new Error(`DUPLICATE_R7J_CASE:${item.case_id}`);
  }
}
const cases = [...dataset.cases, sameObject, sameDesign, hardNegative];
const represented = sortedUnique(cases.map((item) => item.scope_id)
  .filter((scopeId) => (manifest.required_strata_ids || []).includes(scopeId)));
const expectedRepresented = sortedUnique([...EXPECTED_REPRESENTED_STRATA, STRATUM]);
const completedTargetCases = cases.filter((item) => item.scope_id === STRATUM);
if (!sameStrings(represented, expectedRepresented) ||
    !(targetRow?.minimum_case_classes || []).every((value) => completedTargetCases.some((item) => item.case_class === value)) ||
    !(targetRow?.minimum_boundaries || []).every((value) => completedTargetCases.some((item) => item.identity_boundary === value))) {
  throw new Error('R7J_DESIGNER_MAKER_TARGET_NOT_COMPLETE_AFTER_EXTENSION');
}

const out = {
  ...dataset,
  id:'entity-resolution-live-source-derived-constructed-control-r7j-designer-maker-minimums',
  dataset_scope:'R7J_PARTIAL_APPROVED_STRATA_6_OF_7_SIX_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL',
  dataset_class:'REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL',
  synthetic:false,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  independent_label_review_complete:false,
  label_adjudication_complete:false,
  holdout_sealed_before_modeling:false,
  track_b_independent_review_complete:false,
  pre_track_b_promotion_eligible:false,
  public_claim_authorized:false,
  public_release_authorized:false,
  production_promotion_authorized:false,
  production:'HOLD',
  scope_stratification_status:'INCOMPLETE',
  approved_scope_ids:manifest.approved_strata_ids,
  required_scope_ids:manifest.required_strata_ids,
  approved_strata_manifest_id:manifest.id,
  represented_approved_strata_ids:represented,
  r7j_repository_declared_identity_calibration_metadata_source_count:2,
  r7j_strict_r1_evidence_bound_admitted_source_count:0,
  r7j_independent_legal_review_count:0,
  r7j_source_content_archive_count:0,
  r7j_full_source_pool_admitted_source_count:0,
  r7j_runtime_admitted_source_count:0,
  r7j_current_market_ready_source_count:0,
  r7j_marketplace_observation_count:0,
  r7j_current_market_observation_count:0,
  r7j_independent_physical_inspection_count:0,
  source_admission_binding:{
    admission_class:admission.admission_class,
    admission_id:admission.id,
    admission_scope:admission.admission_scope,
    admission_sha256:admissionSha256,
    binding_role:'REPOSITORY_DECLARED_BOUNDED_INTERNAL_METADATA_CALIBRATION_ONLY_NOT_STRICT_R1_LEGAL_ARCHIVE_RUNTIME_MARKET_OR_PROMOTION_EVIDENCE',
    current_market_claim_authorized:false,
    full_source_pool_admission_authorized:false,
    independent_legal_review_complete:false,
    public_commercial_admission_authorized:false,
    repository_declared_identity_calibration_metadata_source_count:2,
    runtime_admission_authorized:false,
    source_content_bytes_archived:false,
    strict_r1_evidence_bound_admitted_source_count:0,
  },
  cases,
  prior_input_sha256:digest(dataset),
  prior_input_sha256_role:'INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE',
  truth_boundary:'R7J adds three live-source-derived, algorithmically labeled DESIGNER_MAKER_EDITION constructed controls using only a repository-declared two-source museum-metadata admission. The admission is not strict R1 evidence-bound revalidation, independent legal review, source-byte archival, full-pool/runtime admission, or public/commercial/current-market authorization. The PHYSICAL_OBJECT hard negative is collection-record identity mechanics without independent physical inspection or provenance verification. Six of seven stratum grammars may be mechanically complete, but empirical accuracy, GRADED_POPULATION, independent Track B, public claims, release, and Production remain blocked.',
};
await fs.writeFile(outputPath, JSON.stringify(canonical(out), null, 2));
console.log(JSON.stringify({
  id:out.id,
  evidence_class:out.dataset_class,
  constructed_control:true,
  empirical_benchmark_eligible:false,
  blind_holdout_count:cases.filter((item) => item.blind_holdout === true).length,
  designer:'Arne Jacobsen',
  manufacturer:'Fritz Hansen',
  model:MODEL_TOKEN,
  exemplars:momaRecords,
  represented_approved_strata_ids:represented,
  repository_declared_metadata_sources:2,
  strict_r1_evidence_bound_sources:0,
  public_claim_authorized:false,
  production:'HOLD',
}, null, 2));
