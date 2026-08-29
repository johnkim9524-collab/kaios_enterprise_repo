#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const selectionPath = process.argv[2] || "coordination/kidults/scope-data/scope-poc-anchor-selection-v1.json";
const topologyPath = process.argv[3] || "coordination/kidults/scope-data/self-collected-open-channel-topology-v2.json";
const outDir = process.argv[4] || "scope-open-wave2-out";
const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
const topology = JSON.parse(fs.readFileSync(topologyPath, "utf8"));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 20);
const clean = value => String(value || "").toLowerCase().normalize("NFKD")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function parseName(item) {
  const parts = item.display_name.split(" — ");
  return { maker: (parts[0] || "").trim(), product: parts.slice(1).join(" — ").trim() };
}

function relevant(row, text) {
  const haystack = clean(text);
  const productParts = clean(row.product).split(" ").filter(value => value.length >= 3 || /\d/.test(value));
  const makerParts = clean(row.maker).split(" ").filter(value => value.length >= 3);
  const productHits = productParts.filter(value => haystack.includes(value)).length;
  const makerHit = makerParts.some(value => haystack.includes(value));
  return productParts.length >= 2 ? productHits >= 2 || (makerHit && productHits >= 1) : productHits >= 1 && makerHit;
}

function ensureAicUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.artic.edu") throw new Error("AIC_URL_OUTSIDE_ALLOWLIST");
}

async function requestAicJson(url, providerCallCounts, options = {}, attempt = 0) {
  ensureAicUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  providerCallCounts.AIC_COLLECTION_API += 1;
  try {
    const response = await fetch(url, { ...options, redirect: "error", signal: controller.signal });
    ensureAicUrl(response.url || url);
    if (response.redirected === true) throw new Error("AIC_REDIRECT_REJECTED");
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(1_100 * (2 ** attempt));
      return requestAicJson(url, providerCallCounts, options, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

fs.mkdirSync(outDir, { recursive: true });
const records = [];
const errors = [];
const filtered = [];
const channelHolds = [];
const providerCallCounts = { VAM_COLLECTIONS_API: 0, AIC_COLLECTION_API: 0 };

for (const selected of selection.records) {
  const name = parseName(selected);
  const query = `${name.maker} ${name.product}`.trim();
  for (const channel of topology.channels.filter(item => item.scopes.includes(selected.target_scope_id))) {
    const observedAt = new Date().toISOString();
    if (channel.channel_id === "VAM_COLLECTIONS_API") {
      channelHolds.push({
        channel_id: channel.channel_id,
        scope_id: selected.target_scope_id,
        representative_product_id: selected.representative_product_id,
        state: "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
        provider_call_count: 0,
        license_provenance_created: false,
        data_admission_performed: false
      });
      continue;
    }
    if (channel.channel_id !== "AIC_COLLECTION_API") continue;
    try {
      const url = new URL("https://api.artic.edu/api/v1/artworks/search");
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "3");
      url.searchParams.set("fields", "id,title,artist_display,date_display,medium_display,provenance_text,is_public_domain");
      const payload = await requestAicJson(url, providerCallCounts, {
        headers: { "AIC-User-Agent": "KIDULTS (https://kidults.com)" }
      });
      for (const item of payload.data || []) {
        const text = `${item.title || ""} ${item.artist_display || ""} ${item.date_display || ""} ${item.medium_display || ""}`;
        if (!relevant(name, text)) {
          filtered.push({ channel: channel.channel_id, product: selected.representative_product_id, id: item.id, reason: "PRODUCT_RELEVANCE_FAIL" });
          continue;
        }
        const roles = ["CATALOG_REFERENCE", "CULTURE_ATTENTION"];
        if (item.provenance_text) roles.push("PROVENANCE_HISTORY");
        records.push({
          candidate_id: `aic-${digest(selected.representative_product_id + item.id)}`,
          scope_id: selected.target_scope_id,
          representative_product_id: selected.representative_product_id,
          display_name: selected.display_name,
          channel_id: channel.channel_id,
          source_family: channel.source_family,
          provider_record_id: String(item.id),
          endpoint_url: `https://www.artic.edu/artworks/${item.id}`,
          source_name: item.title || String(item.id),
          observed_at: observedAt,
          roles,
          rights_state: "ARTWORK_API_DATA_CC0_SUBJECT_TO_TERMS",
          is_public_domain: Boolean(item.is_public_domain),
          content_class: "STRUCTURED_ARTWORK_METADATA",
          qualification_state: "CANDIDATE_NOT_EVIDENCE_ADMITTED"
        });
      }
    } catch (error) {
      errors.push({
        channel_id: channel.channel_id,
        scope_id: selected.target_scope_id,
        representative_product_id: selected.representative_product_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    await sleep(1_100);
  }
}

const unique = [...new Map(records.map(record => [
  `${record.representative_product_id}|${record.source_family}|${record.provider_record_id}`,
  record
])).values()];
const byScope = {};
for (const scope of [...new Set(selection.records.map(item => item.target_scope_id))]) {
  const scopeRecords = unique.filter(record => record.scope_id === scope);
  byScope[scope] = {
    candidate_count: scopeRecords.length,
    products_with_candidates: new Set(scopeRecords.map(item => item.representative_product_id)).size,
    source_families: [...new Set(scopeRecords.map(item => item.source_family))],
    roles: [...new Set(scopeRecords.flatMap(item => item.roles))],
    rights_clear_candidates: scopeRecords.filter(item => item.rights_state === "ARTWORK_API_DATA_CC0_SUBJECT_TO_TERMS").length,
    rights_review_candidates: 0
  };
}

const output = {
  id: "kidults-self-collected-open-channel-expansion-wave2",
  version: "2.1.0",
  status: "EXECUTED_AIC_VAM_HARD_HOLD_NOT_EVIDENCE_ADMITTED",
  scope_count: 32,
  product_count: 64,
  channels_evaluated: topology.channels.map(item => item.channel_id),
  provider_call_counts: providerCallCounts,
  vam_runtime_activation: "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
  vam_license_provenance_created: false,
  vam_retention_days_max: 28,
  channel_holds: channelHolds,
  candidate_count: unique.length,
  filtered_irrelevant: filtered.length,
  error_count: errors.length,
  candidates: unique,
  filtered,
  errors,
  scope_summary: byScope,
  candidate_r2_activation: "NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED",
  immutable_candidate_evidence_pair_created: false,
  track_b_submission_count: 0,
  track_b_assessment_count: 0,
  north_star: {
    AUTONOMOUS: "PASS_REQUIREMENT_ROUTING_AND_RETRY",
    GLOBAL: "AMBER_US_UK_EU_INSTITUTIONAL_COVERAGE_MORE_REGIONS_REQUIRED",
    IRREPLACEABLE_VALUE: "PASS_REQUIREMENT_DRIVEN",
    TRANSPARENT: "PASS_RIGHTS_FIELD_LEVEL"
  },
  provider_contact_authorized: false,
  production: "HOLD"
};
fs.writeFileSync(path.join(outDir, "open-channel-expansion-wave2.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  scopes: 32,
  products: 64,
  candidates: unique.length,
  filtered: filtered.length,
  errors: errors.length,
  vam_provider_calls: 0,
  vam_state: output.vam_runtime_activation
}, null, 2));
