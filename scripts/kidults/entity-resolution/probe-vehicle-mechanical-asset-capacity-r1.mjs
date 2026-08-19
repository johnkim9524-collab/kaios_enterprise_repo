import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseJsonNoDuplicateKeys } from './parse-json-no-duplicate-keys.mjs';

const [samplingPath, outputPath = '/tmp/kidults-er-vehicle-mechanical-asset-capacity-r1.json'] = process.argv.slice(2);
if (!samplingPath) {
  throw new Error('usage: node probe-vehicle-mechanical-asset-capacity-r1.mjs <sampling-plan.json> [output.json]');
}

const ARTIFACT_ID = 'kidults-er-vehicle-mechanical-asset-live-capacity-r1';
const STRATUM_ID = 'er-stratum-vehicle-mechanical-asset';
const FAILURE_TRUTH_BOUNDARY = 'The official live source probe did not complete. Observed capacity is zero for this run and all acquisition and downstream claims fail closed.';
const SOURCE_FAMILY = 'fr-ministry-culture-pop-palissy-mh-open-data';
const SEARCH_ENDPOINT = 'https://api.pop.culture.gouv.fr/search/simple';
const SEARCH_LIMIT = 1000;
const SEARCH_URL = `${SEARCH_ENDPOINT}?bases%5B%5D=palissy&size=${SEARCH_LIMIT}&text=automobile`;
const POP_CGU = 'https://pop.culture.gouv.fr/conditions-generales-utilisation';
const POP_OPEN_DATA = 'https://pop.culture.gouv.fr/donnees-ouvertes';
const ETALAB_LICENSE = 'https://github.com/etalab/licence-ouverte/blob/master/LO.md';
const LICENSE_REFS = [POP_CGU, POP_OPEN_DATA, ETALAB_LICENSE];
const USER_AGENT = 'KIDULTS-ER-VEHICLE-CAPACITY/1.0 (read-only empirical source preflight)';
const ALLOWED_DENOMINATIONS = new Set([
  'voiture automobile',
  'coupé automobile',
  'décapotable',
  'véhicule automobile',
]);

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(canonical(value)),
).digest('hex')}`;
const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const normalizedKey = (value) => normalize(value).toLocaleLowerCase('fr');
const sortedUnique = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));
const asStrings = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .map(normalize).filter(Boolean);
const chassisKey = (value) => normalize(value).replace(/[^\p{L}\p{N}]/gu, '').toLocaleUpperCase('fr');

function extractMaker(authors) {
  const matches = asStrings(authors).map((author) => {
    const match = author.match(/^(.+?)\s*\((usine|constructeur|fabricant)\)$/i);
    return match ? { value:normalize(match[1]), role:normalizedKey(match[2]) } : null;
  }).filter(Boolean);
  const unique = [...new Map(matches.map((row) => [
    `${normalizedKey(row.value)}\0${row.role}`, row,
  ])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function extractModel(appellation) {
  const match = normalize(appellation).match(/^type\s+(.+?)\s*;\s*Collection Schlumpf$/i);
  const value = normalize(match?.[1]);
  return value && !value.includes('?') ? value : null;
}

function extractChassis(inscriptionDetails) {
  const match = normalize(inscriptionDetails)
    .match(/^Num[\u00e9e]ro de s[\u00e9e]rie\s*:\s*n[\u00b0\u00bao]\s*ch[a\u00e2]ssis\s+(.+)$/i);
  const value = normalize(match?.[1]);
  if (!value || /[?()]/.test(value) || /(?:^|\s)(?:ou|ex)(?:\s|$)/i.test(value)) return null;
  return value;
}

function sourcePayload(source) {
  return {
    REF:normalize(source?.REF),
    BASE:normalize(source?.BASE),
    DENO:asStrings(source?.DENO),
    TICO:normalize(source?.TICO),
    APPL:normalize(source?.APPL),
    AUTR:asStrings(source?.AUTR),
    PINS:normalize(source?.PINS),
    INSC:asStrings(source?.INSC),
    DATE:asStrings(source?.DATE),
    DMAJ:normalize(source?.DMAJ),
  };
}

function admitSourceRecord(source) {
  const payload = sourcePayload(source);
  const maker = extractMaker(payload.AUTR);
  const model = extractModel(payload.APPL);
  const chassis = extractChassis(payload.PINS);
  const denominationAllowed = payload.DENO.some((value) => ALLOWED_DENOMINATIONS.has(normalizedKey(value)));
  const serialTypeAsserted = payload.INSC.some((value) => normalizedKey(value) === 'numéro de série');
  if (!/^PM\d{8}$/.test(payload.REF) || payload.BASE !== 'Patrimoine mobilier (Palissy)' ||
      !denominationAllowed || !serialTypeAsserted || !maker || !model || !chassis) return null;
  return {
    record_id:`pop-palissy-vehicle:${payload.REF}`,
    official_record_identifier:{authority:'FR_MINISTRY_CULTURE_POP_PALISSY_MH', value:payload.REF},
    vehicle_scope:'COLLECTOR_CAR',
    maker:{value:maker.value, role:maker.role, source_field:'AUTR'},
    model:{value:model, semantics:'TYPE', source_field:'APPL'},
    chassis_identifier:{value:chassis, semantics:'SOURCE_ASSERTED_NUMERO_DE_SERIE_NUMERO_DE_CHASSIS', source_field:'PINS'},
    source_reference:`https://pop.culture.gouv.fr/notice/palissy/${payload.REF}`,
    source_payload_sha256:digest(payload),
    license_evidence_refs:LICENSE_REFS,
    rights_state:'ALLOW',
    grammar_complete:true,
    source_payload:payload,
  };
}

