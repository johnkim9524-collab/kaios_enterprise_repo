#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [runtimeContractPath, frontierPath, waveContractPath, outputDir] = process.argv.slice(2);
if (![runtimeContractPath, frontierPath, waveContractPath, outputDir].every(Boolean)) {
  throw new Error('AUCTION_ADAPTER_WAVE2_ARGUMENTS_REQUIRED');
}

const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const parsePsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines.shift().split('|');
  return lines.map((line) => {
    const values = line.split('|');
    return Object.fromEntries(header.map((key, index) => [key, values[index] ?? '']));
  });
};
const uniq = (values) => [...new Set(values.filter(Boolean))].sort();

const [runtime, wave, frontierText] = await Promise.all([
  readJson(runtimeContractPath),
  readJson(waveContractPath),
  fs.readFile(frontierPath, 'utf8'),
]);
const frontier = parsePsv(frontierText);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
if (runtime.id !== 'kidults-asi-p1-market-event-adapter-runtime-contract-v1' || runtime.version !== '1.0.0') throw new Error('RUNTIME_CONTRACT_INVALID');
if (wave.id !== 'kidults-asi-auction-adapter-wave2-contract-v1' || wave.version !== '1.0.0') throw new Error('WAVE_CONTRACT_INVALID');
if (JSON.stringify(wave.platform_principles) !== JSON.stringify(principles)) throw new Error('WAVE_PRINCIPLE_ORDER_INVALID');
if (runtime.registered_source_profiles?.length !== 16) throw new Error('REGISTERED_PROFILE_COUNT_INVALID');
if (wave.wave_sources?.length !== 4) throw new Error('WAVE_SOURCE_COUNT_INVALID');
if (new Set(wave.wave_sources.map((source) => source.source_id)).size !== 4) throw new Error('WAVE_SOURCE_DUPLICATE');

const frontierById = new Map(frontier.map((record) => [record.source_id, record]));
const waveById = new Map(wave.wave_sources.map((source) => [source.source_id, source]));
const implementedIds = new Set([wave.reference_adapter.source_id, ...waveById.keys()]);
for (const sourceId of implementedIds) {
  if (!frontierById.has(sourceId)) throw new Error(`IMPLEMENTED_SOURCE_NOT_IN_FRONTIER:${sourceId}`);
  if (!runtime.registered_source_profiles.some((tuple) => tuple[1] === sourceId)) throw new Error(`IMPLEMENTED_SOURCE_NOT_REGISTERED:${sourceId}`);
}

function familyFor(frontierRecord) {
  const channel = String(frontierRecord.channel_type || '').toUpperCase();
  const access = String(frontierRecord.access_mode || '').toUpperCase();
  const roles = String(frontierRecord.source_roles || '').toUpperCase();
  if (channel.includes('API') || access.includes('API')) return 'STRUCTURED_API_MARKET_DATA';
  if (channel.includes('AUCTION') || roles.includes('AUCTION_PRIVATE_SALE')) return 'PUBLIC_WEB_AUCTION_RESULTS';
  if (channel.includes('MARKETPLACE') || roles.includes('LISTING_SUPPLY')) return 'PUBLIC_WEB_MARKETPLACE_RESULTS';
  return 'PUBLIC_WEB_RELEASE_OR_LISTING_SURFACE';
}

