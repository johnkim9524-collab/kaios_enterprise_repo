#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.cwd();
const expectedRef = process.env.PSA_TRUSTED_REF ?? 'refs/heads/main';
const expectedEnv = 'kidults-psa-bounded-probe';
const blockers = [];
const warnings = [];
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receiptFromEnv = name => { const file = process.env[name]; if (!file) return null; return readJson(path.isAbsolute(file) ? file : path.join(repo, file)); };
const add = (ok, code) => { if (!ok) blockers.push(code); };
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

const source = receiptFromEnv('PSA_SOURCE_RECEIPT');
const authority = receiptFromEnv('PSA_PROVIDER_AUTHORITY_RECEIPT');
const secret = receiptFromEnv('PSA_SECRET_CONTEXT_RECEIPT');
const certs = String(process.env.PSA_KNOWN_CERTS ?? '').split(',').map(v => v.trim()).filter(Boolean);
add(Boolean(source), 'BLOCKED_SOURCE_PROVENANCE_RECEIPT_MISSING');
add(Boolean(authority), 'BLOCKED_PROVIDER_AUTHORITY_RECEIPT_MISSING');
add(Boolean(secret), 'BLOCKED_SECRET_CONTEXT_RECEIPT_MISSING');
if (source) {
  add(String(source.receipt_type ?? '').includes('source'), 'BLOCKED_SOURCE_RECEIPT_TYPE');
  add(nonEmpty(source.source_sha256), 'BLOCKED_SOURCE_DIGEST_MISSING');
  add(nonEmpty(source.rights_basis), 'BLOCKED_SOURCE_RIGHTS_BASIS_MISSING');
  add(Array.isArray(source.cert_numbers) && source.cert_numbers.length > 0, 'BLOCKED_SOURCE_CERT_BINDING_MISSING');
  add(String(source.permitted_purpose ?? '').toLowerCase().includes('private'), 'BLOCKED_SOURCE_PURPOSE_NOT_PRIVATE');
  add(source.bulk_enumeration === false, 'BLOCKED_SOURCE_BULK_ENUMERATION_NOT_DENIED');
  add(source.redistribution === false, 'BLOCKED_SOURCE_REDISTRIBUTION_NOT_DENIED');
  add(source.derivative_outputs === 'bounded_private' || source.derivative_outputs === 'none', 'BLOCKED_SOURCE_DERIVATIVE_SCOPE');
}
if (authority) {
  add(String(authority.receipt_type ?? '').includes('authority'), 'BLOCKED_AUTHORITY_RECEIPT_TYPE');
  add(authority.status === 'active', 'BLOCKED_PROVIDER_AUTHORITY_NOT_ACTIVE');
  add(authority.api_access === true, 'BLOCKED_PROVIDER_API_SCOPE_MISSING');
  add(authority.private_non_production === true, 'BLOCKED_PROVIDER_NON_PRODUCTION_SCOPE');
  add(authority.bulk_enumeration === false, 'BLOCKED_PROVIDER_BULK_NOT_DENIED');
  add(authority.public_release === false && authority.production === false && authority.g5 === false, 'BLOCKED_PROVIDER_PUBLIC_SCOPE');
  add(authority.retention_days === 30 || authority.retention_days === 0, 'BLOCKED_PROVIDER_RETENTION_SCOPE');
}
if (secret) {
  add(String(secret.receipt_type ?? '').includes('secret'), 'BLOCKED_SECRET_RECEIPT_TYPE');
  add(secret.environment === expectedEnv, 'BLOCKED_SECRET_ENVIRONMENT');
  add(secret.trusted_ref === expectedRef, 'BLOCKED_SECRET_TRUSTED_REF');
  add(secret.admin_bypass_disabled === true, 'BLOCKED_SECRET_ADMIN_BYPASS');
  add(secret.token_exposed === false, 'BLOCKED_SECRET_TOKEN_EXPOSURE');
  add(secret.artifact_logging_disabled === true, 'BLOCKED_SECRET_ARTIFACT_LOGGING');
  add(secret.negative_execution_receipts >= 2, 'BLOCKED_SECRET_NEGATIVE_RECEIPTS');
  add(secret.checks_passed === 22 && secret.checks_total === 22, 'BLOCKED_SECRET_CHECKS_NOT_22_OF_22');
}
add(certs.length >= 1 && certs.length <= 3, 'BLOCKED_CERT_SCOPE_NOT_1_TO_3');
if (certs.some(v => !/^d{4,20}$/.test(v))) blockers.push('BLOCKED_CERT_FORMAT');
const knownManifest = readJson(path.join(repo, 'coordination/kidults/provider/psa-120-known-cert-manifest-v1.json'));
const executionPlan = readJson(path.join(repo, 'coordination/kidults/provider/psa-120-execution-plan-v1.json'));
const admissible = Number(knownManifest?.provenance_bound_admissible_count ?? 0);
const target = Number(executionPlan?.target_count ?? 120);
if (target !== 120) warnings.push('TARGET_NOT_120');
if (admissible > 3) blockers.push('BLOCKED_ADMISSIBLE_CERT_SCOPE_EXCEEDS_3');
const state = blockers.length === 0 ? 'READY_SINGLE_CERT_PROBE' : blockers.some(v => v.includes('SOURCE')) ? 'BLOCKED_SOURCE_PROVENANCE' : blockers.some(v => v.includes('AUTHORITY') || v.includes('PROVIDER')) ? 'BLOCKED_PROVIDER_AUTHORITY' : blockers.some(v => v.includes('SECRET')) ? 'BLOCKED_SECRET_CONTEXT' : 'BLOCKED_CERT_SCOPE';
const receipt = {
  schema: 'kidults.psa.bounded-preflight.receipt.v1', gate: 'PSA_BOUNDED_PREFLIGHT', state,
  generated_at: new Date().toISOString(), exact_main_sha: process.env.EXACT_MAIN_SHA ?? process.env.GITHUB_SHA ?? 'UNKNOWN',
  trusted_ref: expectedRef, cert_count: certs.length, cert_digest: digest(certs),
  source_receipt_digest: source ? digest(source) : null, provider_authority_receipt_digest: authority ? digest(authority) : null, secret_context_receipt_digest: secret ? digest(secret) : null,
  empirical_guard: { graded_population: '0/120', candidate: 'NONE', evidence: 'NONE' },
  authority_guard: { private: true, staging_only: true, public: 'HOLD', production: 'HOLD', g5: 'HOLD', provider_activation: 'HOLD' },
  execution_guard: { bulk_enumeration: false, token_printing: false, token_artifacts: false, max_certificates: 3 },
  blockers: [...new Set(blockers)], warnings
};
console.log(JSON.stringify(receipt));
if (process.argv.includes('--require-ready') && state !== 'READY_SINGLE_CERT_PROBE') process.exitCode = 2;