function deriveCandidatePools(records) {
  const normalization = records.map((record) => ({
    candidate_id:`pop-palissy-vehicle-normalization:${record.official_record_identifier.value}`,
    case_class:'SAME_OBJECT_NORMALIZATION',
    source_record_id:record.record_id,
    official_record_identifier:record.official_record_identifier.value,
    chassis_identifier:record.chassis_identifier.value,
    maker:record.maker.value,
    model:record.model.value,
    candidate_basis:'ONE_OFFICIAL_RECORD_COASSERTS_POP_REFERENCE_AND_CHASSIS_TEXT',
    candidate_state:'UNLABELED_REVIEW_REQUIRED',
  }));
  const hardNegative = [];
  const sameDesignDifferentObject = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const sameMaker = normalizedKey(left.maker.value) === normalizedKey(right.maker.value);
      const sameModel = normalizedKey(left.model.value) === normalizedKey(right.model.value);
      const leftChassis = chassisKey(left.chassis_identifier.value);
      const rightChassis = chassisKey(right.chassis_identifier.value);
      const distinctChassisText = Boolean(leftChassis && rightChassis && leftChassis !== rightChassis);
      if (sameMaker && sameModel && distinctChassisText) {
        sameDesignDifferentObject.push({
          candidate_id:`pop-palissy-vehicle-same-design:${left.official_record_identifier.value}:${right.official_record_identifier.value}`,
          case_class:'SAME_DESIGN_DIFFERENT_OBJECT',
          left_source_record_id:left.record_id,
          right_source_record_id:right.record_id,
          shared_maker:left.maker.value,
          shared_model:left.model.value,
          left_chassis_identifier:left.chassis_identifier.value,
          right_chassis_identifier:right.chassis_identifier.value,
          candidate_basis:'TWO_OFFICIAL_RECORDS_SHARE_EXACT_MAKER_AND_MODEL_TEXT_AND_ASSERT_DISTINCT_CHASSIS_TEXT',
          candidate_state:'UNLABELED_REVIEW_REQUIRED',
        });
      }
      if (sameMaker && !sameModel && distinctChassisText && leftChassis.length === rightChassis.length) {
        hardNegative.push({
          candidate_id:`pop-palissy-vehicle-hard-negative:${left.official_record_identifier.value}:${right.official_record_identifier.value}`,
          case_class:'HARD_NEGATIVE',
          left_source_record_id:left.record_id,
          right_source_record_id:right.record_id,
          shared_maker:left.maker.value,
          left_model:left.model.value,
          right_model:right.model.value,
          left_chassis_identifier:left.chassis_identifier.value,
          right_chassis_identifier:right.chassis_identifier.value,
          confusability_guard:'NORMALIZED_CHASSIS_TEXT_LENGTH_EQUAL',
          candidate_basis:'TWO_OFFICIAL_RECORDS_SHARE_MAKER_AND_CHASSIS_FORMAT_LENGTH_BUT ASSERT_DIFFERENT_MODEL_AND_CHASSIS_TEXT',
          candidate_state:'UNLABELED_REVIEW_REQUIRED',
        });
      }
    }
  }
  return {normalization, hardNegative, sameDesignDifferentObject};
}

