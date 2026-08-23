#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [
  datasetPath,
  manifestPath,
  licensePath,
  readmePath,
  contractPath,
  outputDir,
] = process.argv.slice(2);

if (![datasetPath, manifestPath, licensePath, readmePath, contractPath, outputDir].every(Boolean)) {
  throw new Error('GSA_EVIDENCE_ADMISSION_ARGUMENTS_REQUIRED');
}

const readText = (file) => fs.readFile(file, 'utf8');
const readJson = async (file) => JSON.parse(await readText(file));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};
const stableJson = (value) => `${JSON.stringify(stableValue(value), null, 2)}\n`;
const canonicalId = (prefix, value) => `${prefix}::${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
const normalizeBoolean = (value) => value === true || value === 1 || String(value).trim().toLowerCase() === 'true';
const finiteNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
};
const normalizedText = (value) => String(value ?? '').trim();
const parseSourceUrl = (value, allowedHosts) => {
  try {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || !allowedHosts.includes(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const [datasetRaw, manifestRaw, licenseRaw, readmeRaw, contractRaw] = await Promise.all([
  readText(datasetPath),
  readText(manifestPath),
  readText(licensePath),
  readText(readmePath),
  readText(contractPath),
]);
const dataset = JSON.parse(datasetRaw);
const manifest = JSON.parse(manifestRaw);
const contract = JSON.parse(contractRaw);

if (contract.id !== 'kidults-asi-gsa-open-dataset-evidence-admission-contract-v1' || contract.version !== '1.0.0') {
  throw new Error('GSA_EVIDENCE_CONTRACT_INVALID');
}
if (JSON.stringify(contract.platform_principles) !== JSON.stringify(['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'])) {
  throw new Error('GSA_EVIDENCE_PLATFORM_PRINCIPLES_INVALID');
}
if (!Array.isArray(dataset)) throw new Error('GSA_DATASET_NOT_ARRAY');
if (dataset.length !== contract.source_registration.expected_manifest.row_count || dataset.length !== manifest.rowCount) {
  throw new Error(`GSA_DATASET_ROW_COUNT_INVALID:${dataset.length}`);
}
const expectedManifest = contract.source_registration.expected_manifest;
if (manifest.license !== expectedManifest.license || manifest.schemaVersion !== expectedManifest.schema_version ||
    manifest.generatedAt !== expectedManifest.generated_at || manifest.rowCount !== expectedManifest.row_count ||
    manifest.coverage?.country !== expectedManifest.coverage_country || manifest.coverage?.source !== expectedManifest.coverage_source ||
    manifest.coverage?.earliestEnded !== expectedManifest.earliest_ended || manifest.coverage?.latestEnded !== expectedManifest.latest_ended) {
  throw new Error('GSA_MANIFEST_BINDING_INVALID');
}
const expectedColumns = [
  'id', 'title', 'category', 'condition', 'seller_type', 'state', 'city', 'zip', 'currency',
  'starting_bid', 'current_or_final_bid', 'bid_count', 'buyer_premium_pct', 'sold', 'ended_at', 'source_url',
];
if (JSON.stringify(manifest.columns) !== JSON.stringify(expectedColumns)) throw new Error('GSA_MANIFEST_COLUMNS_INVALID');
if (!licenseRaw.includes('Creative Commons Attribution 4.0 International') ||
    !licenseRaw.includes('free to share and adapt the material for any') ||
    !licenseRaw.includes('provided you give appropriate credit') ||
    !licenseRaw.includes('GovAuctions (https://govauctions.app)')) {
  throw new Error('GSA_LICENSE_TEXT_INVALID');
}
if (!readmeRaw.includes('Bid level, not a guaranteed sale price') ||
    !readmeRaw.includes('do not treat a blank as $0') ||
    !readmeRaw.includes('CC-BY-4.0')) {
  throw new Error('GSA_README_SEMANTIC_BOUNDARY_INVALID');
}

const allowedHosts = contract.selection_policy.required_source_hosts;
const candidates = dataset.map((record) => {
  const sourceUrl = parseSourceUrl(record.source_url, allowedHosts);
  const endedMs = Date.parse(record.ended_at);
  const observedBidLevel = finiteNumber(record.current_or_final_bid);
  const bidCount = finiteNumber(record.bid_count);
  return {
    record,
    sourceUrl,
    endedMs,
    observedBidLevel,
    bidCount,
    category: normalizedText(record.category),
    id: normalizedText(record.id),
    title: normalizedText(record.title),
  };
}).filter((candidate) =>
  candidate.id.length > 0 &&
  candidate.title.length > 0 &&
  normalizeBoolean(candidate.record.sold) &&
  candidate.observedBidLevel !== null && candidate.observedBidLevel > 0 &&
  candidate.bidCount !== null && Number.isInteger(candidate.bidCount) && candidate.bidCount > 0 &&
  normalizedText(candidate.record.currency).toUpperCase() === contract.selection_policy.required_currency &&
  candidate.category.toUpperCase().includes(contract.selection_policy.required_category_pattern) &&
  candidate.sourceUrl !== null &&
  Number.isFinite(candidate.endedMs)
).sort((left, right) => right.endedMs - left.endedMs || left.id.localeCompare(right.id));

if (candidates.length < 1) throw new Error('GSA_NO_ELIGIBLE_BOUNDED_EVIDENCE_RECORD');
const selected = candidates[0];
const selectedRecord = selected.record;
const endedAt = new Date(selected.endedMs).toISOString();
const startingBid = finiteNumber(selectedRecord.starting_bid);
const evidenceId = canonicalId('evidence', {
  source_id: contract.source_registration.source_id,
  repository_commit: contract.source_registration.repository_commit,
  source_record_id: selected.id,
  evidence_type: contract.evidence_semantics.evidence_type,
});
const admissionReceiptId = canonicalId('evidence-admission-receipt', { evidence_id: evidenceId, contract: contract.id });
const rightsReceiptId = canonicalId('rights-receipt', {
  source_id: contract.source_registration.source_id,
  repository_commit: contract.source_registration.repository_commit,
  license_sha256: sha256(licenseRaw),
});

const attribution = {
  text: contract.rights_policy.required_attribution,
  publisher: contract.source_registration.publisher,
  dataset_name: contract.source_registration.source_name,
  dataset_date: manifest.generatedAt,
  license: contract.rights_policy.license,
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  source_page: manifest.sourcePage,
  changes_disclosure: 'KIDULTS selected one deterministic record, normalized field names, preserved the original source URL and narrowed the claim ceiling; the raw dataset is not redistributed by this workflow.',
};

const rightsReceipt = {
  id: 'kidults-gsa-open-dataset-rights-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS_ALLOW_WITH_ATTRIBUTION',
  receipt_id: rightsReceiptId,
  source_id: contract.source_registration.source_id,
  repository: contract.source_registration.repository,
  repository_commit: contract.source_registration.repository_commit,
  license_decision: contract.rights_policy.decision,
  license: contract.rights_policy.license,
  granted_purposes: contract.rights_policy.granted_purposes,
  attribution,
  source_file_digests: {
    dataset_sha256: sha256(datasetRaw),
    manifest_sha256: sha256(manifestRaw),
    license_sha256: sha256(licenseRaw),
    readme_sha256: sha256(readmeRaw),
  },
  license_evidence_refs: [
    `https://github.com/${contract.source_registration.repository}/blob/${contract.source_registration.repository_commit}/${contract.source_registration.license_path}`,
    `https://github.com/${contract.source_registration.repository}/blob/${contract.source_registration.repository_commit}/${contract.source_registration.readme_path}`,
    `https://github.com/${contract.source_registration.repository}/blob/${contract.source_registration.repository_commit}/${contract.source_registration.manifest_path}`,
  ],
  raw_dataset_redistributed: false,
  rights_pass_created_for_exact_licensed_dataset_snapshot: true,
  public_release: 'HOLD',
  production: 'HOLD',
};

