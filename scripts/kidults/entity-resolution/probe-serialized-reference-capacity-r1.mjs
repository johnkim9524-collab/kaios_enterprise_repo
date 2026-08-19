import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [samplingPath, outputPath = '/tmp/kidults-er-serialized-reference-capacity-r1.json'] = process.argv.slice(2);
if (!samplingPath) {
  throw new Error('usage: node probe-serialized-reference-capacity-r1.mjs <sampling-plan.json> [output.json]');
}

const ARTIFACT_ID = 'kidults-er-serialized-reference-live-capacity-r1';
const STRATUM_ID = 'er-stratum-serialized-reference';
const WIKIDATA_LICENSE = 'https://www.wikidata.org/wiki/Wikidata:Licensing';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const PRODUCT_MODEL_CLASS = 'Q10929058';
const DETAIL_LIMIT = 1000;
const USER_AGENT = 'KIDULTS-SERIALIZED-REFERENCE-CAPACITY/1.0 (read-only empirical preflight)';

// Strict capacity grammar. P31 is admitted as a model/reference only where the
// target has a WDQS path to Wikidata's product-model class (Q10929058).
// P217 is admitted only when the statement is qualified with collection P195.
const WHERE = `
  ?item wdt:P2598 ?serial ;
        p:P217 ?inventoryStatement ;
        wdt:P31 ?model .
  ?inventoryStatement ps:P217 ?inventory ;
                      pq:P195 ?collection .
  {
    ?item wdt:P176 ?maker .
    BIND("ITEM_P176" AS ?makerPath)
  }
  UNION
  {
    ?model wdt:P176 ?maker .
    BIND("MODEL_P176" AS ?makerPath)
  }
  {
    { ?model wdt:P31/wdt:P279* wd:${PRODUCT_MODEL_CLASS} . }
    UNION
    { ?model wdt:P279+ wd:${PRODUCT_MODEL_CLASS} . }
  }
  FILTER(STR(?serial) != STR(?inventory))
`;
const COUNT_QUERY = `SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE { ${WHERE} }`;
const DETAIL_QUERY = `SELECT DISTINCT ?item ?serial ?inventory ?collection ?model ?maker ?makerPath WHERE { ${WHERE} } ORDER BY ?item ?serial ?inventory ?collection ?model ?maker ?makerPath LIMIT ${DETAIL_LIMIT}`;

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const sortedUnique = (values) => [...new Set(values)].sort();
const entityId = (value) => String(value || '').match(/\/entity\/(Q\d+)$/)?.[1] || null;
const literal = (binding, key) => String(binding?.[key]?.value ?? '').trim();
const bindingEntity = (binding, key) => entityId(binding?.[key]?.value);
const claimStrings = (entity, property) => (entity?.claims?.[property] || [])
  .map((claim) => claim?.mainsnak?.datavalue?.value)
  .filter((value) => typeof value === 'string' && value.trim());
const claimItems = (entity, property) => (entity?.claims?.[property] || [])
  .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
  .filter(Boolean);
