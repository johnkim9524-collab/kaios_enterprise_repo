import { fingerprint, hashId, normalizeUrl, unique } from "./asi-discovery-common-v1.mjs";

const ROLE_ALIASES = Object.freeze({
  "identity-canon": "PRIMARY_AUTHORITY",
  "release-history": "CATALOG_REFERENCE",
  "edition-resolution": "CATALOG_REFERENCE",
  "reference-resolution": "CATALOG_REFERENCE",
  "market-observation": "LISTING_SUPPLY",
  "valuation-comparable": "SOLD_TRANSACTION",
  "sold-transaction-pricing": "SOLD_TRANSACTION",
  "auction-private-sale": "AUCTION_PRIVATE_SALE",
  "authentication-condition": "AUTHENTICATION_CONDITION",
  "provenance-event-history": "PROVENANCE_HISTORY",
  "culture-attention": "CULTURE_ATTENTION",
  "macro-context": "MACRO_CONTEXT",
  "independent-verification": "INDEPENDENT_VERIFICATION"
});

function selectCandidates(trustedSources) {
  const candidates = (trustedSources?.records ?? []).flatMap(record =>
    (record.source_candidates ?? []).map(candidate => ({ ...candidate, core_domain_id: record.vertical_id })));
  return unique(candidates.map(candidate => candidate.core_domain_id)).map(category => {
    const selected = candidates
      .filter(candidate => candidate.core_domain_id === category && normalizeUrl(candidate.official_url))
      .sort((left, right) =>
        Number(!String(left.api_state ?? "").includes("PUBLIC_API_CONFIRMED")) -
          Number(!String(right.api_state ?? "").includes("PUBLIC_API_CONFIRMED")) ||
        (left.source_tier ?? 99) - (right.source_tier ?? 99) ||
        (right.trust_score_provisional ?? 0) - (left.trust_score_provisional ?? 0) ||
        String(left.source_id).localeCompare(String(right.source_id)))[0];
    if (!selected) return null;
    const endpoint = normalizeUrl(selected.official_url);
    return {
      adapter_contract_candidate_id: `adapter-candidate-${category}`,
      core_domain_id: category,
      endpoint_id: hashId("ep", endpoint),
      source_id: selected.source_id,
      display_name: selected.display_name,
      endpoint_url: endpoint,
      source_origin: "TRUSTED_SOURCE_REGISTRY",
      source_class: selected.source_class,
      candidate_source_roles: unique((selected.primary_roles ?? []).map(role =>
        ROLE_ALIASES[String(role).toLowerCase()] ?? String(role).toUpperCase())),
      authority_basis: selected.authority_basis ?? null,
      coverage_scope: selected.coverage_scope ?? null,
      access_mode: selected.access_mode ?? "UNKNOWN",
      api_state: selected.api_state ?? "UNKNOWN",
      rights_state: selected.rights_state ?? "UNKNOWN",
      commercial_use_state: selected.commercial_use_state ?? "UNKNOWN",
      provenance_state: selected.provenance_state ?? "UNKNOWN",
      risk_level: selected.risk_level ?? "UNKNOWN",
      trust_score_provisional: selected.trust_score_provisional ?? null,
      verification_state: selected.verification_state ?? "UNKNOWN",
      contract_state: "CURATED_ADAPTER_CONTRACT_CANDIDATE_TERMS_INTERFACE_AND_PREFLIGHT_NOT_PASSED",
      request_budget: 0,
      schema_contract: "NOT_VERIFIED",
      field_allowlist: [],
      raw_quarantine_first: true,
      fail_closed: true,
      acquisition_authorized: false,
      provider_direct_to_portal: false,
      provider_direct_to_index: false,
      public_projection: false,
      production: "HOLD"
    };
  }).filter(Boolean).sort((a, b) => a.core_domain_id.localeCompare(b.core_domain_id));
}

export function applyCuratedAdapterQueue(outputs, trustedSources) {
  const records = selectCandidates(trustedSources);
  const queue = {
    id: "kidults-adapter-contract-queue-batch-001",
    record_type: "bounded_adapter_contract_queue",
    version: "1.1.0",
    observed_at: outputs["batch-run-manifest.json"].observed_at,
    candidate_count: records.length,
    implemented_adapter_count: 0,
    candidate_selection_policy: "TRUSTED_SOURCE_REGISTRY_FIRST_NO_RAW_SEARCH_RESULT_AUTO_PROMOTION",
    records,
    acquisition_authorized: false,
    production: "HOLD"
  };
  queue.fingerprint = fingerprint(queue);
  outputs["adapter-contract-queue.json"] = queue;

  const manifest = outputs["batch-run-manifest.json"];
  delete manifest.run_fingerprint;
  manifest.adapter_contract_candidates = records.length;
  manifest.inputs.trusted_source_registry = fingerprint(trustedSources.index);
  manifest.outputs["adapter-contract-queue.json"] = queue.fingerprint;
  manifest.adapter_candidate_selection = "CURATED_TRUSTED_SOURCE_REGISTRY";
  manifest.run_fingerprint = fingerprint(manifest);
  return outputs;
}
