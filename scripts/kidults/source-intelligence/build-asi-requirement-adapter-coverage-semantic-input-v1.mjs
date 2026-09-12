#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const UPSTREAM_CLASS = 'ASI_AUTONOMOUS_RESOLUTION';
const DOMAIN = 'KIDULTS_ASI_REQUIREMENT_ADAPTER_COVERAGE_CANONICAL_SEMANTIC_INPUT_V1';
const PROJECTION_VERSION = '1.0.0';
const MANIFEST_ALLOWLIST = [
  'id',
  'version',
  'results',
  'input_bindings.contract.digest',
  'input_bindings.adapter_contract.digest',
  'input_bindings.adapter_contract.profiles',
  'input_bindings.frontier.digest',
  'input_bindings.frontier.records',
  'input_bindings.crosswalk.digest',
  'input_bindings.crosswalk.records',
  'output_files[replacement-source-mission-queue-v1.json].name',
  'output_files[replacement-source-mission-queue-v1.json].bytes',
  'output_files[replacement-source-mission-queue-v1.json].sha256',
];
const RECEIPT_ALLOWLIST = [
  'id', 'version', 'state', 'source_sha', 'trigger_event', 'artifact_role',
  'authoritative_producer', 'downstream_consumable', 'canonical_artifact_published',
  'p1_source_sha', 'exact_generation_bound', 'exact_triggering_run_bound',
  'validation_only', 'promotion_authority', 'artifact_cardinality', 'results',
  'autonomous_effect', 'global_effect', 'irreplaceable_value_effect',
  'transparency_effect', 'live_target_site_network_requests', 'rights_pass_created',
  'evidence_admitted', 'market_events_created', 'snapshot_candidates_created',
  'public_release', 'production',
];
const AUTHORITATIVE_INPUT_FILE_KEYS = [
  'artifact_binding_schema',
  'resolution_contract',
  'runtime_contract',
  'source_frontier',
  'scope_crosswalk',
  'bonhams_contract',
  'bonhams_registry',
  'wave2_contract',
  'wave2_registry',
  'wave3_contract',
  'wave3_registry',
  'wave4_contract',
  'wave4_registry',
  'purpose_rights_preflight',
];
const VOLATILE_PROVENANCE_EXCLUSIONS = [
  'manifest.as_of',
  'manifest.unconsumed_input_bindings',
  'manifest.non_replacement_queue_output_files',
  'receipt.producer_workflow_run_id',
  'receipt.producer_workflow_run_attempt',
  'receipt.producer_display_title',
  'receipt.authoritative_generation_key',
  'receipt.p1_workflow_run_id',
  'receipt.p1_artifact_id',
  'receipt.p1_artifact_digest',
  'receipt.manifest_digest',
  'receipt.created_at',
  'receipt.updated_at',
  'receipt.expires_at',
];
const IMPLEMENTATION_FILES = [
  'scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-v1.mjs',
  'scripts/kidults/source-intelligence/validate-asi-requirement-adapter-coverage-v1.mjs',
  'scripts/kidults/source-intelligence/lib/source-purpose-rights-gate-v1.mjs',
  'scripts/kidults/source-intelligence/resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs',
  'scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-semantic-input-v1.mjs',
  'package.json',
  'npm-shrinkwrap.json',
];

export function stableJson(value) {
  if (value === undefined) fail('CANONICAL_JSON_UNDEFINED');
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function exactObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function assertJsonSafe(value, location = '$') {
  if (value === undefined) fail('SEMANTIC_MATERIAL_UNDEFINED', location);
  if (typeof value === 'number' && !Number.isFinite(value)) fail('SEMANTIC_MATERIAL_NONFINITE', location);
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') fail('SEMANTIC_MATERIAL_NON_JSON_TYPE', location);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafe(entry, `${location}[${index}]`));
    return value;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertJsonSafe(entry, `${location}.${key}`);
  }
  return value;
}

function requiredProjection(value, location) {
  if (value === undefined || value === null) fail('SEMANTIC_PROJECTION_FIELD_REQUIRED', location);
  return value;
}

