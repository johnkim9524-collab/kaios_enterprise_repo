import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS = Object.freeze({
  metDir: "artifacts/autonomous-source-samples/met-costume-open-access-r1",
  vamDir: "artifacts/autonomous-source-samples/vam-fashion-collections-r1",
  metOutput: "coordination/kidults/engine-v2/shadow-inputs/authority-shadow-met-records-r1.json",
  vamOutput: "coordination/kidults/engine-v2/shadow-inputs/authority-shadow-vam-records-r1.json",
  minimumRecordsPerFamily: 8
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--met-dir") config.metDir = argv[++index];
    else if (argument === "--vam-dir") config.vamDir = argv[++index];
    else if (argument === "--met-output") config.metOutput = argv[++index];
    else if (argument === "--vam-output") config.vamOutput = argv[++index];
    else if (argument === "--minimum-records-per-family") config.minimumRecordsPerFamily = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(config.minimumRecordsPerFamily) || config.minimumRecordsPerFamily < 1) {
    throw new Error("--minimum-records-per-family must be a positive integer.");
  }
  return config;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function yearFrom(...values) {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0 && value < 3000) return Math.trunc(value);
    const match = String(value ?? "").match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/);
    if (match) return Number(match[1]);
  }
  return null;
}

function slug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(unknown|none|anonymous|not available)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function candidateKey({ maker, objectType, title, year, sourceId, sourceObjectId }) {
  const makerKey = slug(maker);
  const objectKey = slug(objectType || title);
  if (!makerKey || !objectKey || !Number.isInteger(year)) {
    return `unresolved:${sourceId}:${sourceObjectId}`;
  }
  const decade = Math.floor(year / 10) * 10;
  return `${makerKey}|${objectKey}|${decade}`;
}

function transformMet(record) {
  const productionYear = yearFrom(record.object_begin_date, record.object_end_date, record.object_date);
  const objectType = record.object_name || record.classification || "Object";
  const maker = record.maker_or_artist || null;
  return {
    source_record_id: record.evidence_id,
    source_id: record.source_id,
    source_family: "THE_MET",
    source_object_id: record.source_object_id,
    source_qualified_key: `${record.source_id}:${record.source_object_id}`,
    evidence_class: "PRIMARY_AUTHORITY",
    core_domain_hint: "fashion-accessories",
    title: record.title ?? null,
    object_type: objectType,
    maker,
    production_year: productionYear,
    date_text: record.object_date ?? null,
    accession_number: record.accession_number ?? null,
    culture_or_place: record.country ?? record.region ?? record.city ?? record.culture ?? null,
    medium: record.medium ?? null,
    observed_at: record.fetched_at,
    provenance_reference: record.evidence_reference,
    source_payload_sha256: record.source_payload_sha256,
    rights_state: record.metadata_rights_state,
    image_state: "NOT_INGESTED",
    critical_field_completeness: record.critical_field_completeness,
    publication_state: "INTERNAL_SHADOW_ONLY",
    public_commercial_authorized: false,
    provider_id_is_canonical_id: false,
    physical_object_candidate_id: `physical:${record.source_id}:${record.source_object_id}`,
    canonical_design_candidate_key: candidateKey({
      maker,
      objectType,
      title: record.title,
      year: productionYear,
      sourceId: record.source_id,
      sourceObjectId: record.source_object_id
    })
  };
}

function transformVam(record) {
  const productionYear = yearFrom(record.production_date);
  const objectType = record.object_type || "Object";
  const maker = record.maker_or_artist || null;
  return {
    source_record_id: record.evidence_id,
    source_id: record.source_id,
    source_family: "V_AND_A",
    source_object_id: record.source_object_id,
    source_qualified_key: `${record.source_id}:${record.source_object_id}`,
    evidence_class: "PRIMARY_AUTHORITY",
    core_domain_hint: "fashion-accessories",
    title: record.title ?? null,
    object_type: objectType,
    maker,
    production_year: productionYear,
    date_text: record.production_date ?? null,
    accession_number: record.accession_number ?? null,
    culture_or_place: record.primary_place ?? null,
    medium: null,
    observed_at: record.fetched_at,
    provenance_reference: record.evidence_reference,
    source_payload_sha256: record.source_payload_sha256,
    rights_state: record.metadata_rights_state,
    image_state: "NOT_INGESTED",
    critical_field_completeness: record.critical_field_completeness,
    publication_state: "INTERNAL_SHADOW_ONLY",
    public_commercial_authorized: false,
    provider_id_is_canonical_id: false,
    physical_object_candidate_id: `physical:${record.source_id}:${record.source_object_id}`,
    canonical_design_candidate_key: candidateKey({
      maker,
      objectType,
      title: record.title,
      year: productionYear,
      sourceId: record.source_id,
      sourceObjectId: record.source_object_id
    })
  };
}

function assertFreshShape(records, family, minimum) {
  if (!Array.isArray(records) || records.length < minimum) {
    throw new Error(`${family}: expected at least ${minimum} live normalized records.`);
  }
  const now = Date.now();
  const seen = new Set();
  for (const record of records) {
    if (!record.source_record_id || !record.source_id || !record.source_object_id) {
      throw new Error(`${family}: source identity fields are incomplete.`);
    }
    if (!record.provenance_reference || !record.rights_state || !record.source_payload_sha256) {
      throw new Error(`${family}:${record.source_record_id}: provenance/rights/digest is incomplete.`);
    }
    if (!record.canonical_design_candidate_key || !record.physical_object_candidate_id) {
      throw new Error(`${family}:${record.source_record_id}: candidate identity boundary is incomplete.`);
    }
    const observed = new Date(record.observed_at).getTime();
    if (!Number.isFinite(observed) || Math.abs(now - observed) > 86_400_000) {
      throw new Error(`${family}:${record.source_record_id}: live preparation received a non-current observation.`);
    }
    if (seen.has(record.source_qualified_key)) {
      throw new Error(`${family}:${record.source_record_id}: duplicate source-qualified key.`);
    }
    seen.add(record.source_qualified_key);
  }
}

const config = parseArgs(process.argv.slice(2));
const metRaw = readJson(path.resolve(config.metDir, "normalized-evidence-records.json"));
const vamRaw = readJson(path.resolve(config.vamDir, "normalized-evidence-records.json"));
const met = metRaw.map(transformMet);
const vam = vamRaw.map(transformVam);

assertFreshShape(met, "THE_MET", config.minimumRecordsPerFamily);
assertFreshShape(vam, "V_AND_A", config.minimumRecordsPerFamily);

writeJson(path.resolve(config.metOutput), met);
writeJson(path.resolve(config.vamOutput), vam);

console.log("KIDULTS live fashion authority input preparation: PASS");
console.log(`THE_MET / V_AND_A records: ${met.length} / ${vam.length}`);
console.log("Static checkout snapshots replaced in the ephemeral CI workspace only.");
console.log("Publication / Index / Production eligibility: FALSE / FALSE / FALSE");