const label = (entity) => entity?.labels?.en?.value || entity?.labels?.mul?.value || null;
const evidenceUrl = (qid) => `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;

function inventoryPairs(entity) {
  const pairs = [];
  for (const statement of entity?.claims?.P217 || []) {
    const inventory = statement?.mainsnak?.datavalue?.value;
    if (typeof inventory !== 'string' || !inventory.trim()) continue;
    for (const qualifier of statement?.qualifiers?.P195 || []) {
      const collection = qualifier?.datavalue?.value?.id;
      if (collection) pairs.push({inventory:inventory.trim(), collection});
    }
  }
  return pairs;
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
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return await response.json();
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

function sourceEvidence(qid, payload, role) {
  return {
    role,
    entity_id:qid,
    source_url:evidenceUrl(qid),
    source_payload_sha256:digest(payload),
    license_evidence_refs:[WIKIDATA_LICENSE],
  };
}

function targetFromSampling(sampling) {
  const row = (sampling?.strata || []).find((item) => item.stratum_id === STRATUM_ID);
  if (!row) throw new Error('SERIALIZED_REFERENCE_SAMPLING_STRATUM_REQUIRED');
  const classes = row.case_class_targets || {};
  if (row.cases !== 120 || row.blind !== 60 || classes.SAME_OBJECT_NORMALIZATION !== 40 ||
      classes.HARD_NEGATIVE !== 40 || classes.CROSS_MARKET_ALIAS !== 40) {
    throw new Error('SERIALIZED_REFERENCE_120_60_40_40_40_TARGET_REQUIRED');
  }
  return {
    cases:row.cases,
    blind:row.blind,
    per_class:{
      SAME_OBJECT_NORMALIZATION:classes.SAME_OBJECT_NORMALIZATION,
      HARD_NEGATIVE:classes.HARD_NEGATIVE,
      CROSS_MARKET_ALIAS:classes.CROSS_MARKET_ALIAS,
    },
  };
}

function readiness(metrics, target) {
  const requirements = {
    grammar_complete_record_floor:target.cases,
    normalization_candidate_floor:target.per_class.SAME_OBJECT_NORMALIZATION,
    same_model_distinct_serial_hard_negative_pair_floor:target.per_class.HARD_NEGATIVE,
    cross_authority_alias_pair_floor:target.per_class.CROSS_MARKET_ALIAS,
    blind_source_record_capacity_floor:target.blind,
  };
  const checks = {
    grammar_complete_record_floor_met:metrics.grammar_complete_real_record_count >= requirements.grammar_complete_record_floor,
    normalization_candidate_floor_met:metrics.normalization_candidate_capacity >= requirements.normalization_candidate_floor,
    same_model_distinct_serial_hard_negative_pair_floor_met:metrics.same_model_distinct_serial_hard_negative_pair_count >= requirements.same_model_distinct_serial_hard_negative_pair_floor,
    cross_authority_alias_pair_floor_met:metrics.cross_authority_alias_pair_count >= requirements.cross_authority_alias_pair_floor,
    blind_source_record_capacity_floor_met:metrics.grammar_complete_real_record_count >= requirements.blind_source_record_capacity_floor,
    conservative_120_case_class_capacity_met:metrics.conservative_case_capacity >= target.cases,
  };
  const sourceCapacityReady = Object.values(checks).every(Boolean);
  const blockers = [];
  if (!checks.grammar_complete_record_floor_met) blockers.push('GRAMMAR_COMPLETE_REAL_RECORD_FLOOR_120_NOT_MET');
  if (!checks.normalization_candidate_floor_met) blockers.push('NORMALIZATION_CANDIDATE_FLOOR_40_NOT_MET');
  if (!checks.same_model_distinct_serial_hard_negative_pair_floor_met) blockers.push('SAME_MODEL_DISTINCT_SERIAL_HARD_NEGATIVE_PAIR_FLOOR_40_NOT_MET');
  if (!checks.cross_authority_alias_pair_floor_met) blockers.push('CROSS_AUTHORITY_ALIAS_PAIR_FLOOR_40_NOT_MET');
  if (!checks.blind_source_record_capacity_floor_met) blockers.push('BLIND_SOURCE_RECORD_CAPACITY_FLOOR_60_NOT_MET');
  if (!checks.conservative_120_case_class_capacity_met) blockers.push('CONSERVATIVE_120_CASE_CLASS_CAPACITY_NOT_MET');
  return {requirements, checks, sourceCapacityReady, blockers};
}

async function writeArtifact(artifact) {
  const sealed = {...artifact, integrity:{canonical_payload_sha256:digest(artifact)}};
  await fs.mkdir(path.dirname(outputPath), {recursive:true});
  await fs.writeFile(outputPath, `${JSON.stringify(sealed, null, 2)}\n`);
  return sealed;
}

async function run() {
  const sampling = JSON.parse(await fs.readFile(samplingPath, 'utf8'));
  const target = targetFromSampling(sampling);
  const accessedAt = new Date().toISOString();
  const [countResult, detailResult] = await Promise.all([sparql(COUNT_QUERY), sparql(DETAIL_QUERY)]);
  const declaredCount = Number(countResult.payload.results.bindings[0]?.count?.value);
  if (!Number.isInteger(declaredCount) || declaredCount < 0) throw new Error('WDQS_DISTINCT_COUNT_INVALID');

  const bindings = detailResult.payload.results.bindings.map((row) => ({
    item:bindingEntity(row, 'item'),
    serial:literal(row, 'serial'),
    inventory:literal(row, 'inventory'),
    collection:bindingEntity(row, 'collection'),
    model:bindingEntity(row, 'model'),
    maker:bindingEntity(row, 'maker'),
    maker_path:literal(row, 'makerPath'),
  })).filter((row) => row.item && row.serial && row.inventory && row.collection && row.model && row.maker &&
    ['ITEM_P176', 'MODEL_P176'].includes(row.maker_path) && row.serial !== row.inventory);
  const uniqueBindings = [...new Map(bindings.map((row) => [
    [row.item, row.serial, row.inventory, row.collection, row.model, row.maker, row.maker_path].join('\0'), row,
  ])).values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const uniqueItems = sortedUnique(uniqueBindings.map((row) => row.item));
  if (uniqueItems.length !== declaredCount) throw new Error('WDQS_DETAIL_AND_COUNT_ITEM_CENSUS_MISMATCH');
  if (detailResult.payload.results.bindings.length >= DETAIL_LIMIT) throw new Error('WDQS_DETAIL_LIMIT_REACHED_CAPACITY_UNKNOWN');

  const allEntityIds = sortedUnique(uniqueBindings.flatMap((row) => [row.item, row.model, row.maker, row.collection]));
  const entityRows = await mapLimit(allEntityIds, 6, async (qid) => {
    const sourceUrl = evidenceUrl(qid);
    const payload = await fetchJson(sourceUrl);
    const entity = payload?.entities?.[qid];
    if (!entity || entity.missing !== undefined) throw new Error(`WIKIDATA_ENTITY_MISSING:${qid}`);
    return [qid, {payload, entity}];
  });
  const entities = new Map(entityRows);

  const records = [];
  for (const itemQid of uniqueItems) {
    const rows = uniqueBindings.filter((row) => row.item === itemQid);
    const itemData = entities.get(itemQid);
    const item = itemData?.entity;
    const validated = [];
    for (const row of rows) {
      const modelData = entities.get(row.model);
      const itemInventoryPairs = inventoryPairs(item);
      const makerValid = row.maker_path === 'ITEM_P176'
        ? claimItems(item, 'P176').includes(row.maker)
        : claimItems(modelData?.entity, 'P176').includes(row.maker);
      const valid = claimStrings(item, 'P2598').includes(row.serial) &&
        claimItems(item, 'P31').includes(row.model) && makerValid &&
        itemInventoryPairs.some((pair) => pair.inventory === row.inventory && pair.collection === row.collection) &&
        label(item) && label(modelData?.entity) && label(entities.get(row.maker)?.entity) &&
        label(entities.get(row.collection)?.entity);
      if (valid) validated.push(row);
    }
    if (validated.length === 0) continue;

    const modelIds = sortedUnique(validated.map((row) => row.model));
    const makerIds = sortedUnique(validated.map((row) => row.maker));
    const collectionIds = sortedUnique(validated.map((row) => row.collection));
    // Alias capacity counts identifier pairs, not alternate maker/model context
    // bindings for the same pair. Keep the first deterministic validated context.
    const aliasPairs = [...new Map(validated.map((row) => {
      const pair = {
        manufacturer_serial_p2598:row.serial,
        inventory_reference_p217:row.inventory,
        inventory_collection_p195:row.collection,
        model_qid:row.model,
        maker_qid:row.maker,
        maker_path:row.maker_path,
      };
      return [[row.serial, row.inventory, row.collection].join('\0'), pair];
    })).values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const evidenceIds = sortedUnique([itemQid, ...modelIds, ...makerIds, ...collectionIds]);
    const roles = new Map([[itemQid, 'ITEM']]);
    for (const qid of modelIds) roles.set(qid, roles.has(qid) ? `${roles.get(qid)}+MODEL` : 'MODEL');
    for (const qid of makerIds) roles.set(qid, roles.has(qid) ? `${roles.get(qid)}+MAKER` : 'MAKER');
    for (const qid of collectionIds) roles.set(qid, roles.has(qid) ? `${roles.get(qid)}+COLLECTION` : 'COLLECTION');
    records.push({
      record_id:`wikidata-serialized-reference:${itemQid}`,
      item_qid:itemQid,
      item_label:label(item),
      makers:makerIds.map((qid) => ({qid, label:label(entities.get(qid).entity), paths:sortedUnique(validated.filter((row) => row.maker === qid).map((row) => row.maker_path))})),
      models:modelIds.map((qid) => ({qid, label:label(entities.get(qid).entity), classification_basis:`WDQS_PATH_TO_PRODUCT_MODEL_CLASS_${PRODUCT_MODEL_CLASS}`})),
      manufacturer_serials_p2598:sortedUnique(validated.map((row) => row.serial)),
      inventory_references_p217:sortedUnique(validated.map((row) => row.inventory)),
      inventory_collections_p195:collectionIds.map((qid) => ({qid, label:label(entities.get(qid).entity)})),
      alias_pairs:aliasPairs,
      grammar_complete:true,
      grammar_evidence:['P176_MAKER_OR_MANUFACTURER', 'P31_PRODUCT_MODEL_PATH', 'P2598_MANUFACTURER_SERIAL', 'P217_INVENTORY_REFERENCE_WITH_P195_COLLECTION'],
      source_evidence:evidenceIds.map((qid) => sourceEvidence(qid, entities.get(qid).payload, roles.get(qid))),
    });
  }
  records.sort((left, right) => left.record_id.localeCompare(right.record_id));
  if (records.length !== declaredCount) throw new Error('ENTITYDATA_REVALIDATED_RECORD_COUNT_MISMATCH');

  const hardNegativePairs = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const sharedModels = left.models.map((row) => row.qid).filter((qid) => right.models.some((row) => row.qid === qid));
      const sharedMakers = left.makers.map((row) => row.qid).filter((qid) => right.makers.some((row) => row.qid === qid));
      const distinctSerial = left.manufacturer_serials_p2598.find((serial) => !right.manufacturer_serials_p2598.includes(serial));
      const rightSerial = right.manufacturer_serials_p2598.find((serial) => serial !== distinctSerial);
      if (sharedModels.length && sharedMakers.length && distinctSerial && rightSerial) {
        hardNegativePairs.push({
          left_record_id:left.record_id,
          right_record_id:right.record_id,
          shared_model_qid:sharedModels.sort()[0],
          shared_maker_qid:sharedMakers.sort()[0],
          left_manufacturer_serial_p2598:distinctSerial,
          right_manufacturer_serial_p2598:rightSerial,
        });
      }
    }
  }

  const aliasCount = records.reduce((sum, record) => sum + record.alias_pairs.length, 0);
  const metrics = {
    wdqs_declared_distinct_item_count:declaredCount,
    wdqs_detail_binding_count:detailResult.payload.results.bindings.length,
    source_revalidated_unique_item_count:records.length,
    grammar_complete_real_record_count:records.length,
    normalization_candidate_capacity:records.length,
    same_model_distinct_serial_hard_negative_pair_count:hardNegativePairs.length,
    cross_authority_alias_pair_count:aliasCount,
    conservative_case_capacity:
      Math.min(target.per_class.SAME_OBJECT_NORMALIZATION, records.length) +
      Math.min(target.per_class.HARD_NEGATIVE, hardNegativePairs.length) +
      Math.min(target.per_class.CROSS_MARKET_ALIAS, aliasCount),
    met_accession_number_only_case_capacity:0,
  };
  const gate = readiness(metrics, target);
  const artifact = {
    id:ARTIFACT_ID,
    version:'1.0.0',
    stratum_id:STRATUM_ID,
    generated_at:accessedAt,
    probe_status:gate.sourceCapacityReady ? 'COMPLETE_SOURCE_CAPACITY_READY' : 'COMPLETE_FAIL_CLOSED_INSUFFICIENT_CAPACITY',
    environment_class:'READ_ONLY_LIVE_CAPACITY_PREFLIGHT',
    request_boundary:{http_method:'GET', authenticated:false, remote_mutation:false, local_output_only:true},
    source_snapshot:{
      source_family:'wikidata-cc0-structured-data',
      license:'CC0-1.0',
      license_evidence_ref:WIKIDATA_LICENSE,
      accessed_at:accessedAt,
      product_model_class:{qid:PRODUCT_MODEL_CLASS, label:'product model'},
      count_query:{endpoint:WIKIDATA_SPARQL, sparql:COUNT_QUERY, response_sha256:digest(countResult.payload)},
      detail_query:{endpoint:WIKIDATA_SPARQL, sparql:DETAIL_QUERY, limit:DETAIL_LIMIT, response_sha256:digest(detailResult.payload), truncated:false},
    },
    strict_record_grammar:{
      required:['maker_or_manufacturer_p176', 'product_model_or_reference_p31_with_path_to_q10929058', 'manufacturer_serial_p2598', 'inventory_reference_p217_qualified_by_collection_p195'],
      identifier_independence_rule:'P2598_AND_P217_MUST_BE_DISTINCT_AND_P217_MUST_HAVE_P195_COLLECTION_QUALIFIER',
      model_rule:'P31_TARGET_MUST_HAVE_WDQS_INSTANCE_OR_SUBCLASS_PATH_TO_Q10929058_PRODUCT_MODEL',
      disallowed_substitutions:['MET_ACCESSION_NUMBER_ALONE_AS_PRODUCT_SERIAL', 'MET_ACCESSION_NUMBER_ALONE_AS_PRODUCT_REFERENCE', 'GENERIC_P31_CLASS_WITHOUT_PRODUCT_MODEL_PATH', 'UNQUALIFIED_P217_AS_INDEPENDENT_INVENTORY_REFERENCE'],
    },
    source_admission:{
      wikidata_cc0_strict_records_admitted:true,
      met_accession_number_only_product_identifier_admitted:false,
      met_accession_number_only_contribution_to_capacity:0,
      note:'Met accessionNumber alone is a collection record identifier, not evidence of manufacturer serial or product model/reference identity.',
    },
    sampling_target:target,
    records,
    same_model_distinct_serial_hard_negative_pairs:hardNegativePairs,
    metrics,
    readiness_gate:{
      requirements:gate.requirements,
      checks:gate.checks,
      source_capacity_ready_for_120_cases:gate.sourceCapacityReady,
      acquisition_lane_state:gate.sourceCapacityReady ? 'SOURCE_CAPACITY_READY_REVIEW_REQUIRED' : 'SOURCE_FIT_REVALIDATION_REQUIRED',
      blockers:gate.blockers,
    },
    downstream_claims:{
      empirical_cases_created:0,
      labels_collected:0,
      independent_label_review_complete:false,
      blind_holdout_sealed:false,
      empirical_benchmark_ready:false,
      track_b_started:false,
      public_release:'HOLD',
      production:'HOLD',
    },
    truth_boundary:'This is a read-only source-capacity observation, not an empirical ER dataset or label set. A Wikidata item counts only when live entity data revalidates maker/manufacturer, a product-model-qualified P31 target, P2598 serial, and P217 inventory reference with P195 collection qualifier. Met accessionNumber alone contributes zero serial/reference capacity. Source capacity, independent labels, blind sealing, empirical accuracy, Track B, public release and Production remain separate fail-closed gates.',
  };
  const sealed = await writeArtifact(artifact);
  console.log(JSON.stringify({
    id:sealed.id,
    probe_status:sealed.probe_status,
    grammar_complete_real_record_count:metrics.grammar_complete_real_record_count,
    cross_authority_alias_pair_count:metrics.cross_authority_alias_pair_count,
    same_model_distinct_serial_hard_negative_pair_count:metrics.same_model_distinct_serial_hard_negative_pair_count,
    conservative_case_capacity:metrics.conservative_case_capacity,
    source_capacity_ready_for_120_cases:gate.sourceCapacityReady,
    output:outputPath,
  }, null, 2));
}

try {
  await run();
} catch (error) {
  let target = {cases:120, blind:60, per_class:{SAME_OBJECT_NORMALIZATION:40, HARD_NEGATIVE:40, CROSS_MARKET_ALIAS:40}};
  try {
    target = targetFromSampling(JSON.parse(await fs.readFile(samplingPath, 'utf8')));
  } catch {}
  const metrics = {
    wdqs_declared_distinct_item_count:0,
    wdqs_detail_binding_count:0,
    source_revalidated_unique_item_count:0,
    grammar_complete_real_record_count:0,
    normalization_candidate_capacity:0,
    same_model_distinct_serial_hard_negative_pair_count:0,
    cross_authority_alias_pair_count:0,
    conservative_case_capacity:0,
    met_accession_number_only_case_capacity:0,
  };
  const gate = readiness(metrics, target);
  const failure = {
    id:ARTIFACT_ID,
    version:'1.0.0',
    stratum_id:STRATUM_ID,
    generated_at:new Date().toISOString(),
    probe_status:'SOURCE_UNAVAILABLE_FAIL_CLOSED',
    environment_class:'READ_ONLY_LIVE_CAPACITY_PREFLIGHT',
    request_boundary:{http_method:'GET', authenticated:false, remote_mutation:false, local_output_only:true},
    source_snapshot:{source_family:'wikidata-cc0-structured-data', license:'CC0-1.0', license_evidence_ref:WIKIDATA_LICENSE},
    strict_record_grammar:{required:['maker_or_manufacturer_p176', 'product_model_or_reference_p31_with_path_to_q10929058', 'manufacturer_serial_p2598', 'inventory_reference_p217_qualified_by_collection_p195']},
    source_admission:{wikidata_cc0_strict_records_admitted:false, met_accession_number_only_product_identifier_admitted:false, met_accession_number_only_contribution_to_capacity:0},
    sampling_target:target,
    records:[],
    same_model_distinct_serial_hard_negative_pairs:[],
    metrics,
    readiness_gate:{requirements:gate.requirements, checks:gate.checks, source_capacity_ready_for_120_cases:false, acquisition_lane_state:'SOURCE_FIT_REVALIDATION_REQUIRED', blockers:['LIVE_SOURCE_PROBE_UNAVAILABLE', ...gate.blockers]},
    downstream_claims:{empirical_cases_created:0, labels_collected:0, independent_label_review_complete:false, blind_holdout_sealed:false, empirical_benchmark_ready:false, track_b_started:false, public_release:'HOLD', production:'HOLD'},
    failure:{code:String(error?.message || error?.name || 'UNKNOWN_ERROR').slice(0, 200)},
    truth_boundary:'The live source probe did not complete. All source-capacity and downstream claims fail closed.',
  };
  await writeArtifact(failure);
  console.error(`FAIL_CLOSED: ${failure.failure.code}`);
  process.exitCode = 2;
}