export function projectStableArlReceipt(receipt) {
  exactObject(receipt, 'ARL_RECEIPT_OBJECT_REQUIRED');
  const projected = {
    id: receipt.id,
    version: receipt.version,
    state: receipt.state,
    source_sha: receipt.source_sha,
    trigger_event: receipt.trigger_event,
    artifact_role: receipt.artifact_role,
    authoritative_producer: receipt.authoritative_producer,
    downstream_consumable: receipt.downstream_consumable,
    canonical_artifact_published: receipt.canonical_artifact_published === undefined
      ? receipt.downstream_consumable
      : receipt.canonical_artifact_published,
    p1_source_sha: receipt.p1_source_sha,
    exact_generation_bound: receipt.exact_generation_bound,
    exact_triggering_run_bound: receipt.exact_triggering_run_bound,
    validation_only: receipt.validation_only,
    promotion_authority: receipt.promotion_authority,
    artifact_cardinality: receipt.artifact_cardinality,
    results: receipt.results,
    autonomous_effect: receipt.autonomous_effect,
    global_effect: receipt.global_effect,
    irreplaceable_value_effect: receipt.irreplaceable_value_effect,
    transparency_effect: receipt.transparency_effect,
    live_target_site_network_requests: receipt.live_target_site_network_requests,
    rights_pass_created: receipt.rights_pass_created,
    evidence_admitted: receipt.evidence_admitted,
    market_events_created: receipt.market_events_created,
    snapshot_candidates_created: receipt.snapshot_candidates_created,
    public_release: receipt.public_release,
    production: receipt.production,
  };
  for (const key of Object.keys(projected)) requiredProjection(projected[key], `receipt.${key}`);
  if (!SHA.test(String(projected.source_sha)) || !SHA.test(String(projected.p1_source_sha))) fail('ARL_STABLE_RECEIPT_SHA_INVALID');
  return assertJsonSafe(projected, 'receipt');
}

export function projectStableArlManifest(manifest) {
  exactObject(manifest, 'ARL_MANIFEST_OBJECT_REQUIRED');
  const queueOutput = (manifest.output_files || []).find((entry) => entry?.name === 'replacement-source-mission-queue-v1.json');
  if (!queueOutput) fail('ARL_MANIFEST_REPLACEMENT_QUEUE_BINDING_REQUIRED');
  const projected = {
    id: requiredProjection(manifest.id, 'manifest.id'),
    version: requiredProjection(manifest.version, 'manifest.version'),
    results: requiredProjection(manifest.results, 'manifest.results'),
    consumed_input_bindings: {
      contract: {
        digest: requiredProjection(manifest.input_bindings?.contract?.digest, 'manifest.input_bindings.contract.digest'),
      },
      adapter_contract: {
        digest: requiredProjection(manifest.input_bindings?.adapter_contract?.digest, 'manifest.input_bindings.adapter_contract.digest'),
        profiles: requiredProjection(manifest.input_bindings?.adapter_contract?.profiles, 'manifest.input_bindings.adapter_contract.profiles'),
      },
      frontier: {
        digest: requiredProjection(manifest.input_bindings?.frontier?.digest, 'manifest.input_bindings.frontier.digest'),
        records: requiredProjection(manifest.input_bindings?.frontier?.records, 'manifest.input_bindings.frontier.records'),
      },
      crosswalk: {
        digest: requiredProjection(manifest.input_bindings?.crosswalk?.digest, 'manifest.input_bindings.crosswalk.digest'),
        records: requiredProjection(manifest.input_bindings?.crosswalk?.records, 'manifest.input_bindings.crosswalk.records'),
      },
    },
    replacement_queue_output_binding: {
      name: requiredProjection(queueOutput.name, 'manifest.output_files.replacement_queue.name'),
      bytes: requiredProjection(queueOutput.bytes, 'manifest.output_files.replacement_queue.bytes'),
      sha256: requiredProjection(queueOutput.sha256, 'manifest.output_files.replacement_queue.sha256'),
    },
  };
  return assertJsonSafe(projected, 'manifest');
}

function digestMapFromFiles(entries) {
  const output = {};
  for (const [name, file] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof file !== 'string' || !fs.existsSync(file) || !fs.statSync(file).isFile()) fail('SEMANTIC_STATIC_INPUT_MISSING', `${name}:${file}`);
    output[name] = { path: file, digest: sha256(fs.readFileSync(file)) };
  }
  return output;
}