const profiles = runtime.registered_source_profiles
  .map(([priorityRank, sourceId, verifiedAssignmentCount, targetClaims]) => {
    const frontierRecord = frontierById.get(sourceId);
    if (!frontierRecord) throw new Error(`PROFILE_SOURCE_NOT_IN_FRONTIER:${sourceId}`);
    const waveSource = waveById.get(sourceId) || null;
    const isReference = sourceId === wave.reference_adapter.source_id;
    const isImplemented = implementedIds.has(sourceId);
    const implementationState = isReference
      ? 'REFERENCE_ADAPTER_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED'
      : waveSource
        ? 'SOURCE_SPECIFIC_ADAPTER_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED'
        : 'TEMPLATE_GENERATED_IMPLEMENTATION_PENDING';
    return {
      priority_rank: priorityRank,
      source_id: sourceId,
      display_name: frontierRecord.display_name,
      core_domain: frontierRecord.core_domain,
      collection_scope_ids: String(frontierRecord.collection_scope_ids || '').split(';').filter(Boolean),
      source_roles: String(frontierRecord.source_roles || '').split(';').filter(Boolean),
      official_endpoint: frontierRecord.official_endpoint,
      official_documentation_url: frontierRecord.official_documentation_url,
      channel_type: frontierRecord.channel_type,
      access_mode: frontierRecord.access_mode,
      adapter_family: familyFor(frontierRecord),
      verified_assignment_count: verifiedAssignmentCount,
      target_claims: [...targetClaims],
      implementation_state: implementationState,
      implementation_module: waveSource?.module
        ?? (isReference ? 'services/kidults-autonomous-intelligence/src/asi/source-adapters/bonhams-cars-results.ts' : null),
      implemented_claim_parsers: isImplemented && targetClaims.includes('DATED_OBSERVED_SOLD_TRANSACTION')
        ? ['DATED_OBSERVED_SOLD_TRANSACTION']
        : [],
      template_only_claims: targetClaims.filter((claim) => claim !== 'DATED_OBSERVED_SOLD_TRANSACTION' || !isImplemented),
      deterministic_fixture_verified: isImplemented,
      generic_market_adapter_runtime_bound: isImplemented,
      live_source_snapshot_verified: false,
      source_schema_empirically_verified: false,
      field_purpose_rights_verified: false,
      sold_semantics_empirically_verified: false,
      liquidity_semantics_empirically_verified: false,
      source_owner_verified: false,
      factual_origin_verified: false,
      factual_origin_independence_verified: false,
      adapter_activated: false,
      evidence_admitted: 0,
      market_events_created: 0,
      public_release: 'HOLD',
      production: 'HOLD',
    };
  })
  .sort((a, b) => a.priority_rank - b.priority_rank || a.source_id.localeCompare(b.source_id));

const implementationRegistry = {
  id: 'kidults-asi-auction-adapter-wave2-implementation-registry-v1',
  version: '1.0.0',
  state: 'FIVE_SOURCE_SPECIFIC_ADAPTERS_IMPLEMENTED_FIXTURE_VERIFIED_NOT_EMPIRICALLY_ACTIVATED',
  platform_principles: principles,
  registered_source_profiles: profiles.length,
  reference_adapters_implemented: profiles.filter((profile) => profile.implementation_state.startsWith('REFERENCE_ADAPTER')).length,
  wave2_source_specific_adapters_implemented: profiles.filter((profile) => profile.implementation_state.startsWith('SOURCE_SPECIFIC_ADAPTER')).length,
  total_source_specific_adapters_implemented: profiles.filter((profile) => profile.implementation_state.includes('ADAPTER_IMPLEMENTED')).length,
  source_specific_adapters_pending: profiles.filter((profile) => profile.implementation_state === 'TEMPLATE_GENERATED_IMPLEMENTATION_PENDING').length,
  verified_assignment_count_covered_by_implemented_parsers: profiles
    .filter((profile) => profile.implementation_state.includes('ADAPTER_IMPLEMENTED'))
    .reduce((total, profile) => total + profile.verified_assignment_count, 0),
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  source_specific_adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  profiles,
  public_release: 'HOLD',
  production: 'HOLD',
};

const backlog = profiles
  .filter((profile) => profile.implementation_state === 'TEMPLATE_GENERATED_IMPLEMENTATION_PENDING')
  .map((profile) => ({
    backlog_id: `source-adapter::${profile.source_id}`,
    priority_rank: profile.priority_rank,
    source_id: profile.source_id,
    display_name: profile.display_name,
    adapter_family: profile.adapter_family,
    verified_assignment_count: profile.verified_assignment_count,
    target_claims: profile.target_claims,
    state: 'SOURCE_SPECIFIC_IMPLEMENTATION_PENDING',
    required_next_steps: [
      'SOURCE_SPECIFIC_IMMUTABLE_SNAPSHOT_PARSER',
      'HOST_AND_PAYLOAD_INTEGRITY_CONTROL',
      'CLAIM_SPECIFIC_SEMANTIC_PARSER',
      'GENERIC_MARKET_ADAPTER_RUNTIME_BINDING',
      'DETERMINISTIC_REPLAY_PROOF',
      'NEGATIVE_MUTATION_PROOF',
      'EMPIRICAL_LIVE_SCHEMA_PREFLIGHT',
      'PURPOSE_SPECIFIC_RIGHTS_ADJUDICATION',
      'SOURCE_OWNER_AND_FACTUAL_ORIGIN_VERIFICATION',
      'ACTIVATION_GATE',
      'EVIDENCE_ADMISSION_RECEIPT'
    ],
    rights_or_admission_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
  }));