const SELECTION_POLICY = {
  order:['SAME_DESIGN_DIFFERENT_OBJECT', 'HARD_NEGATIVE', 'SAME_OBJECT_NORMALIZATION'],
  source_record_reuse_across_selected_cases:'PROHIBITED',
  blind_partition_constraint:'ALL_120_SELECTED_CASES_ARE_GLOBALLY_SOURCE_RECORD_DISJOINT_BEFORE_ANY_60_CASE_BLIND_PARTITION',
  boundary_assignment:{
    SAME_OBJECT_NORMALIZATION:{SOURCE_RECORD:35, PHYSICAL_OBJECT:5},
    HARD_NEGATIVE:{PHYSICAL_OBJECT:30, CANONICAL_DESIGN:10},
    SAME_DESIGN_DIFFERENT_OBJECT:{CANONICAL_DESIGN:40},
  },
};

function candidateSourceRecordIds(candidate) {
  return candidate.case_class === 'SAME_OBJECT_NORMALIZATION'
    ? [candidate.source_record_id]
    : [candidate.left_source_record_id, candidate.right_source_record_id];
}

function takeSourceRecordDisjoint(rows, count, used) {
  const selected = [];
  for (const row of rows) {
    const sourceRecordIds = candidateSourceRecordIds(row);
    if (sourceRecordIds.every((recordId) => recordId && !used.has(recordId))) {
      selected.push(row);
      for (const recordId of sourceRecordIds) used.add(recordId);
      if (selected.length === count) break;
    }
  }
  return selected;
}

function assignBoundary(row, identityBoundary, boundaryAssignmentBasis) {
  return {
    ...row,
    source_record_ids:candidateSourceRecordIds(row),
    identity_boundary:identityBoundary,
    boundary_assignment_basis:boundaryAssignmentBasis,
  };
}

function selectCandidates(pools, target) {
  const used = new Set();
  const sameDesign = takeSourceRecordDisjoint(
    pools.sameDesignDifferentObject,
    target.per_class.SAME_DESIGN_DIFFERENT_OBJECT,
    used,
  );
  const hardNegative = takeSourceRecordDisjoint(
    pools.hardNegative,
    target.per_class.HARD_NEGATIVE,
    used,
  );
  const normalization = takeSourceRecordDisjoint(
    pools.normalization,
    target.per_class.SAME_OBJECT_NORMALIZATION,
    used,
  );
  return {
    SAME_OBJECT_NORMALIZATION:normalization.map((row, index) => index < 35
      ? assignBoundary(row, 'SOURCE_RECORD', 'OFFICIAL_PM_RECORD_AND_NORMALIZED_CHASSIS_REFERENCE_PAIR')
      : assignBoundary(row, 'PHYSICAL_OBJECT', 'ONE_OFFICIAL_RECORD_COASSERTS_A_PHYSICAL_CHASSIS_REFERENCE')),
    HARD_NEGATIVE:hardNegative.map((row, index) => index < 30
      ? assignBoundary(row, 'PHYSICAL_OBJECT', 'DISTINCT_SOURCE_ASSERTED_CHASSIS_REFERENCES_REQUIRE_OBJECT_SEPARATION_REVIEW')
      : assignBoundary(row, 'CANONICAL_DESIGN', 'DISTINCT_SOURCE_ASSERTED_MODEL_TYPES_REQUIRE_DESIGN_SEPARATION_REVIEW')),
    SAME_DESIGN_DIFFERENT_OBJECT:sameDesign.map((row) => assignBoundary(
      row,
      'CANONICAL_DESIGN',
      'SHARED_SOURCE_ASSERTED_MAKER_AND_MODEL_WITH_DISTINCT_CHASSIS_REFERENCES',
    )),
  };
}

function selectedEvidence(selected) {
  const rows = Object.values(selected).flat();
  const sourceRecordIds = rows.flatMap((row) => row.source_record_ids || []);
  const boundaryCounts = rows.reduce((counts, row) => {
    counts[row.identity_boundary] = (counts[row.identity_boundary] || 0) + 1;
    return counts;
  }, {});
  return {
    selectedCount:rows.length,
    selectedSourceRecordCount:new Set(sourceRecordIds).size,
    selectedSourceRecordReuseCount:sourceRecordIds.length - new Set(sourceRecordIds).size,
    boundaryCounts,
    blindPartitionSourceRecordDisjointnessGuaranteed:
      rows.length > 0 && sourceRecordIds.length === new Set(sourceRecordIds).size,
  };
}