export function buildSemanticInputMaterial({
  sourceSha,
  upstreamClass,
  queue,
  manifest,
  receipt,
  coverageContract,
  coverageContractBytes,
  authoritativeInputDigests,
  authoritativeInputConstants,
  implementationDigests,
}) {
  if (!SHA.test(String(sourceSha || ''))) fail('SOURCE_SHA_INVALID');
  if (upstreamClass !== UPSTREAM_CLASS) fail('UPSTREAM_CLASS_INVALID');
  exactObject(queue, 'ARL_QUEUE_OBJECT_REQUIRED');
  exactObject(coverageContract, 'COVERAGE_CONTRACT_OBJECT_REQUIRED');
  exactObject(authoritativeInputDigests, 'AUTHORITATIVE_INPUT_DIGESTS_REQUIRED');
  exactObject(authoritativeInputConstants, 'AUTHORITATIVE_INPUT_CONSTANTS_REQUIRED');
  exactObject(implementationDigests, 'IMPLEMENTATION_DIGESTS_REQUIRED');
  const stableManifest = projectStableArlManifest(manifest);
  const stableReceipt = projectStableArlReceipt(receipt);
  if (stableReceipt.source_sha !== sourceSha || stableReceipt.p1_source_sha !== sourceSha) fail('ARL_RECEIPT_SOURCE_DIVERGENCE');
  const material = {
    domain: DOMAIN,
    source_sha: sourceSha,
    upstream_class: upstreamClass,
    projection_version: PROJECTION_VERSION,
    projection_allowlist: {
      manifest: MANIFEST_ALLOWLIST,
      receipt: RECEIPT_ALLOWLIST,
      replacement_queue: 'FULL_DETERMINISTIC_OBJECT',
    },
    arl_semantic_outputs: {
      replacement_queue_digest: sha256(stableJson(queue)),
      manifest_digest: sha256(stableJson(stableManifest)),
      stable_receipt_digest: sha256(stableJson(stableReceipt)),
    },
    coverage_contract: {
      id: coverageContract.id,
      version: coverageContract.version,
      digest: sha256(coverageContractBytes),
    },
    authoritative_input_digests: authoritativeInputDigests,
    authoritative_input_constants: authoritativeInputConstants,
    implementation_digests: implementationDigests,
    volatile_provenance_excluded_from_identity: VOLATILE_PROVENANCE_EXCLUSIONS,
  };
  return assertJsonSafe(material, 'material');
}

export function buildSemanticInputFromFiles({ sourceSha, upstreamClass, queuePath, manifestPath, receiptPath, contractPath }) {
  const coverageContractBytes = fs.readFileSync(contractPath);
  const coverageContract = JSON.parse(coverageContractBytes);
  const material = buildSemanticInputMaterial({
    sourceSha,
    upstreamClass,
    queue: JSON.parse(fs.readFileSync(queuePath, 'utf8')),
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')),
    coverageContract,
    coverageContractBytes,
    authoritativeInputDigests: digestMapFromFiles(AUTHORITATIVE_INPUT_FILE_KEYS.map((key) => [key, coverageContract.authoritative_inputs?.[key]])),
    authoritativeInputConstants: Object.fromEntries(Object.entries(coverageContract.authoritative_inputs || {})
      .filter(([key]) => !AUTHORITATIVE_INPUT_FILE_KEYS.includes(key))
      .sort(([left], [right]) => left.localeCompare(right))),
    implementationDigests: digestMapFromFiles(IMPLEMENTATION_FILES.map((file) => [file, file])),
  });
  const result = {
    id: 'kidults-asi-requirement-adapter-coverage-semantic-input-receipt-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS_SEMANTIC_INPUT_BOUND',
    canonical_input_digest: sha256(stableJson(material)),
    material,
    exact_upstream_provenance_included_in_identity: false,
    exact_upstream_provenance_required_in_observation_receipt: true,
    runtime_dedupe_state: 'REMOTE_LEDGER_ACTIVATION_HOLD',
    canonical_execution_claimed: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
  };
  const serialized = JSON.parse(JSON.stringify(result));
  if (serialized.canonical_input_digest !== sha256(stableJson(serialized.material))) fail('SEMANTIC_RECEIPT_SERIALIZATION_DIGEST_MISMATCH');
  return serialized;
}

function parseArgs(argv) {
  const args = {};
  const mapping = {
    '--source-sha': 'sourceSha', '--upstream-class': 'upstreamClass', '--queue': 'queuePath',
    '--manifest': 'manifestPath', '--receipt': 'receiptPath', '--contract': 'contractPath', '--output': 'output',
  };
  for (let index = 0; index < argv.length; index += 2) {
    const name = mapping[argv[index]];
    if (!name || !argv[index + 1]) fail('ARGUMENT_INVALID', argv[index]);
    args[name] = argv[index + 1];
  }
  for (const name of Object.values(mapping)) if (!args[name]) fail('ARGUMENT_REQUIRED', name);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = buildSemanticInputFromFiles(args);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(result, null, 2)}\n`);
  const written = JSON.parse(fs.readFileSync(args.output, 'utf8'));
  if (written.canonical_input_digest !== sha256(stableJson(written.material))) fail('SEMANTIC_RECEIPT_WRITE_READ_DIGEST_MISMATCH');
  process.stdout.write(`${JSON.stringify({ id: result.id, state: result.state, canonical_input_digest: result.canonical_input_digest, production: result.production }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { AUTHORITATIVE_INPUT_FILE_KEYS, DOMAIN, IMPLEMENTATION_FILES, MANIFEST_ALLOWLIST, PROJECTION_VERSION, RECEIPT_ALLOWLIST, VOLATILE_PROVENANCE_EXCLUSIONS };
