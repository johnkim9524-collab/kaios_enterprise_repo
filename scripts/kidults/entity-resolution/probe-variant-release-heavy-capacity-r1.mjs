import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseJsonNoDuplicateKeys } from './parse-json-no-duplicate-keys.mjs';

const [samplingPath, outputPath = '/tmp/kidults-er-variant-release-heavy-capacity-r1.json'] = process.argv.slice(2);
if (!samplingPath) {
  throw new Error('usage: node probe-variant-release-heavy-capacity-r1.mjs <sampling-plan.json> [output.json]');
}

const ARTIFACT_ID = 'kidults-er-variant-release-heavy-live-capacity-r1';
const STRATUM_ID = 'er-stratum-variant-release-heavy';
const WIKIDATA_LICENSE = 'https://www.wikidata.org/wiki/Wikidata:Licensing';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const DETAIL_LIMIT = 1000;
const USER_AGENT = 'KIDULTS-VARIANT-RELEASE-CAPACITY/1.0 (read-only empirical preflight)';
const FAILURE_TRUTH_BOUNDARY = 'The live source census did not complete, so every capacity and readiness claim fails closed. No inferred identity or downstream authority is created.';

// The four admitted anchors are exactly the approved VARIANT_RELEASE_HEAVY
// scope examples: sneakers, handbags, designer garments and eyewear. Clothing
// is necessarily broad, so explicit watch paths are rejected to prevent the
// known watch/smartwatch taxonomy path from leaking another KIDULTS stratum.
const SCOPE_CLASSES = {
  Q1929383:'sneakers',
  Q467505:'handbags',
  Q11460:'designer_garments_broad_clothing_anchor',
  Q5422874:'eyewear',
};
const EXCLUDED_CROSS_STRATUM_CLASSES = {
  Q178794:'watch',
  Q26965868:'wristwatch',
  Q5362345:'smartwatch',
  Q125454714:'digital_watch',
};
const DETAIL_QUERY = `SELECT DISTINCT ?item ?scopeClass ?scopePath ?modelNumber ?excludedClass ?exclusionPath WHERE {
  ?item wdt:P13351 ?modelNumber .
  VALUES ?scopeClass { ${Object.keys(SCOPE_CLASSES).map((qid) => `wd:${qid}`).join(' ')} }
  {
    ?item wdt:P31/wdt:P279* ?scopeClass .
    BIND("P31_PATH" AS ?scopePath)
  }
  UNION
  {
    ?item wdt:P279+ ?scopeClass .
    BIND("P279_PATH" AS ?scopePath)
  }
  OPTIONAL {
    VALUES ?excludedClass { ${Object.keys(EXCLUDED_CROSS_STRATUM_CLASSES).map((qid) => `wd:${qid}`).join(' ')} }
    {
      ?item wdt:P31/wdt:P279* ?excludedClass .
      BIND("P31_PATH" AS ?exclusionPath)
    }
    UNION
    {
      ?item wdt:P279+ ?excludedClass .
      BIND("P279_PATH" AS ?exclusionPath)
    }
  }
} ORDER BY ?item ?scopeClass ?scopePath ?modelNumber ?excludedClass ?exclusionPath LIMIT ${DETAIL_LIMIT}`;

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sortedUnique = (values) => [...new Set(values)].sort();
const qidFromUri = (value) => String(value || '').match(/\/entity\/(Q\d+)$/)?.[1] || null;
const literal = (binding, key) => String(binding?.[key]?.value ?? '').trim();
const claimStrings = (entity, property) => (entity?.claims?.[property] || [])
  .map((claim) => claim?.mainsnak?.datavalue?.value)
  .filter((value) => typeof value === 'string' && value.trim())
  .map((value) => value.trim());
const claimItems = (entity, property) => (entity?.claims?.[property] || [])
  .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
  .filter(Boolean);