const evidenceRecord = {
  evidence_id: evidenceId,
  evidence_admission_receipt_id: admissionReceiptId,
  admission_state: 'ADMITTED_NARROW_AUCTION_OUTCOME_CONTEXT_ONLY',
  evidence_type: contract.evidence_semantics.evidence_type,
  evidence_class: contract.evidence_semantics.evidence_class,
  source_id: contract.source_registration.source_id,
  source_record_id: selected.id,
  source_record_title: selected.title,
  source_record_category: selected.category,
  source_record_condition: normalizedText(selectedRecord.condition) || null,
  source_record_location: {
    country: manifest.coverage.country,
    state: normalizedText(selectedRecord.state) || null,
    city: normalizedText(selectedRecord.city) || null,
    zip: normalizedText(selectedRecord.zip) || null,
  },
  source_url: selected.sourceUrl,
  auction_ended_at: endedAt,
  observed_market_context: {
    reported_sold_signal: true,
    last_observed_bid_level: selected.observedBidLevel,
    bid_count: selected.bidCount,
    currency: contract.selection_policy.required_currency,
    starting_bid_state: startingBid === null ? 'UNKNOWN_NOT_ZERO' : 'OBSERVED',
    starting_bid_level: startingBid,
    buyer_premium_pct: finiteNumber(selectedRecord.buyer_premium_pct),
    price_role: 'LAST_OBSERVED_BID_LEVEL_NOT_HAMMER_OR_REALIZED_PRICE',
  },
  domain_assignment: 'automobiles-mobility',
  scope_assignment_state: contract.selection_policy.scope_assignment_state,
  collectible_classification: 'NOT_ESTABLISHED',
  rights: {
    decision: contract.rights_policy.decision,
    license: contract.rights_policy.license,
    granted_purposes: contract.rights_policy.granted_purposes,
    rights_receipt_id: rightsReceiptId,
    attribution,
  },
  provenance: {
    upstream_authority: contract.source_registration.upstream_authority,
    dataset_publisher: contract.source_registration.publisher,
    repository: contract.source_registration.repository,
    repository_commit: contract.source_registration.repository_commit,
    dataset_git_blob_sha: contract.source_registration.expected_git_blob_shas.dataset,
    dataset_sha256: sha256(datasetRaw),
    manifest_sha256: sha256(manifestRaw),
    license_sha256: sha256(licenseRaw),
    source_url: selected.sourceUrl,
  },
  claim_ceiling: contract.claim_ceiling,
  semantic_assertions: {
    reported_sold_signal_is_confirmed_transaction: false,
    last_observed_bid_level_is_hammer_price: false,
    last_observed_bid_level_is_realized_price: false,
    starting_bid_missing_is_zero: false,
  },
  market_event_admitted: false,
  confirmed_hammer_price_created: false,
  current_price_eligible: false,
  liquidity_eligible: false,
  customer_claim_authorized: false,
  public_projection_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD',
};