function targetFromSampling(sampling) {
  const row = (sampling?.strata || []).find((item) => item.stratum_id === STRATUM_ID);
  const classes = row?.case_class_targets || {};
  const boundaries = row?.identity_boundary_targets || {};
  if (row?.cases !== 120 || row?.blind !== 60 || classes.SAME_OBJECT_NORMALIZATION !== 40 ||
      classes.HARD_NEGATIVE !== 40 || classes.SAME_DESIGN_DIFFERENT_OBJECT !== 40 ||
      boundaries.SOURCE_RECORD !== 35 || boundaries.PHYSICAL_OBJECT !== 35 ||
      boundaries.CANONICAL_DESIGN !== 50) {
    throw new Error('VEHICLE_MECHANICAL_120_60_40_40_40_AND_35_35_50_TARGET_REQUIRED');
  }
  return {
    cases:row.cases,
    blind:row.blind,
    per_class:{
      SAME_OBJECT_NORMALIZATION:classes.SAME_OBJECT_NORMALIZATION,
      HARD_NEGATIVE:classes.HARD_NEGATIVE,
      SAME_DESIGN_DIFFERENT_OBJECT:classes.SAME_DESIGN_DIFFERENT_OBJECT,
    },
    per_boundary:{
      SOURCE_RECORD:boundaries.SOURCE_RECORD,
      PHYSICAL_OBJECT:boundaries.PHYSICAL_OBJECT,
      CANONICAL_DESIGN:boundaries.CANONICAL_DESIGN,
    },
    selected_source_record_count:200,
  };
}

