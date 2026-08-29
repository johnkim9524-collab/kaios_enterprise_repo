import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS = Object.freeze({
  metDir: "artifacts/autonomous-source-samples/met-costume-open-access-r1",
  vamDir: "artifacts/autonomous-source-samples/vam-fashion-collections-r1",
  metOutput: "coordination/kidults/engine-v2/shadow-inputs/authority-shadow-met-records-r1.json",
  vamOutput: "coordination/kidults/engine-v2/shadow-inputs/authority-shadow-vam-records-r1.json"
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--met-dir") config.metDir = argv[++i];
    else if (arg === "--vam-dir") config.vamDir = argv[++i];
    else if (arg === "--met-output") config.metOutput = argv[++i];
    else if (arg === "--vam-output") config.vamOutput = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return config;
}

function readRecords(directory) {
  const value = JSON.parse(fs.readFileSync(path.resolve(directory, "normalized-evidence-records.json"), "utf8"));
  if (!Array.isArray(value) || value.length < 8) throw new Error(`Expected at least 8 live records in ${directory}`);
  return value;
}

function slug(value) {
  return String(value ?? "unknown")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function yearFrom(...values) {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0 && value < 3000) return Math.trunc(value);
    const match = String(value ?? "").match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/);
    if (match) return Number(match[1]);
  }
  return null;
}

function designKey(maker, title, objectType, year) {
  const decade = Number.isInteger(year) ? Math.floor(year / 10) * 10 : "unknown";
  return `${slug(maker)}|${slug(title || objectType)}|${decade}`;
}

function transformMet(record) {
  const id = String(record.source_object_id ?? "");
  const year = yearFrom(record.object_begin_date, record.object_end_date, record.object_date);
  return {
    source_record_id: record.evidence_id,
    source_id: "met-costume-institute-open-access",
    source_family: "THE_MET",
    source_object_id: id,
    source_qualified_key: `met-costume-institute-open-access:${id}`,
    evidence_class: "PRIMARY_AUTHORITY",
    core_domain_hint: record.vertical_id ?? "fashion-accessories",
    title: record.title ?? null,
    object_type: record.object_name ?? record.classification ?? "Object",
    maker: record.maker_or_artist ?? null,
    production_year: year,
    date_text: record.object_date ?? null,
    accession_number: record.accession_number ?? null,
    culture_or_place: record.country ?? record.culture ?? record.region ?? null,
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
    physical_object_candidate_id: `physical:met-costume-institute-open-access:${id}`,
    canonical_design_candidate_key: designKey(record.maker_or_artist, record.title, record.object_name ?? record.classification, year)
  };
}

function transformVam(record) {
  const id = String(record.source_object_id ?? "");
  const year = yearFrom(record.production_date);
  return {
    source_record_id: record.evidence_id,
    source_id: "vam-collections-api-fashion",
    source_family: "V_AND_A",
    source_object_id: id,
    source_qualified_key: `vam-collections-api-fashion:${id}`,
    evidence_class: "PRIMARY_AUTHORITY",
    core_domain_hint: record.vertical_id ?? "fashion-accessories",
    title: record.title ?? null,
    object_type: record.object_type ?? "Object",
    maker: record.maker_or_artist ?? null,
    production_year: year,
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
    physical_object_candidate_id: `physical:vam-collections-api-fashion:${id}`,
    canonical_design_candidate_key: designKey(record.maker_or_artist, record.title, record.object_type, year)
  };
}

function write(file, records) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

const config = parseArgs(process.argv.slice(2));
const met = readRecords(config.metDir).map(transformMet);
const vam = readRecords(config.vamDir).map(transformVam);

for (const [label, records, family] of [["Met", met, "THE_MET"], ["V&A", vam, "V_AND_A"]]) {
  if (records.some(record => record.source_family !== family)) throw new Error(`${label}: source-family transform mismatch`);
  if (records.some(record => !record.observed_at || !record.provenance_reference || !record.rights_state)) {
    throw new Error(`${label}: live provenance/rights/freshness fields missing`);
  }
  if (new Set(records.map(record => record.source_qualified_key)).size !== records.length) {
    throw new Error(`${label}: duplicate live source-qualified keys`);
  }
}

write(config.metOutput, met);
write(config.vamOutput, vam);

console.log(JSON.stringify({
  state: "LIVE_AUTHORITY_SHADOWS_PREPARED",
  met_records: met.length,
  vam_records: vam.length,
  publication_eligible: false,
  production_eligible: false
}));