const evidenceLedger = {
  id: 'kidults-gsa-open-dataset-evidence-admission-ledger-v1',
  version: '1.0.0',
  state: 'FIRST_LAWFUL_EMPIRICAL_EVIDENCE_ADMITTED',
  source_id: contract.source_registration.source_id,
  repository_commit: contract.source_registration.repository_commit,
  eligible_record_count: candidates.length,
  admitted_evidence_count: 1,
  rejected_or_unselected_record_count: dataset.length - 1,
  maximum_admitted_records: contract.selection_policy.maximum_admitted_records,
  records: [evidenceRecord],
  market_events_created: 0,
  confirmed_hammer_prices_created: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
};

const claimCeilingReceipt = {
  id: 'kidults-gsa-open-dataset-claim-ceiling-receipt-v1',
  version: '1.0.0',
  state: 'VERIFIED_NARROW_NON_PRICE_NON_LIQUIDITY_CEILING',
  evidence_id: evidenceId,
  allowed_claims: contract.claim_ceiling.allowed,
  forbidden_claims: contract.claim_ceiling.forbidden,
  last_observed_bid_level_is_hammer_price: false,
  last_observed_bid_level_is_realized_price: false,
  reported_sold_signal_is_confirmed_transaction: false,
  current_price_eligible: false,
  liquidity_eligible: false,
  customer_claim_authorized: false,
  public_release: 'HOLD',
  production: 'HOLD',
};

const sourceNodeId = canonicalId('node:source', contract.source_registration.source_id);
const snapshotNodeId = canonicalId('node:dataset-snapshot', {
  repository: contract.source_registration.repository,
  commit: contract.source_registration.repository_commit,
});
const licenseNodeId = canonicalId('node:license', { license: contract.rights_policy.license, digest: sha256(licenseRaw) });
const recordNodeId = canonicalId('node:source-record', { source_id: contract.source_registration.source_id, record_id: selected.id });
const evidenceNodeId = canonicalId('node:evidence', evidenceId);
const nodes = [
  { node_id: sourceNodeId, node_type: 'LICENSED_SOURCE', source_id: contract.source_registration.source_id },
  { node_id: snapshotNodeId, node_type: 'IMMUTABLE_DATASET_SNAPSHOT', repository_commit: contract.source_registration.repository_commit, dataset_sha256: sha256(datasetRaw) },
  { node_id: licenseNodeId, node_type: 'RIGHTS_LICENSE', license: contract.rights_policy.license, rights_receipt_id: rightsReceiptId },
  { node_id: recordNodeId, node_type: 'SOURCE_RECORD', source_record_id: selected.id, source_url: selected.sourceUrl },
  { node_id: evidenceNodeId, node_type: 'ADMITTED_EVIDENCE', evidence_id: evidenceId, evidence_type: contract.evidence_semantics.evidence_type },
].map((node) => ({ ...node, public_release: 'HOLD', production: 'HOLD' })).sort((a, b) => a.node_id.localeCompare(b.node_id));
const edge = (type, from, to) => ({
  edge_id: canonicalId('edge', { edge_type: type, from_node_id: from, to_node_id: to }),
  edge_type: type,
  from_node_id: from,
  to_node_id: to,
  public_release: 'HOLD',
  production: 'HOLD',
});
const edges = [
  edge('SOURCE_PUBLISHES_DATASET_SNAPSHOT', sourceNodeId, snapshotNodeId),
  edge('DATASET_SNAPSHOT_GOVERNED_BY_LICENSE', snapshotNodeId, licenseNodeId),
  edge('DATASET_SNAPSHOT_CONTAINS_SOURCE_RECORD', snapshotNodeId, recordNodeId),
  edge('ADMITTED_EVIDENCE_DERIVED_FROM_SOURCE_RECORD', evidenceNodeId, recordNodeId),
  edge('ADMITTED_EVIDENCE_GOVERNED_BY_LICENSE', evidenceNodeId, licenseNodeId),
].sort((a, b) => a.edge_id.localeCompare(b.edge_id));
const ownedEvidenceGraphIncrement = {
  id: 'kidults-gsa-open-dataset-owned-evidence-graph-increment-v1',
  version: '1.0.0',
  state: 'OWNED_EVIDENCE_GRAPH_INCREMENT_READY',
  node_count: nodes.length,
  edge_count: edges.length,
  evidence_node_count: 1,
  market_event_node_count: 0,
  orphan_edge_count: 0,
  nodes,
  edges,
  public_release: 'HOLD',
  production: 'HOLD',
};