const evidenceUrl = (qid) => `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
const firstExclusive = (candidateValues, otherValues) => candidateValues.find((value) => !otherValues.includes(value));

if (firstExclusive(['shared', 'left-only'], ['shared', 'right-only']) !== 'left-only' ||
    firstExclusive(['shared', 'right-only'], ['shared', 'left-only']) !== 'right-only') {
  throw new Error('SET_DIFFERENCE_SELECTION_REGRESSION');
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
        signal:controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
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

async function sparql(query) {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
  const payload = await fetchJson(url);
  if (!Array.isArray(payload?.results?.bindings)) throw new Error('WDQS_RESULTS_BINDINGS_REQUIRED');
  return {url, payload};
}

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await fn(values[index], index);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit, values.length)}, () => worker()));
  return output;
}

function targetFromSampling(sampling) {
  const row = (sampling?.strata || []).find((item) => item.stratum_id === STRATUM_ID);
  if (!row) throw new Error('VARIANT_RELEASE_HEAVY_SAMPLING_STRATUM_REQUIRED');
  const classes = row.case_class_targets || {};
  if (row.cases !== 120 || row.blind !== 60 || classes.SAME_OBJECT_NORMALIZATION !== 40 ||
      classes.HARD_NEGATIVE !== 40 || classes.CROSS_MARKET_ALIAS !== 40) {
    throw new Error('VARIANT_RELEASE_HEAVY_120_60_40_40_40_TARGET_REQUIRED');
  }
  return {
    cases:row.cases,
    blind:row.blind,
    per_class:{
      HARD_NEGATIVE:classes.HARD_NEGATIVE,
      CROSS_MARKET_ALIAS:classes.CROSS_MARKET_ALIAS,
      SAME_OBJECT_NORMALIZATION:classes.SAME_OBJECT_NORMALIZATION,
    },
  };
}

function sourceEvidence(qid, payload) {
  return {
    entity_id:qid,
    source_url:evidenceUrl(qid),
    source_payload_sha256:digest(payload),
    license_evidence_refs:[WIKIDATA_LICENSE],
  };
}

function deriveHardNegativeCandidates(records) {
  const candidates = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const sharedBrands = left.brand_or_maker_qids.filter((qid) => right.brand_or_maker_qids.includes(qid));
      const sharedSeries = left.series_or_part_of_qids.filter((qid) => right.series_or_part_of_qids.includes(qid));
      const sharedScopes = left.scope_class_qids.filter((qid) => right.scope_class_qids.includes(qid));
      const leftCode = firstExclusive(left.model_or_style_codes_p13351, right.model_or_style_codes_p13351);
      const rightCode = firstExclusive(right.model_or_style_codes_p13351, left.model_or_style_codes_p13351);
      const leftVariant = firstExclusive(left.variant_discriminators, right.variant_discriminators);
      const rightVariant = firstExclusive(right.variant_discriminators, left.variant_discriminators);
      if (sharedBrands.length && sharedSeries.length && sharedScopes.length && leftCode && rightCode && leftVariant && rightVariant) {
        candidates.push({
          left_record_id:left.record_id,
          right_record_id:right.record_id,
          shared_brand_or_maker_qid:sharedBrands.sort()[0],
          shared_series_or_part_of_qid:sharedSeries.sort()[0],
          shared_scope_class_qid:sharedScopes.sort()[0],
          left_model_or_style_code_p13351:leftCode,
          right_model_or_style_code_p13351:rightCode,
          left_variant_discriminator:leftVariant,
          right_variant_discriminator:rightVariant,
          disposition:'UNLABELED_REVIEW_CANDIDATE_ONLY',
        });
      }
    }
  }
  return candidates;
}

{
  const fixture = deriveHardNegativeCandidates([
    {record_id:'left', brand_or_maker_qids:['QBRAND'], series_or_part_of_qids:['QSERIES'], scope_class_qids:['QSCOPE'],
      model_or_style_codes_p13351:['shared-code', 'left-only-code'], variant_discriminators:['shared-variant', 'left-only-variant']},
    {record_id:'right', brand_or_maker_qids:['QBRAND'], series_or_part_of_qids:['QSERIES'], scope_class_qids:['QSCOPE'],
      model_or_style_codes_p13351:['shared-code', 'right-only-code'], variant_discriminators:['shared-variant', 'right-only-variant']},
  ]);
  if (fixture.length !== 1 || fixture[0].left_model_or_style_code_p13351 !== 'left-only-code' ||
      fixture[0].right_model_or_style_code_p13351 !== 'right-only-code' ||
      fixture[0].left_variant_discriminator !== 'left-only-variant' ||
      fixture[0].right_variant_discriminator !== 'right-only-variant') {
    throw new Error('HARD_NEGATIVE_CALL_SITE_SET_DIFFERENCE_REGRESSION');
  }
}

function deriveNormalizationCandidates(records) {
  return records.map((record) => ({
    record_id:record.record_id,
    wikidata_entity_id:record.item_qid,
    model_or_style_code_p13351:record.model_or_style_codes_p13351[0],
    disposition:'SOURCE_REPRESENTATION_UNLABELED_REVIEW_CANDIDATE_ONLY',
  }));
}

function deriveCrossAuthorityCandidates(records) {
  const candidates = [];
  for (const record of records) {
    for (const code of record.model_or_style_codes_p13351) {
      for (const gtin of record.gtin_identifiers_p3962) {
        candidates.push({
          record_id:record.record_id,
          wikidata_entity_id:record.item_qid,
          model_or_style_code_p13351:code,
          gtin_p3962:gtin,
          disposition:'CROSS_AUTHORITY_UNLABELED_REVIEW_CANDIDATE_ONLY',
        });
      }
    }
  }
  return candidates;
}

function readiness(metrics, target, complete) {
  const requirements = {
    grammar_complete_collectibles_record_floor:target.cases,
    same_object_normalization_candidate_floor:target.per_class.SAME_OBJECT_NORMALIZATION,
    explicit_variant_hard_negative_candidate_floor:target.per_class.HARD_NEGATIVE,
    cross_authority_alias_candidate_floor:target.per_class.CROSS_MARKET_ALIAS,
    blind_source_record_capacity_floor:target.blind,
  };
  const checks = {
    complete_live_census:complete,
    grammar_complete_collectibles_record_floor_met:complete && metrics.grammar_complete_collectibles_record_count >= requirements.grammar_complete_collectibles_record_floor,
    same_object_normalization_candidate_floor_met:complete && metrics.same_object_normalization_candidate_count >= requirements.same_object_normalization_candidate_floor,
    explicit_variant_hard_negative_candidate_floor_met:complete && metrics.explicit_variant_hard_negative_candidate_count >= requirements.explicit_variant_hard_negative_candidate_floor,
    cross_authority_alias_candidate_floor_met:complete && metrics.cross_authority_alias_candidate_count >= requirements.cross_authority_alias_candidate_floor,
    blind_source_record_capacity_floor_met:complete && metrics.grammar_complete_collectibles_record_count >= requirements.blind_source_record_capacity_floor,
    conservative_120_case_class_capacity_met:complete && metrics.conservative_case_capacity >= target.cases,
  };
  const ready = Object.values(checks).every(Boolean);
  const blockers = [];
  if (!checks.complete_live_census) blockers.push('COMPLETE_LIVE_CENSUS_REQUIRED');
  if (!checks.grammar_complete_collectibles_record_floor_met) blockers.push(`GRAMMAR_COMPLETE_COLLECTIBLES_RECORDS_${metrics.grammar_complete_collectibles_record_count ?? 'UNKNOWN'}_OF_${requirements.grammar_complete_collectibles_record_floor}`);
  if (!checks.same_object_normalization_candidate_floor_met) blockers.push(`SAME_OBJECT_NORMALIZATION_CANDIDATES_${metrics.same_object_normalization_candidate_count ?? 'UNKNOWN'}_OF_${requirements.same_object_normalization_candidate_floor}`);
  if (!checks.explicit_variant_hard_negative_candidate_floor_met) blockers.push(`EXPLICIT_VARIANT_HARD_NEGATIVE_CANDIDATES_${metrics.explicit_variant_hard_negative_candidate_count ?? 'UNKNOWN'}_OF_${requirements.explicit_variant_hard_negative_candidate_floor}`);
  if (!checks.cross_authority_alias_candidate_floor_met) blockers.push(`CROSS_AUTHORITY_ALIAS_CANDIDATES_${metrics.cross_authority_alias_candidate_count ?? 'UNKNOWN'}_OF_${requirements.cross_authority_alias_candidate_floor}`);
  if (!checks.blind_source_record_capacity_floor_met) blockers.push(`BLIND_SOURCE_RECORD_CAPACITY_${metrics.grammar_complete_collectibles_record_count ?? 'UNKNOWN'}_OF_${requirements.blind_source_record_capacity_floor}`);
  if (!checks.conservative_120_case_class_capacity_met) blockers.push(`CONSERVATIVE_CASE_CAPACITY_${metrics.conservative_case_capacity ?? 'UNKNOWN'}_OF_${target.cases}`);
  if (complete && metrics.scope_leakage_rejected_item_count > 0 && metrics.collectibles_scope_admitted_item_count === 0) {
    blockers.push(`BROAD_CLOTHING_MODEL_CODE_CANDIDATES_${metrics.broad_model_code_candidate_count}_ALL_REJECTED_AS_CROSS_STRATUM_WATCH_LEAKAGE`);
  }
  return {requirements, checks, ready, blockers};
}

async function writeArtifact(artifact) {
  const sealed = {...artifact, integrity:{canonical_payload_sha256:digest(artifact)}};
  await fs.mkdir(path.dirname(outputPath), {recursive:true});
  await fs.writeFile(outputPath, `${JSON.stringify(sealed, null, 2)}\n`);
  return sealed;
}

function baseArtifact(target, generatedAt) {
  return {
    id:ARTIFACT_ID,
    version:'1.0.0',
    stratum_id:STRATUM_ID,
    generated_at:generatedAt,
    environment_class:'READ_ONLY_LIVE_CAPACITY_PREFLIGHT',
    request_boundary:{http_method:'GET', authenticated:false, remote_mutation:false, local_output_only:true},
    rights_boundary:{
      source_family:'wikidata-cc0-structured-data',
      license:'CC0-1.0',
      license_evidence_ref:WIKIDATA_LICENSE,
      admitted_data:['WDQS_STRUCTURED_BINDINGS', 'SPECIAL_ENTITY_DATA_STRUCTURED_CLAIMS'],
      excluded_data:['IMAGES', 'FREE_TEXT_MINED_VARIANT_IDENTITY', 'MARKETPLACE_OBSERVATIONS', 'CURRENT_PRICE', 'RETAILER_ASSERTIONS'],
    },
    collectibles_only_scope:{
      admitted_scope_class_qids:SCOPE_CLASSES,
      cross_stratum_exclusion_class_qids:EXCLUDED_CROSS_STRATUM_CLASSES,
      rule:'A record must have a WDQS P31/P279 path to an admitted fashion scope and no path to an excluded watch class. Generic product records and broad-clothing watch leakage are rejected.',
    },
    strict_record_grammar:{
      required:['collectibles_only_fashion_scope_path', 'brand_or_maker_p176_or_p1716', 'model_or_style_code_p13351', 'explicit_color_p462_or_material_p186'],
      normalization_candidate_rule:'One source record may expose a Wikidata entity identifier and explicit P13351 model/style code as two source representations; this creates an unlabeled review candidate only.',
      hard_negative_candidate_rule:'Two distinct admitted records must share an explicit brand/maker, series/part-of identifier and scope while exposing distinct P13351 codes and explicit variant discriminators.',
      cross_authority_candidate_rule:'One admitted record must bind explicit P13351 and GTIN P3962 identifiers. This is not marketplace evidence or a match label.',
      disallowed_substitutions:['INFERRED_VARIANT_IDENTITY', 'TEXT_MINED_STYLE_COLOR_SIZE_OR_SEASON', 'GENERIC_CLOTHING_ITEM_WITH_CROSS_STRATUM_WATCH_PATH', 'MARKETPLACE_OR_RETAIL_LISTING_ID', 'CURRENT_PRICE_OR_AVAILABILITY', 'MUSEUM_ACCESSION_NUMBER_ALONE_AS_STYLE_CODE'],
    },
    sampling_target:target,
  };
}

async function run() {
  const sampling = parseJsonNoDuplicateKeys(await fs.readFile(samplingPath, 'utf8'), samplingPath);
  const target = targetFromSampling(sampling);
  const generatedAt = new Date().toISOString();
  const detailResult = await sparql(DETAIL_QUERY);
  if (detailResult.payload.results.bindings.length >= DETAIL_LIMIT) {
    throw new Error('WDQS_DETAIL_LIMIT_REACHED_CAPACITY_UNKNOWN');
  }

  const rawBindings = detailResult.payload.results.bindings;
  const bindings = rawBindings.map((row) => ({
    item:qidFromUri(row?.item?.value),
    scope_class:qidFromUri(row?.scopeClass?.value),
    scope_path:literal(row, 'scopePath'),
    model_number:literal(row, 'modelNumber'),
    excluded_class:qidFromUri(row?.excludedClass?.value),
    exclusion_path:literal(row, 'exclusionPath') || null,
  })).filter((row) => row.item && row.scope_class && row.model_number &&
    Object.hasOwn(SCOPE_CLASSES, row.scope_class) && ['P31_PATH', 'P279_PATH'].includes(row.scope_path) &&
    ((!row.excluded_class && row.exclusion_path === null) ||
      (Object.hasOwn(EXCLUDED_CROSS_STRATUM_CLASSES, row.excluded_class) && ['P31_PATH', 'P279_PATH'].includes(row.exclusion_path))));
  if (bindings.length !== rawBindings.length) throw new Error('WDQS_BINDING_SCHEMA_OR_SCOPE_VALUE_INVALID');
  const bindingKeys = bindings.map((row) => JSON.stringify(row));
  if (bindingKeys.length !== new Set(bindingKeys).size) throw new Error('DUPLICATE_WDQS_BINDING');

  const itemQids = sortedUnique(bindings.map((row) => row.item));
  const entityRows = await mapLimit(itemQids, 4, async (qid) => {
    const payload = await fetchJson(evidenceUrl(qid));
    const entity = payload?.entities?.[qid];
    if (!entity || entity.missing !== undefined) throw new Error(`WIKIDATA_ENTITY_MISSING:${qid}`);
    return [qid, {payload, entity}];
  });
  const entities = new Map(entityRows);

  const candidateRecords = [];
  const rejectedRecords = [];
  for (const itemQid of itemQids) {
    const rows = bindings.filter((row) => row.item === itemQid);
    const {payload, entity} = entities.get(itemQid);
    const queryCodes = sortedUnique(rows.map((row) => row.model_number));
    const sourceCodes = sortedUnique(claimStrings(entity, 'P13351'));
    if (!queryCodes.every((value) => sourceCodes.includes(value))) {
      throw new Error(`ENTITYDATA_MODEL_CODE_REVALIDATION_FAILED:${itemQid}`);
    }
    const excludedClasses = sortedUnique(rows.map((row) => row.excluded_class).filter(Boolean));
    const scopeClasses = sortedUnique(rows.map((row) => row.scope_class));
    const brands = sortedUnique([...claimItems(entity, 'P176'), ...claimItems(entity, 'P1716')]);
    const colors = sortedUnique(claimItems(entity, 'P462'));
    const materials = sortedUnique(claimItems(entity, 'P186'));
    const variants = sortedUnique([...colors.map((qid) => `P462:${qid}`), ...materials.map((qid) => `P186:${qid}`)]);
    const series = sortedUnique([...claimItems(entity, 'P179'), ...claimItems(entity, 'P361')]);
    const gtins = sortedUnique(claimStrings(entity, 'P3962'));
    const base = {
      record_id:`wikidata-variant-release:${itemQid}`,
      item_qid:itemQid,
      scope_class_qids:scopeClasses,
      scope_paths:sortedUnique(rows.map((row) => `${row.scope_path}:${row.scope_class}`)),
      model_or_style_codes_p13351:sourceCodes,
      brand_or_maker_qids:brands,
      color_qids_p462:colors,
      material_qids_p186:materials,
      variant_discriminators:variants,
      series_or_part_of_qids:series,
      gtin_identifiers_p3962:gtins,
      source_evidence:[sourceEvidence(itemQid, payload)],
    };
    const rejectReasons = [];
    if (excludedClasses.length) rejectReasons.push('CROSS_STRATUM_WATCH_CLASSIFICATION_PATH');
    if (brands.length === 0) rejectReasons.push('BRAND_OR_MAKER_P176_P1716_MISSING');
    if (sourceCodes.length === 0) rejectReasons.push('MODEL_OR_STYLE_CODE_P13351_MISSING');
    if (variants.length === 0) rejectReasons.push('EXPLICIT_COLOR_P462_OR_MATERIAL_P186_MISSING');
    if (rejectReasons.length) {
      rejectedRecords.push({...base, excluded_cross_stratum_class_qids:excludedClasses, reject_reasons:rejectReasons});
    } else {
      candidateRecords.push({...base, grammar_complete:true, disposition:'UNLABELED_SOURCE_RECORD_CANDIDATE_ONLY'});
    }
  }
  candidateRecords.sort((left, right) => left.record_id.localeCompare(right.record_id));
  rejectedRecords.sort((left, right) => left.record_id.localeCompare(right.record_id));

  const normalizationCandidates = deriveNormalizationCandidates(candidateRecords);
  const hardNegativeCandidates = deriveHardNegativeCandidates(candidateRecords);
  const crossAuthorityCandidates = deriveCrossAuthorityCandidates(candidateRecords);
  const metrics = {
    wdqs_detail_binding_count:detailResult.payload.results.bindings.length,
    broad_model_code_candidate_count:itemQids.length,
    scope_leakage_rejected_item_count:rejectedRecords.filter((record) => record.reject_reasons.includes('CROSS_STRATUM_WATCH_CLASSIFICATION_PATH')).length,
    collectibles_scope_admitted_item_count:candidateRecords.length,
    grammar_complete_collectibles_record_count:candidateRecords.length,
    same_object_normalization_candidate_count:normalizationCandidates.length,
    explicit_variant_hard_negative_candidate_count:hardNegativeCandidates.length,
    cross_authority_alias_candidate_count:crossAuthorityCandidates.length,
    conservative_case_capacity:
      Math.min(target.per_class.SAME_OBJECT_NORMALIZATION, normalizationCandidates.length) +
      Math.min(target.per_class.HARD_NEGATIVE, hardNegativeCandidates.length) +
      Math.min(target.per_class.CROSS_MARKET_ALIAS, crossAuthorityCandidates.length),
  };
  const gate = readiness(metrics, target, true);
  const artifact = {
    ...baseArtifact(target, generatedAt),
    probe_status:gate.ready ? 'COMPLETE_SOURCE_CAPACITY_READY' : 'COMPLETE_FAIL_CLOSED_INSUFFICIENT_CAPACITY',
    source_snapshot:{
      source_family:'wikidata-cc0-fashion-product-model-structured-data',
      accessed_at:generatedAt,
      detail_query:{endpoint:WIKIDATA_SPARQL, sparql:DETAIL_QUERY, limit:DETAIL_LIMIT, response_sha256:digest(detailResult.payload), truncated:false},
    },
    candidate_records:candidateRecords,
    rejected_records:rejectedRecords,
    same_object_normalization_candidates:normalizationCandidates,
    explicit_variant_hard_negative_candidates:hardNegativeCandidates,
    cross_authority_alias_candidates:crossAuthorityCandidates,
    metrics,
    readiness_gate:{
      requirements:gate.requirements,
      checks:gate.checks,
      source_capacity_ready_for_120_cases:gate.ready,
      acquisition_lane_state:gate.ready ? 'SOURCE_CAPACITY_READY_HUMAN_PROCESS_REQUIRED' : 'SOURCE_FIT_REVALIDATION_REQUIRED',
      blockers:gate.blockers,
    },
    nonclaims:{
      empirical_cases_created:0,
      ground_truth_created:false,
      human_review_assignment_created:false,
      blind_holdout_sealed:false,
      empirical_benchmark_ready:false,
      track_b_started:false,
      release_authority:'NONE',
    },
    truth_boundary:'This is a read-only CC0 source-capacity observation, not an empirical ER dataset. It admits only explicit structured fashion-scope, maker/brand, model/style-code and color/material claims; broad clothing records with a watch path fail closed. Cross-authority identifiers and distinct variant records remain unlabeled review candidates, not identity assertions. No inferred variant identity, marketplace/current-price observation, human review claim or release authority is created.',
  };
  const sealed = await writeArtifact(artifact);
  console.log(JSON.stringify({
    id:sealed.id,
    probe_status:sealed.probe_status,
    broad_model_code_candidate_count:metrics.broad_model_code_candidate_count,
    scope_leakage_rejected_item_count:metrics.scope_leakage_rejected_item_count,
    grammar_complete_collectibles_record_count:metrics.grammar_complete_collectibles_record_count,
    same_object_normalization_candidate_count:metrics.same_object_normalization_candidate_count,
    explicit_variant_hard_negative_candidate_count:metrics.explicit_variant_hard_negative_candidate_count,
    cross_authority_alias_candidate_count:metrics.cross_authority_alias_candidate_count,
    conservative_case_capacity:metrics.conservative_case_capacity,
    source_capacity_ready_for_120_cases:gate.ready,
  }, null, 2));
}

try {
  await run();
} catch (error) {
  const generatedAt = new Date().toISOString();
  let target = {cases:120, blind:60, per_class:{HARD_NEGATIVE:40, CROSS_MARKET_ALIAS:40, SAME_OBJECT_NORMALIZATION:40}};
  try {
    target = targetFromSampling(parseJsonNoDuplicateKeys(await fs.readFile(samplingPath, 'utf8'), samplingPath));
  } catch {
    // Preserve the frozen target in the fail-closed diagnostic artifact.
  }
  const metrics = {
    wdqs_detail_binding_count:null,
    broad_model_code_candidate_count:null,
    scope_leakage_rejected_item_count:null,
    collectibles_scope_admitted_item_count:null,
    grammar_complete_collectibles_record_count:null,
    same_object_normalization_candidate_count:null,
    explicit_variant_hard_negative_candidate_count:null,
    cross_authority_alias_candidate_count:null,
    conservative_case_capacity:null,
  };
  const gate = readiness(metrics, target, false);
  await writeArtifact({
    ...baseArtifact(target, generatedAt),
    probe_status:'SOURCE_UNAVAILABLE_FAIL_CLOSED',
    source_snapshot:{
      source_family:'wikidata-cc0-fashion-product-model-structured-data',
      accessed_at:generatedAt,
      detail_query:{endpoint:WIKIDATA_SPARQL, sparql:DETAIL_QUERY, limit:DETAIL_LIMIT, response_sha256:null, truncated:null},
    },
    candidate_records:[],
    rejected_records:[],
    same_object_normalization_candidates:[],
    explicit_variant_hard_negative_candidates:[],
    cross_authority_alias_candidates:[],
    metrics,
    readiness_gate:{
      requirements:gate.requirements,
      checks:gate.checks,
      source_capacity_ready_for_120_cases:false,
      acquisition_lane_state:'SOURCE_FIT_REVALIDATION_REQUIRED',
      blockers:[...gate.blockers, 'LIVE_SOURCE_PROBE_UNAVAILABLE'],
    },
    nonclaims:{
      empirical_cases_created:0,
      ground_truth_created:false,
      human_review_assignment_created:false,
      blind_holdout_sealed:false,
      empirical_benchmark_ready:false,
      track_b_started:false,
      release_authority:'NONE',
    },
    failure:{code:'SOURCE_PROBE_UNAVAILABLE'},
    truth_boundary:FAILURE_TRUTH_BOUNDARY,
  });
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
