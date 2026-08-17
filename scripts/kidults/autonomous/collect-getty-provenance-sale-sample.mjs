import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_SEEDS = Object.freeze([
  "fbc91494-294c-30a6-b6dc-885f3ea074ed"
]);

const DEFAULTS = Object.freeze({
  apiBase: "https://data.getty.edu/provenance",
  seedIds: [...DEFAULT_SEEDS],
  minimumEvents: 1,
  timeoutMs: 15_000,
  retryAttempts: 3,
  output: "artifacts/autonomous-source-samples/getty-provenance-sale-r1"
});

function parseArgs(argv) {
  const config = { ...DEFAULTS, seedIds: [...DEFAULTS.seedIds] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = argv[++index];
    else if (argument === "--seed-id") {
      if (config.seedIds.length === DEFAULT_SEEDS.length && config.seedIds.every((id, i) => id === DEFAULT_SEEDS[i])) {
        config.seedIds = [];
      }
      config.seedIds.push(argv[++index]);
    } else if (argument === "--minimum-events") config.minimumEvents = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  config.seedIds = [...new Set(config.seedIds.map(value => String(value).trim()).filter(Boolean))];
  if (!config.seedIds.length || config.seedIds.length > 10) throw new Error("Provide between 1 and 10 seed IDs.");
  if (!config.seedIds.every(id => /^[a-f0-9-]{36}$/i.test(id))) throw new Error("Seed IDs must be UUID-like Getty entity IDs.");
  if (!Number.isInteger(config.minimumEvents) || config.minimumEvents < 1 || config.minimumEvents > config.seedIds.length) {
    throw new Error("--minimum-events must be between 1 and the seed count.");
  }
  return config;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureAllowedUrl(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "data.getty.edu" ||
    !parsed.pathname.startsWith("/provenance/") ||
    parsed.pathname.includes("/sparql")
  ) {
    throw new Error(`Source URL is outside the approved allowlist: ${url}`);
  }
}

async function requestJson(url, config, requestLog) {
  ensureAllowedUrl(url);
  let lastError = null;
  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/ld+json, application/json;q=0.9",
          "User-Agent": "KIDULTS-Autonomous-Market-Event-PoC/1.0 (+https://kidults.com)"
        },
        signal: controller.signal
      });
      const text = await response.text();
      requestLog.push({
        url,
        method: "GET",
        attempt,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        content_type: response.headers.get("content-type"),
        response_sha256: sha256(text)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < config.retryAttempts) await sleep(250 * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`);
}

function walk(value, visitor, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...pathParts, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  visitor(value, pathParts);
  for (const [key, child] of Object.entries(value)) walk(child, visitor, [...pathParts, key]);
}

function text(value) {
  if (value == null) return null;
  const output = String(value).trim();
  return output || null;
}

function label(value) {
  if (!value || typeof value !== "object") return null;
  return text(value._label ?? value.label ?? value.name ?? value.title ?? value.content);
}

function ref(value) {
  if (!value || typeof value !== "object") return null;
  const id = text(value.id ?? value["@id"]);
  const type = text(value.type ?? value["@type"]);
  const display = label(value);
  if (!id && !display) return null;
  return { id, type, label: display };
}

function uniqueRefs(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const candidate = ref(value);
    if (!candidate) continue;
    const key = `${candidate.id ?? ""}|${candidate.type ?? ""}|${candidate.label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output.sort((a, b) => `${a.id ?? ""}|${a.label ?? ""}`.localeCompare(`${b.id ?? ""}|${b.label ?? ""}`));
}

function collectByKey(record, keyNames) {
  const found = [];
  walk(record, object => {
    for (const key of keyNames) {
      const value = object[key];
      if (Array.isArray(value)) found.push(...value);
      else if (value && typeof value === "object") found.push(value);
    }
  });
  return uniqueRefs(found);
}

function collectLabels(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(label).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function collectMonetaryAmounts(record) {
  const amounts = [];
  walk(record, object => {
    const typeValue = text(object.type ?? object["@type"]);
    const isAmount = typeValue === "MonetaryAmount" || (Object.hasOwn(object, "value") && object.currency);
    if (!isAmount) return;
    const numericValue = Number(object.value);
    amounts.push({
      id: text(object.id ?? object["@id"]),
      value: Number.isFinite(numericValue) ? numericValue : null,
      currency_id: text(object.currency?.id ?? object.currency?.["@id"]),
      currency: label(object.currency),
      label: label(object)
    });
  });
  const seen = new Set();
  return amounts.filter(amount => {
    const key = stableJson(amount);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findTimespan(record) {
  const direct = record?.timespan;
  const candidates = [];
  if (direct && typeof direct === "object") candidates.push(direct);
  walk(record, object => {
    const typeValue = text(object.type ?? object["@type"]);
    if (typeValue === "TimeSpan") candidates.push(object);
  });
  for (const candidate of candidates) {
    const begin = text(candidate.begin_of_the_begin ?? candidate.begin_of_the_end);
    const end = text(candidate.end_of_the_end ?? candidate.end_of_the_begin);
    if (begin || end) return { begin, end, label: label(candidate) };
  }
  return { begin: null, end: null, label: null };
}

function classificationLabels(record) {
  const labels = [];
  walk(record?.classified_as ?? [], object => {
    const value = label(object);
    if (value) labels.push(value);
  });
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

function summarizeRaw(record, sourceUrl, fetchedAt, payloadHash) {
  return {
    source_entity_id: text(record?.id)?.split("/").pop() ?? null,
    source_url: sourceUrl,
    fetched_at: fetchedAt,
    source_payload_sha256: payloadHash,
    raw_payload_state: "SANITIZED_LINKED_ART_EVENT_SUMMARY_NO_MEDIA",
    media_ingested: false,
    summary: {
      id: text(record?.id ?? record?.["@id"]),
      type: text(record?.type ?? record?.["@type"]),
      label: label(record),
      classifications: classificationLabels(record),
      timespan: findTimespan(record)
    }
  };
}

function normalizeEvent(record, sourceUrl, fetchedAt, payloadHash) {
  const eventId = text(record?.id ?? record?.["@id"]) ?? sourceUrl;
  const eventType = text(record?.type ?? record?.["@type"]);
  const labels = classificationLabels(record);
  const displayLabel = label(record);
  const saleSignal = [displayLabel, ...labels].filter(Boolean).join(" ");
  const isSaleActivity = eventType === "Activity" && /sale|auction|purchase|transaction/i.test(saleSignal);
  const timespan = findTimespan(record);
  const amounts = collectMonetaryAmounts(record);
  const firstAmount = amounts.find(amount => amount.value !== null) ?? amounts[0] ?? null;
  const objectReferences = collectByKey(record, [
    "transferred_title_of", "transferred_custody_of", "encountered", "used_specific_object"
  ]);
  const buyerReferences = collectByKey(record, ["transferred_title_to", "paid_from"]);
  const sellerReferences = collectByKey(record, ["transferred_title_from", "paid_to"]);
  const venueReferences = collectByKey(record, ["took_place_at"]);

  return {
    market_event_id: eventId,
    source_id: "getty-provenance-index-sale-activity",
    source_entity_id: eventId.split("/").pop(),
    source_event_type: eventType,
    event_type: isSaleActivity ? "HISTORICAL_SALE_ACTIVITY" : "REVIEW_REQUIRED_EVENT_CLASSIFICATION",
    event_label: displayLabel,
    classifications: labels,
    event_at: timespan.begin,
    event_end: timespan.end,
    event_date_label: timespan.label,
    sold_event: isSaleActivity,
    listing_is_sale: false,
    sold_price: firstAmount?.value ?? null,
    sold_price_state: firstAmount?.value != null ? "EXTRACTED_FROM_LINKED_ART" : "NOT_AVAILABLE",
    currency: firstAmount?.currency ?? null,
    currency_id: firstAmount?.currency_id ?? null,
    monetary_amounts: amounts,
    venue: venueReferences[0]?.label ?? null,
    venue_references: venueReferences,
    object_references: objectReferences,
    buyer_references: buyerReferences,
    seller_references: sellerReferences,
    buyer_premium_state: "NOT_AVAILABLE",
    condition_state: "NOT_AVAILABLE",
    authentication_state: "NOT_AVAILABLE",
    provider_id_is_canonical_object_id: false,
    identity_state: objectReferences.length ? "MARKET_EVENT_WITH_LINKED_OBJECT_REFERENCE" : "MARKET_EVENT_OBJECT_REVIEW_REQUIRED",
    rights_state: "GETTY_PROVENANCE_INDEX_CC0",
    provenance_reference: sourceUrl,
    source_payload_sha256: payloadHash,
    fetched_at: fetchedAt,
    freshness_state: "CURRENT_AT_FETCH",
    publication_state: "POC_INTERNAL_ONLY",
    index_eligible: false,
    production_eligible: false
  };
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const config = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(config.output);
const requestLog = [];
const failures = [];
const startedAt = new Date().toISOString();
const sanitizedRawRecords = [];
const normalizedEvents = [];

for (const seedId of config.seedIds) {
  const sourceUrl = `${config.apiBase}/${encodeURIComponent(seedId)}`;
  try {
    const record = await requestJson(sourceUrl, config, requestLog);
    const fetchedAt = new Date().toISOString();
    const payloadHash = sha256(stableJson(record));
    sanitizedRawRecords.push(summarizeRaw(record, sourceUrl, fetchedAt, payloadHash));
    normalizedEvents.push(normalizeEvent(record, sourceUrl, fetchedAt, payloadHash));
  } catch (error) {
    failures.push({ seed_id: seedId, error: error instanceof Error ? error.message : String(error) });
  }
}

normalizedEvents.sort((a, b) => a.market_event_id.localeCompare(b.market_event_id));
const completedAt = new Date().toISOString();
const validSaleEvents = normalizedEvents.filter(event => event.sold_event === true);
const minimumGatePassed = validSaleEvents.length >= config.minimumEvents;
const provenanceCoverage = normalizedEvents.length
  ? normalizedEvents.filter(event => Boolean(event.provenance_reference)).length / normalizedEvents.length
  : 0;
const rightsCoverage = normalizedEvents.length
  ? normalizedEvents.filter(event => event.rights_state === "GETTY_PROVENANCE_INDEX_CC0").length / normalizedEvents.length
  : 0;

const runManifest = {
  run_id: `getty-provenance-sale-${completedAt.replace(/[:.]/g, "-")}`,
  contract_id: "getty-provenance-sale-r1",
  version: "1.0.0",
  status: minimumGatePassed ? "COMPLETED" : "FAILED_MINIMUM_EVENT_GATE",
  started_at: startedAt,
  completed_at: completedAt,
  mode: "BOUNDED_LIVE_TRANSACTION_POC",
  source_id: "getty-provenance-index-sale-activity",
  source_tier: 1,
  seed_entity_ids: config.seedIds,
  request_budget: config.seedIds.length,
  requests_executed: requestLog.length,
  retry_attempts: config.retryAttempts,
  normalized_market_events: normalizedEvents.length,
  valid_sale_events: validSaleEvents.length,
  failed_requests: failures.length,
  rights_model: {
    data: "CC0",
    images: "NOT_INGESTED"
  },
  credential_used: false,
  paid_access_used: false,
  image_downloaded: false,
  mutation_performed: false,
  production_eligible: false,
  candidate_publication_authorized: false,
  index_computation_authorized: false,
  request_log: requestLog,
  failures
};

const qualityReport = {
  run_id: runManifest.run_id,
  market_event_count: normalizedEvents.length,
  valid_sale_event_count: validSaleEvents.length,
  unique_market_event_count: new Set(normalizedEvents.map(event => event.market_event_id)).size,
  duplicate_market_event_count: normalizedEvents.length - new Set(normalizedEvents.map(event => event.market_event_id)).size,
  provenance_reference_coverage: provenanceCoverage,
  rights_state_coverage: rightsCoverage,
  event_date_coverage: normalizedEvents.length
    ? normalizedEvents.filter(event => Boolean(event.event_at)).length / normalizedEvents.length
    : 0,
  price_coverage: normalizedEvents.length
    ? normalizedEvents.filter(event => event.sold_price !== null).length / normalizedEvents.length
    : 0,
  object_reference_coverage: normalizedEvents.length
    ? normalizedEvents.filter(event => event.object_references.length > 0).length / normalizedEvents.length
    : 0,
  listing_count: 0,
  listing_counted_as_sale: 0,
  image_ingestion_count: 0,
  minimum_event_gate: minimumGatePassed ? "PASS" : "FAIL",
  candidate_eligible: false,
  candidate_blockers: [
    "The bounded seed validates a rights-cleared historical transaction path but not broad market coverage.",
    "Historical Getty sale activity does not establish current demand or liquidity.",
    "Source diversity, Golden Dataset accuracy and stress tests remain incomplete.",
    "Unsupported price, currency, condition, authentication and buyer-premium fields remain null or NOT_AVAILABLE."
  ]
};

const evidencePackage = {
  evidence_package_id: `evidence-${runManifest.run_id}`,
  version: "1.0.0",
  status: "TRANSACTION_POC_EVIDENCE_NOT_CANDIDATE",
  generated_at: completedAt,
  snapshot_id: null,
  methodology_version: "canonical-candidate-methodology-v1",
  evidence_lineage_version: "getty-provenance-sale-lineage-r1",
  source_mode: "BOUNDED_LIVE_TRANSACTION_POC",
  source_ids: ["getty-provenance-index-sale-activity"],
  market_event_count: normalizedEvents.length,
  market_events: normalizedEvents,
  known_limitations: qualityReport.candidate_blockers,
  production_eligible: false,
  commercial_publication_authorized: false
};

writeJson(outputDirectory, "run-manifest.json", runManifest);
writeJson(outputDirectory, "sanitized-raw-records.json", sanitizedRawRecords);
writeJson(outputDirectory, "normalized-market-events.json", normalizedEvents);
writeJson(outputDirectory, "evidence-package.json", evidencePackage);
writeJson(outputDirectory, "quality-report.json", qualityReport);

console.log(JSON.stringify({
  status: runManifest.status,
  run_id: runManifest.run_id,
  market_events: normalizedEvents.length,
  valid_sale_events: validSaleEvents.length,
  price_coverage: qualityReport.price_coverage,
  object_reference_coverage: qualityReport.object_reference_coverage,
  output: config.output
}));

if (!minimumGatePassed) process.exitCode = 2;
