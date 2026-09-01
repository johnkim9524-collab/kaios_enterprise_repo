import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { canonicalContentDigest } from './current-sold-engine-v1.mjs';
import { canonicalJsonDigest } from './current-sold-batch-v1.mjs';
import {
  buildCurrentSoldDryRunReceipt,
  writeCurrentSoldDryRunReceipt
} from './current-sold-private-dry-run-v1.mjs';

const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;

function fail(code) {
  throw new Error(code);
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index === argv.length - 1) fail(`CURRENT_SOLD_CONTROL_SMOKE_MISSING_${name.slice(2).toUpperCase()}`);
  if (argv.filter(value => value === name).length !== 1) fail('CURRENT_SOLD_CONTROL_SMOKE_DUPLICATE_ARGUMENT');
  return argv[index + 1];
}

function sourceSha() {
  const value = process.env.CURRENT_SOLD_SOURCE_SHA || process.env.GITHUB_SHA;
  if (!SOURCE_SHA_RE.test(value || '')) fail('CURRENT_SOLD_CONTROL_SMOKE_SOURCE_SHA_REQUIRED');
  return value;
}

function runIdentity() {
  const run = String(process.env.GITHUB_RUN_ID || 'local');
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '1');
  return `current-sold-control-smoke-${run}-${attempt}`;
}

function effectiveNow() {
  const value = process.env.CURRENT_SOLD_CONTROL_NOW;
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) fail('CURRENT_SOLD_CONTROL_SMOKE_INVALID_NOW');
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}

export function buildCurrentSoldControlSmokeFixture() {
  const now = effectiveNow();
  const source_sha = sourceSha();
  const canonical_run_id = runIdentity();
  const soldAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const observedAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const observation = {
    canonical_object_id: 'control:synthetic:current-sold:object-001',
    source_id: 'control_synthetic_source',
    source_event_id: `control-event-${now.toISOString()}`,
    source_url: 'https://example.invalid/kidults/current-sold/control-smoke',
    source_owner: 'KIDULTS CONTROL SYNTHETIC',
    venue: 'CONTROL_ONLY',
    transaction_status: 'SOLD',
    sold_at: soldAt,
    observed_at: observedAt,
    realized_consideration: 1,
    currency: 'USD',
    hammer_price: null,
    all_in_price: null,
    normalized_price: null,
    normalized_currency: null,
    fee_semantics: 'SOURCE_REPORTED_UNKNOWN_FEE_BASIS',
    lot_or_listing_id: 'control-lot-001',
    provenance_digest: `sha256:${'c'.repeat(64)}`,
    acquisition_receipt_id: 'control-acquisition-receipt-001',
    rights_receipt_id: 'control-rights-receipt-001',
    rights_decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
    confidence: 1,
    correction_state: 'ORIGINAL',
    supersedes_event_id: null,
    supersedes_content_digest: null,
    source_sha,
    canonical_run_id
  };
  observation.content_digest = canonicalContentDigest(observation, { now });

  const receiptRegistry = {
    schema_version: 'current-sold-receipt-registry-v1',
    acquisitions: [{
      receipt_id: observation.acquisition_receipt_id,
      receipt_type: 'ACQUISITION',
      status: 'PASS',
      source_id: observation.source_id,
      source_event_id: observation.source_event_id,
      source_url: observation.source_url,
      provenance_digest: observation.provenance_digest,
      content_digest: observation.content_digest,
      source_sha,
      canonical_run_id
    }],
    rights: [{
      receipt_id: observation.rights_receipt_id,
      receipt_type: 'RIGHTS',
      status: 'PASS',
      source_id: observation.source_id,
      decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
      purpose: 'PRIVATE_CURRENT_SOLD',
      source_sha,
      canonical_run_id,
      valid_from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      valid_until: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    }]
  };
  const envelope = {
    schema_version: 'current-sold-batch-envelope-v1',
    batch_id: `control-smoke-${now.toISOString()}`,
    created_at: now.toISOString(),
    source_sha,
    canonical_run_id,
    observations: [observation]
  };
  return { now, envelope, receiptRegistry };
}

export async function runCurrentSoldControlSmoke(argv = process.argv.slice(2)) {
  const output = argValue(argv, '--output');
  if (argv.length !== 2) fail('CURRENT_SOLD_CONTROL_SMOKE_UNKNOWN_ARGUMENT');
  const { now, envelope, receiptRegistry } = buildCurrentSoldControlSmokeFixture();
  const receipt = buildCurrentSoldDryRunReceipt(envelope, receiptRegistry, {
    now,
    executionClass: 'CONTROL_SYNTHETIC',
    registryAuthorityClass: 'CONTROL_SYNTHETIC_GENERATOR',
    expectedReceiptRegistryDigest: canonicalJsonDigest(receiptRegistry)
  });
  if (receipt.status !== 'PASS') fail('CURRENT_SOLD_CONTROL_SMOKE_NOT_PASS');
  if (receipt.counts.empirical_admitted !== 0 || receipt.counts.control_synthetic_admitted !== 1) {
    fail('CURRENT_SOLD_CONTROL_SMOKE_CLAIM_BOUNDARY_BROKEN');
  }
  await writeCurrentSoldDryRunReceipt(output, receipt);
  process.stdout.write(`${JSON.stringify({
    result: 'PASS',
    receipt_id: receipt.receipt_id,
    control_synthetic_admitted: 1,
    empirical_admitted: 0,
    postgres_migration_applied: false,
    postgres_rows_written: 0,
    provider_calls: 0,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  })}\n`);
  return receipt;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  runCurrentSoldControlSmoke()
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