const developmentBacklog = {
  id: 'kidults-source-adapter-implementation-backlog-v2',
  version: '2.0.0',
  state: 'ELEVEN_SOURCE_SPECIFIC_ADAPTERS_PENDING',
  pending_count: backlog.length,
  pending_verified_assignment_count: backlog.reduce((total, item) => total + item.verified_assignment_count, 0),
  next_wave: backlog.slice(0, 4).map((item) => item.source_id),
  items: backlog,
  public_release: 'HOLD',
  production: 'HOLD',
};

await fs.mkdir(outputDir, { recursive: true });
const outputs = [];
for (const [name, value] of [
  ['auction-adapter-wave2-implementation-registry-v1.json', implementationRegistry],
  ['source-adapter-implementation-backlog-v2.json', developmentBacklog],
]) {
  const text = stableJson(value);
  await fs.writeFile(path.join(outputDir, name), text);
  outputs.push({ name, bytes: Buffer.byteLength(text), sha256: sha256(text) });
}

const manifest = {
  id: 'kidults-asi-auction-adapter-wave2-manifest-v1',
  version: '1.0.0',
  state: 'VERIFIED_READY_FOR_VALIDATION',
  platform_principles: principles,
  input_bindings: {
    runtime_contract: { id: runtime.id, digest: sha256(stableJson(runtime)) },
    source_frontier: { records: frontier.length, digest: sha256(frontierText) },
    wave_contract: { id: wave.id, digest: sha256(stableJson(wave)) },
  },
  results: {
    registered_source_profiles: profiles.length,
    reference_adapters_implemented: implementationRegistry.reference_adapters_implemented,
    wave2_source_specific_adapters_implemented: implementationRegistry.wave2_source_specific_adapters_implemented,
    total_source_specific_adapters_implemented: implementationRegistry.total_source_specific_adapters_implemented,
    source_specific_adapters_pending: implementationRegistry.source_specific_adapters_pending,
    implemented_parser_assignment_coverage: implementationRegistry.verified_assignment_count_covered_by_implemented_parsers,
    pending_adapter_assignment_count: developmentBacklog.pending_verified_assignment_count,
    live_source_snapshots_verified: 0,
    field_purpose_rights_verified_sources: 0,
    source_specific_adapters_activated: 0,
    evidence_admitted: 0,
    market_events_created: 0,
  },
  output_files: outputs,
  autonomous_effect: 'POSITIVE_ONE_REFERENCE_CONTROL_MODEL_NOW_EXECUTES_ACROSS_FOUR_ADDITIONAL_SOURCE_SPECIFIC_ADAPTERS',
  global_effect: 'POSITIVE_IMPLEMENTED_AND_PENDING_SOURCE_COVERAGE_REMAINS_EXPLICIT_ACROSS_ALL_SIXTEEN_REGISTERED_PROFILES',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNS_COMMON_PARSER_CONTROLS_SOURCE_SPECIFIC_CONFIGURATIONS_REPLAY_AND_MUTATION_PROOF',
  transparency_effect: 'POSITIVE_IMPLEMENTED_FIXTURE_VERIFIED_EMPIRICAL_PENDING_AND_ADMISSION_STATES_ARE_NON_COMPENSATING',
  public_release: 'HOLD',
  production: 'HOLD',
};
const manifestText = stableJson(manifest);
await fs.writeFile(path.join(outputDir, 'auction-adapter-wave2-manifest-v1.json'), manifestText);

console.log(JSON.stringify({
  state: manifest.state,
  ...manifest.results,
  public_release: 'HOLD',
  production: 'HOLD',
}, null, 2));