await fs.mkdir(outputDir, { recursive: true });
const writeOutput = async (name, value) => {
  const content = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), content);
  return { name, sha256: sha256(content), bytes: Buffer.byteLength(content) };
};
const outputs = [];
outputs.push(await writeOutput('gsa-open-dataset-rights-receipt-v1.json', rightsReceipt));
outputs.push(await writeOutput('gsa-open-dataset-evidence-admission-ledger-v1.json', evidenceLedger));
outputs.push(await writeOutput('gsa-open-dataset-claim-ceiling-receipt-v1.json', claimCeilingReceipt));
outputs.push(await writeOutput('gsa-open-dataset-owned-evidence-graph-increment-v1.json', ownedEvidenceGraphIncrement));

const manifestOutput = {
  id: 'kidults-gsa-open-dataset-evidence-admission-manifest-v1',
  version: '1.0.0',
  state: 'VERIFIED_FIRST_LAWFUL_EVIDENCE_ADMISSION_READY_FOR_VALIDATION',
  as_of: endedAt,
  platform_principles: contract.platform_principles,
  source_binding: {
    source_id: contract.source_registration.source_id,
    repository: contract.source_registration.repository,
    repository_commit: contract.source_registration.repository_commit,
    dataset_git_blob_sha: contract.source_registration.expected_git_blob_shas.dataset,
    dataset_sha256: sha256(datasetRaw),
    manifest_sha256: sha256(manifestRaw),
    license_sha256: sha256(licenseRaw),
    readme_sha256: sha256(readmeRaw),
    row_count: dataset.length,
    eligible_record_count: candidates.length,
    selected_source_record_id: selected.id,
  },
  results: {
    rights_receipts_verified_pass: 1,
    evidence_admitted: 1,
    owned_evidence_nodes_created: 1,
    market_events_created: 0,
    confirmed_hammer_prices_created: 0,
    realized_transaction_prices_created: 0,
    current_prices_created: 0,
    liquidity_measures_created: 0,
    snapshot_candidates_created: 0,
    track_b_input_pairs_created: 0,
  },
  output_files: outputs,
  autonomous_effect: 'POSITIVE_PINNED_LICENSED_DATASET_SNAPSHOT_REPRODUCES_ONE_EVIDENCE_ADMISSION_WITHOUT_MANUAL_ROW_SELECTION',
  global_effect: 'LIMITED_US_ONLY_FIRST_EMPIRICAL_ADMISSION_DOES_NOT_ESTABLISH_GLOBAL_REPRESENTATIVENESS',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNS_THE_RIGHTS_PROVENANCE_CLAIM_CEILING_AND_EVIDENCE_GRAPH_BINDING',
  transparency_effect: 'POSITIVE_BID_LEVEL_SOLD_SIGNAL_LICENSE_ATTRIBUTION_AND_FORBIDDEN_CLAIMS_ARE_EXPLICIT',
  public_release: 'HOLD',
  production: 'HOLD',
};
outputs.push(await writeOutput('gsa-open-dataset-evidence-admission-manifest-v1.json', manifestOutput));

console.log(JSON.stringify({
  state: 'FIRST_LAWFUL_EMPIRICAL_EVIDENCE_ADMITTED',
  source_id: contract.source_registration.source_id,
  source_record_id: selected.id,
  source_record_category: selected.category,
  auction_ended_at: endedAt,
  reported_sold_signal: true,
  last_observed_bid_level: selected.observedBidLevel,
  bid_count: selected.bidCount,
  rights_decision: contract.rights_policy.decision,
  evidence_admitted: 1,
  market_events_created: 0,
  confirmed_hammer_prices_created: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