function readiness(metrics, target) {
  const requirements = {
    strict_grammar_complete_record_floor:target.cases,
    same_object_normalization_candidate_floor:target.per_class.SAME_OBJECT_NORMALIZATION,
    hard_negative_candidate_floor:target.per_class.HARD_NEGATIVE,
    same_design_different_object_candidate_floor:target.per_class.SAME_DESIGN_DIFFERENT_OBJECT,
    selected_unlabeled_case_candidate_floor:target.cases,
    blind_source_record_capacity_floor:target.blind,
    selected_source_record_count_required:target.selected_source_record_count,
    selected_source_record_reuse_maximum:0,
    source_record_boundary_candidate_count_required:target.per_boundary.SOURCE_RECORD,
    physical_object_boundary_candidate_count_required:target.per_boundary.PHYSICAL_OBJECT,
    canonical_design_boundary_candidate_count_required:target.per_boundary.CANONICAL_DESIGN,
  };
  const checks = {
    strict_grammar_complete_record_floor_met:metrics.strict_grammar_complete_real_record_count >= requirements.strict_grammar_complete_record_floor,
    same_object_normalization_candidate_floor_met:metrics.same_object_normalization_candidate_count >= requirements.same_object_normalization_candidate_floor,
    hard_negative_candidate_floor_met:metrics.hard_negative_candidate_pair_count >= requirements.hard_negative_candidate_floor,
    same_design_different_object_candidate_floor_met:metrics.same_design_different_object_candidate_pair_count >= requirements.same_design_different_object_candidate_floor,
    selected_unlabeled_case_candidate_floor_met:metrics.selected_unlabeled_case_candidate_count >= requirements.selected_unlabeled_case_candidate_floor,
    blind_source_record_capacity_floor_met:metrics.selected_source_record_count >= requirements.blind_source_record_capacity_floor,
    selected_source_record_count_exact:metrics.selected_source_record_count === requirements.selected_source_record_count_required,
    selected_source_record_reuse_prohibited:metrics.selected_source_record_reuse_count === requirements.selected_source_record_reuse_maximum,
    source_record_boundary_target_exact:metrics.source_record_boundary_candidate_count === requirements.source_record_boundary_candidate_count_required,
    physical_object_boundary_target_exact:metrics.physical_object_boundary_candidate_count === requirements.physical_object_boundary_candidate_count_required,
    canonical_design_boundary_target_exact:metrics.canonical_design_boundary_candidate_count === requirements.canonical_design_boundary_candidate_count_required,
    blind_partition_source_record_disjointness_guaranteed:metrics.blind_partition_source_record_disjointness_guaranteed === true,
    conservative_120_case_class_capacity_met:metrics.conservative_case_capacity >= target.cases,
  };
  const ready = Object.values(checks).every(Boolean);
  const blockers = [];
  if (!checks.strict_grammar_complete_record_floor_met) blockers.push(`STRICT_GRAMMAR_COMPLETE_REAL_RECORDS_${metrics.strict_grammar_complete_real_record_count}_OF_${requirements.strict_grammar_complete_record_floor}`);
  if (!checks.same_object_normalization_candidate_floor_met) blockers.push(`SAME_OBJECT_NORMALIZATION_CANDIDATES_${metrics.same_object_normalization_candidate_count}_OF_${requirements.same_object_normalization_candidate_floor}`);
  if (!checks.hard_negative_candidate_floor_met) blockers.push(`HARD_NEGATIVE_CANDIDATES_${metrics.hard_negative_candidate_pair_count}_OF_${requirements.hard_negative_candidate_floor}`);
  if (!checks.same_design_different_object_candidate_floor_met) blockers.push(`SAME_DESIGN_DIFFERENT_OBJECT_CANDIDATES_${metrics.same_design_different_object_candidate_pair_count}_OF_${requirements.same_design_different_object_candidate_floor}`);
  if (!checks.selected_unlabeled_case_candidate_floor_met) blockers.push(`SELECTED_UNLABELED_CASE_CANDIDATES_${metrics.selected_unlabeled_case_candidate_count}_OF_${requirements.selected_unlabeled_case_candidate_floor}`);
  if (!checks.blind_source_record_capacity_floor_met) blockers.push(`BLIND_SOURCE_RECORD_CAPACITY_${metrics.selected_source_record_count}_OF_${requirements.blind_source_record_capacity_floor}`);
  if (!checks.selected_source_record_count_exact) blockers.push(`SELECTED_SOURCE_RECORDS_${metrics.selected_source_record_count}_OF_${requirements.selected_source_record_count_required}`);
  if (!checks.selected_source_record_reuse_prohibited) blockers.push(`SELECTED_SOURCE_RECORD_REUSE_${metrics.selected_source_record_reuse_count}_MAX_${requirements.selected_source_record_reuse_maximum}`);
  if (!checks.source_record_boundary_target_exact) blockers.push(`SOURCE_RECORD_BOUNDARY_${metrics.source_record_boundary_candidate_count}_OF_${requirements.source_record_boundary_candidate_count_required}`);
  if (!checks.physical_object_boundary_target_exact) blockers.push(`PHYSICAL_OBJECT_BOUNDARY_${metrics.physical_object_boundary_candidate_count}_OF_${requirements.physical_object_boundary_candidate_count_required}`);
  if (!checks.canonical_design_boundary_target_exact) blockers.push(`CANONICAL_DESIGN_BOUNDARY_${metrics.canonical_design_boundary_candidate_count}_OF_${requirements.canonical_design_boundary_candidate_count_required}`);
  if (!checks.blind_partition_source_record_disjointness_guaranteed) blockers.push('BLIND_PARTITION_SOURCE_RECORD_DISJOINTNESS_NOT_GUARANTEED');
  if (!checks.conservative_120_case_class_capacity_met) blockers.push(`CONSERVATIVE_CASE_CAPACITY_${metrics.conservative_case_capacity}_OF_${target.cases}`);
  return {requirements, checks, ready, blockers};
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(url, {
        method:'GET',
        headers:{accept:'application/json,text/html;q=0.9', 'user-agent':USER_AGENT},
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function writeArtifact(artifact) {
  const sealed = {...artifact, integrity:{canonical_payload_sha256:digest(artifact)}};
  await fs.mkdir(path.dirname(outputPath), {recursive:true});
  await fs.writeFile(outputPath, `${JSON.stringify(sealed, null, 2)}\n`);
  return sealed;
}

function emptyMetrics() {
  return {
    live_search_total_hit_count:0,
    live_search_returned_hit_count:0,
    strict_grammar_complete_real_record_count:0,
    same_object_normalization_candidate_count:0,
    hard_negative_candidate_pair_count:0,
    same_design_different_object_candidate_pair_count:0,
    selected_unlabeled_case_candidate_count:0,
    selected_source_record_count:0,
    selected_source_record_reuse_count:0,
    source_record_boundary_candidate_count:0,
    physical_object_boundary_candidate_count:0,
    canonical_design_boundary_candidate_count:0,
    blind_partition_source_record_disjointness_guaranteed:false,
    conservative_case_capacity:0,
    nhtsa_vpic_case_capacity:0,
  };
}

async function run() {
  const sampling = parseJsonNoDuplicateKeys(await fs.readFile(samplingPath, 'utf8'), samplingPath);
  const target = targetFromSampling(sampling);
  const accessedAt = new Date().toISOString();
  const [searchText, cguText, openDataText] = await Promise.all([
    fetchText(SEARCH_URL),
    fetchText(POP_CGU),
    fetchText(POP_OPEN_DATA),
  ]);
  const search = parseJsonNoDuplicateKeys(searchText, SEARCH_ENDPOINT);
  if (!/Licence etalab-2\.0/i.test(cguText)) throw new Error('POP_ETALAB_2_LICENSE_MARKER_MISSING');
  if (!/Palissy MH/i.test(openDataText) || !/OpenData/i.test(openDataText)) {
    throw new Error('POP_PALISSY_MH_OPEN_DATA_MARKER_MISSING');
  }
  if (search?.timed_out !== false || !Number.isInteger(search?.total) || !Array.isArray(search?.hits) ||
      search.total < 0 || search.total > SEARCH_LIMIT || search.hits.length !== search.total) {
    throw new Error(`POP_COMPLETE_SEARCH_CENSUS_REQUIRED:${search?.total ?? 'UNKNOWN'}:${search?.hits?.length ?? 'UNKNOWN'}`);
  }

  const records = search.hits.map((hit) => admitSourceRecord(hit?._source)).filter(Boolean)
    .sort((left, right) => left.official_record_identifier.value.localeCompare(right.official_record_identifier.value));
  if (records.length !== new Set(records.map((record) => record.official_record_identifier.value)).size) {
    throw new Error('DUPLICATE_POP_PALISSY_OFFICIAL_RECORD_IDENTIFIER');
  }
  const pools = deriveCandidatePools(records);
  const searchSelectionInputProjection = search.hits.map((hit) => ({
    hit_id:normalize(hit?._id),
    source_payload:sourcePayload(hit?._source),
  })).sort((left, right) => left.hit_id.localeCompare(right.hit_id));
  const selected = selectCandidates(pools, target);
  const evidence = selectedEvidence(selected);
  const metrics = {
    live_search_total_hit_count:search.total,
    live_search_returned_hit_count:search.hits.length,
    strict_grammar_complete_real_record_count:records.length,
    same_object_normalization_candidate_count:pools.normalization.length,
    hard_negative_candidate_pair_count:pools.hardNegative.length,
    same_design_different_object_candidate_pair_count:pools.sameDesignDifferentObject.length,
    selected_unlabeled_case_candidate_count:evidence.selectedCount,
    selected_source_record_count:evidence.selectedSourceRecordCount,
    selected_source_record_reuse_count:evidence.selectedSourceRecordReuseCount,
    source_record_boundary_candidate_count:evidence.boundaryCounts.SOURCE_RECORD || 0,
    physical_object_boundary_candidate_count:evidence.boundaryCounts.PHYSICAL_OBJECT || 0,
    canonical_design_boundary_candidate_count:evidence.boundaryCounts.CANONICAL_DESIGN || 0,
    blind_partition_source_record_disjointness_guaranteed:evidence.blindPartitionSourceRecordDisjointnessGuaranteed,
    conservative_case_capacity:evidence.selectedSourceRecordReuseCount === 0 ? evidence.selectedCount : 0,
    nhtsa_vpic_case_capacity:0,
  };
  const gate = readiness(metrics, target);
  const artifact = {
    id:ARTIFACT_ID,
    version:'1.1.0',
    stratum_id:STRATUM_ID,
    generated_at:accessedAt,
    probe_status:gate.ready ? 'COMPLETE_SOURCE_CAPACITY_READY' : 'COMPLETE_FAIL_CLOSED_INSUFFICIENT_CAPACITY',
    environment_class:'READ_ONLY_LIVE_CAPACITY_PREFLIGHT',
    request_boundary:{http_method:'GET', authenticated:false, remote_mutation:false, local_output_only:true},
    source_snapshot:{
      source_family:SOURCE_FAMILY,
      publisher:'Ministère de la Culture',
      database:'Palissy MH - patrimoine mobilier',
      license:'Licence Ouverte / Open Licence 2.0 (Etalab-2.0)',
      rights_scope:'TEXTUAL_DESCRIPTIVE_NOTICE_DATA_ONLY_NO_IMAGES',
      license_evidence_refs:LICENSE_REFS,
      accessed_at:accessedAt,
      search_query:{
        endpoint:SEARCH_ENDPOINT,
        http_method:'GET',
        parameters:{bases:['palissy'], size:SEARCH_LIMIT, text:'automobile'},
        complete_census:true,
        total_hits:search.total,
        returned_hits:search.hits.length,
        response_sha256:digest({
          timed_out:search.timed_out,
          total:search.total,
          hits:searchSelectionInputProjection,
        }),
        response_digest_scope:'CANONICAL_COMPLETE_SELECTION_INPUT_PROJECTION_ALL_RETURNED_HITS',
        response_projection_hit_count:searchSelectionInputProjection.length,
        admitted_records_projection_sha256:digest(records.map((record) => ({
          record_id:record.record_id,
          source_payload_sha256:record.source_payload_sha256,
        }))),
      },
      license_snapshots:{
        conditions_general_use:{url:POP_CGU, response_sha256:digest(cguText), required_marker:'Licence etalab-2.0'},
        open_data_inventory:{url:POP_OPEN_DATA, response_sha256:digest(openDataText), required_markers:['Palissy MH', 'OpenData']},
      },
    },
    strict_record_grammar:{
      required:[
        'official_palissy_mh_pm_reference',
        'physical_collector_car_denomination',
        'single_source_asserted_maker_with_usine_constructeur_or_fabricant_role',
        'source_asserted_type_model_in_collection_schlumpf_appellation',
        'source_asserted_numero_de_serie_numero_de_chassis',
      ],
      rejected:[
        'NON_PM_PALISSY_RECORD',
        'NON_VEHICLE_OR_MODEL_REPLICA_DENOMINATION',
        'MISSING_OR_MULTIPLE_MAKER_SEMANTICS',
        'MISSING_OR_UNCERTAIN_MODEL_TYPE',
        'MISSING_OR_UNCERTAIN_CHASSIS_TEXT',
        'IMAGE_OR_MEDIA_RIGHTS_AS_CAPACITY_EVIDENCE',
      ],
      no_physical_identity_inference:true,
      candidate_classification_requires_independent_review:true,
    },
    source_admission:{
      pop_palissy_mh_open_text_admitted:true,
      image_or_media_payloads_admitted:false,
      nhtsa_vpic_bulk_use_prohibited:true,
      nhtsa_vpic_used:false,
      nhtsa_vpic_contribution_to_capacity:0,
    },
    sampling_target:target,
    records,
    candidate_manifest:{
      manifest_state:'UNLABELED_SOURCE_EVIDENCE_CANDIDATES_ONLY',
      labels_present:false,
      model_predictions_present:false,
      selection_policy:SELECTION_POLICY,
      selected,
    },
    metrics,
    readiness_gate:{
      requirements:gate.requirements,
      checks:gate.checks,
      source_capacity_ready_for_120_cases:gate.ready,
      acquisition_lane_state:gate.ready ? 'START_READY_SOURCE_ACQUISITION_UNLABELED' : 'SOURCE_FIT_REVALIDATION_REQUIRED',
      blockers:gate.blockers,
    },
    downstream_claims:{
      empirical_cases_created:0,
      labels_collected:0,
      reviewers_assigned:0,
      independent_label_review_complete:false,
      blind_holdout_sealed:false,
      market_claims_created:0,
      spend_authorized:false,
      empirical_benchmark_ready:false,
      track_b_started:false,
      publication:'HOLD',
      production:'HOLD',
    },
    truth_boundary:'This artifact is a read-only capacity observation over official French Ministry of Culture POP/Palissy MH textual records. It selects only records whose source text explicitly co-asserts an official PM reference, physical collector-car denomination, one maker role, model type, and unambiguous chassis/serial text. The deterministic 120-candidate manifest uses 200 distinct source records with zero record reuse, binds the frozen 35 SOURCE_RECORD / 35 PHYSICAL_OBJECT / 50 CANONICAL_DESIGN review axes, and therefore permits a future 60-case blind split without cross-case source-record leakage. Boundary assignments and pair groupings remain unlabeled review axes, not physical-identity conclusions. Images, NHTSA vPIC, inferred identity, labels, reviewers, blind sealing, market claims, spend, empirical accuracy, Track B, publication and Production are excluded or remain blocked.',
  };
  const sealed = await writeArtifact(artifact);
  console.log(JSON.stringify({
    id:sealed.id,
    probe_status:sealed.probe_status,
    strict_grammar_complete_real_record_count:metrics.strict_grammar_complete_real_record_count,
    same_object_normalization_candidate_count:metrics.same_object_normalization_candidate_count,
    hard_negative_candidate_pair_count:metrics.hard_negative_candidate_pair_count,
    same_design_different_object_candidate_pair_count:metrics.same_design_different_object_candidate_pair_count,
    selected_unlabeled_case_candidate_count:metrics.selected_unlabeled_case_candidate_count,
    selected_source_record_count:metrics.selected_source_record_count,
    selected_source_record_reuse_count:metrics.selected_source_record_reuse_count,
    identity_boundary_counts:{
      SOURCE_RECORD:metrics.source_record_boundary_candidate_count,
      PHYSICAL_OBJECT:metrics.physical_object_boundary_candidate_count,
      CANONICAL_DESIGN:metrics.canonical_design_boundary_candidate_count,
    },
    conservative_case_capacity:metrics.conservative_case_capacity,
    source_capacity_ready_for_120_cases:gate.ready,
    output:outputPath,
  }, null, 2));
  if (!gate.ready) process.exitCode = 3;
}

try {
  await run();
} catch (error) {
  let target = {
    cases:120,
    blind:60,
    per_class:{SAME_OBJECT_NORMALIZATION:40, HARD_NEGATIVE:40, SAME_DESIGN_DIFFERENT_OBJECT:40},
    per_boundary:{SOURCE_RECORD:35, PHYSICAL_OBJECT:35, CANONICAL_DESIGN:50},
    selected_source_record_count:200,
  };
  try {
    target = targetFromSampling(parseJsonNoDuplicateKeys(await fs.readFile(samplingPath, 'utf8'), samplingPath));
  } catch {}
  const metrics = emptyMetrics();
  const gate = readiness(metrics, target);
  const failure = {
    id:ARTIFACT_ID,
    version:'1.1.0',
    stratum_id:STRATUM_ID,
    generated_at:new Date().toISOString(),
    probe_status:'SOURCE_UNAVAILABLE_FAIL_CLOSED',
    environment_class:'READ_ONLY_LIVE_CAPACITY_PREFLIGHT',
    request_boundary:{http_method:'GET', authenticated:false, remote_mutation:false, local_output_only:true},
    source_snapshot:{
      source_family:SOURCE_FAMILY,
      publisher:'Ministère de la Culture',
      database:'Palissy MH - patrimoine mobilier',
      license:'Licence Ouverte / Open Licence 2.0 (Etalab-2.0)',
      rights_scope:'TEXTUAL_DESCRIPTIVE_NOTICE_DATA_ONLY_NO_IMAGES',
      license_evidence_refs:LICENSE_REFS,
    },
    strict_record_grammar:{
      required:['official_palissy_mh_pm_reference', 'physical_collector_car_denomination', 'single_source_asserted_maker_with_usine_constructeur_or_fabricant_role', 'source_asserted_type_model_in_collection_schlumpf_appellation', 'source_asserted_numero_de_serie_numero_de_chassis'],
      no_physical_identity_inference:true,
      candidate_classification_requires_independent_review:true,
    },
    source_admission:{pop_palissy_mh_open_text_admitted:false, image_or_media_payloads_admitted:false, nhtsa_vpic_bulk_use_prohibited:true, nhtsa_vpic_used:false, nhtsa_vpic_contribution_to_capacity:0},
    sampling_target:target,
    records:[],
    candidate_manifest:{manifest_state:'UNLABELED_SOURCE_EVIDENCE_CANDIDATES_ONLY', labels_present:false, model_predictions_present:false, selection_policy:SELECTION_POLICY, selected:{SAME_OBJECT_NORMALIZATION:[], HARD_NEGATIVE:[], SAME_DESIGN_DIFFERENT_OBJECT:[]}},
    metrics,
    readiness_gate:{requirements:gate.requirements, checks:gate.checks, source_capacity_ready_for_120_cases:false, acquisition_lane_state:'SOURCE_FIT_REVALIDATION_REQUIRED', blockers:['LIVE_SOURCE_PROBE_UNAVAILABLE', ...gate.blockers]},
    downstream_claims:{empirical_cases_created:0, labels_collected:0, reviewers_assigned:0, independent_label_review_complete:false, blind_holdout_sealed:false, market_claims_created:0, spend_authorized:false, empirical_benchmark_ready:false, track_b_started:false, publication:'HOLD', production:'HOLD'},
    failure:{code:'SOURCE_PROBE_UNAVAILABLE'},
    truth_boundary:FAILURE_TRUTH_BOUNDARY,
  };
  await writeArtifact(failure);
  console.error(`FAIL_CLOSED: ${failure.failure.code}`);
  process.exitCode = 2;
}
