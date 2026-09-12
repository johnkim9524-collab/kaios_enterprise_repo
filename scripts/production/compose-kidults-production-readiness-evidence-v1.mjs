#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTechnicalEvidence } from './validate-kidults-production-release-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = '1.0.0';
const SUPPORT_PRODUCERS = Object.freeze({
  OBSERVATION_LEDGER: 'KIDULTS_NATURAL_RUN_LEDGER_V1',
  BETA_RELIABILITY: 'KIDULTS_BETA_RELIABILITY_EVALUATOR_V1',
  SLO_ERROR_BUDGET: 'KIDULTS_SLO_ERROR_BUDGET_EVALUATOR_V1',
  PITR: 'KIDULTS_PITR_VERIFIER_V1',
  ROLLBACK: 'KIDULTS_ROLLBACK_VERIFIER_V1',
  NATURAL_RUN: 'KIDULTS_NATURAL_RUN_EXECUTOR_V1',
});
const AUXILIARY = Object.freeze([
  ['production-audit.json', 'KIDULTS_PRODUCTION_AUDIT_EVIDENCE_V1', 'KIDULTS_PRODUCTION_AUDIT_COLLECTOR_V1'],
  ['production-rollback-rehearsal.json', 'KIDULTS_PRODUCTION_ROLLBACK_REHEARSAL_EVIDENCE_V1', 'KIDULTS_PRODUCTION_ROLLBACK_REHEARSAL_V1'],
  ['production-mobile-320.json', 'KIDULTS_PRODUCTION_MOBILE_320_EVIDENCE_V1', 'KIDULTS_PRODUCTION_MOBILE_CERTIFIER_V1'],
  ['production-governance-trust.json', 'KIDULTS_PRODUCTION_GOVERNANCE_TRUST_EVIDENCE_V1', 'KIDULTS_PRODUCTION_GOVERNANCE_CERTIFIER_V1'],
  ['production-observability.json', 'KIDULTS_PRODUCTION_OBSERVABILITY_EVIDENCE_V1', 'KIDULTS_PRODUCTION_OBSERVABILITY_CERTIFIER_V1'],
  ['production-incident-response.json', 'KIDULTS_PRODUCTION_INCIDENT_RESPONSE_EVIDENCE_V1', 'KIDULTS_PRODUCTION_INCIDENT_RESPONSE_CERTIFIER_V1'],
]);

const fail = (code) => { throw new Error(code); };
const sha256 = (raw) => `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`;
const encodeJson = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const exactKeys = (value, expected, code) => {
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code);
};
const parseArgs = () => {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || Object.hasOwn(options, key)) fail('ARGUMENTS_INVALID');
    options[key] = value;
  }
  exactKeys(options, ['--evidence-dir', '--expected-source-sha'], 'ARGUMENT_SET');
  if (!/^[0-9a-f]{40}$/.test(options['--expected-source-sha'])) fail('SOURCE_SHA_INVALID');
  return { evidenceDir: path.resolve(options['--evidence-dir']), sourceSha: options['--expected-source-sha'] };
};

const readRegular = (filePath, code) => {
  const before = fs.lstatSync(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 16 * 1024 * 1024) fail(code);
  const raw = fs.readFileSync(filePath);
  const after = fs.lstatSync(filePath);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || raw.length !== before.size) fail(code);
  return raw;
};
const loadEnvelope = (filePath, { id, producer, sourceSha, kind, subject, code }) => {
  const raw = readRegular(filePath, code);
  let value;
  try { value = JSON.parse(raw); } catch { fail(`${code}:JSON`); }
  exactKeys(value, ['id', 'version', 'producer_id', 'source_sha', 'observed_at', 'state', ...(kind ? ['evidence_kind', 'subject_id'] : []), 'evidence'], `${code}:FIELDS`);
  if (value.id !== id || value.version !== VERSION || value.producer_id !== producer
      || value.source_sha !== sourceSha || value.state !== 'VERIFIED') fail(`${code}:IDENTITY`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value.observed_at)) fail(`${code}:TIME`);
  if (kind && (value.evidence_kind !== kind || value.subject_id !== subject)) fail(`${code}:SUBJECT`);
  if (!value.evidence || Array.isArray(value.evidence) || typeof value.evidence !== 'object') fail(`${code}:EVIDENCE`);
  return { raw, value };
};
const binding = (member, loaded) => ({ member, schema_id: loaded.value.id, schema_version: VERSION, producer_id: loaded.value.producer_id, source_sha: loaded.value.source_sha, sha256: sha256(loaded.raw) });
const supportBinding = (member, loaded) => ({ evidence_kind: loaded.value.evidence_kind, subject_id: loaded.value.subject_id, ...binding(member, loaded) });

const atomicWrite = (directory, name, value) => {
  const target = path.join(directory, name);
  const temporary = path.join(directory, `.${name}.${process.pid}.${crypto.randomBytes(8).toString('hex')}`);
  const raw = encodeJson(value);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
    fs.writeFileSync(descriptor, raw);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch {}
  }
};

const main = () => {
  const { evidenceDir, sourceSha } = parseArgs();
  const directoryStat = fs.lstatSync(evidenceDir);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('EVIDENCE_DIR_INVALID');
  for (const output of ['staging-production-delta.json', 'production-readiness-evidence-v1.json']) {
    const outputPath = path.join(evidenceDir, output);
    if (fs.existsSync(outputPath)) {
      const metadata = fs.lstatSync(outputPath);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.uid !== process.geteuid()) fail(`OUTPUT_IDENTITY:${output}`);
    }
  }

  const auxiliaryLoaded = new Map(AUXILIARY.map(([member, id, producer]) => [member, loadEnvelope(path.join(evidenceDir, member), { id, producer, sourceSha, code: `AUXILIARY:${member}` })]));
  const evidenceOf = (member) => auxiliaryLoaded.get(member).value.evidence;
  const audit = evidenceOf('production-audit.json');
  const governance = evidenceOf('production-governance-trust.json');
  const destructiveSchemaDelta = !(audit.database_integrity === 'ok' && governance.schema_census_state === 'PASS');
  const viewerExportExposed = audit.unauthenticated_collector_http !== 401;
  const restrictedRightsExposed = governance.rights_census_state !== 'PASS';
  const criticalDeltas = [
    ...(destructiveSchemaDelta ? ['destructive_schema_delta'] : []),
    ...(viewerExportExposed ? ['viewer_export_exposed'] : []),
    ...(restrictedRightsExposed ? ['restricted_rights_exposed'] : []),
  ];
  const deltaEvidence = {
    status: criticalDeltas.length === 0 ? 'pass' : 'fail',
    destructive_schema_delta: destructiveSchemaDelta,
    viewer_export_exposed: viewerExportExposed,
    restricted_rights_exposed: restrictedRightsExposed,
    rollback_rehearsal_passed: evidenceOf('production-rollback-rehearsal.json').rollback_rehearsal_passed === true,
    mobile_320_passed: evidenceOf('production-mobile-320.json').mobile_320_passed === true,
    governance_gate_passed: evidenceOf('production-governance-trust.json').governance_gate_passed === true,
    observability_passed: evidenceOf('production-observability.json').observability_passed === true,
    incident_response_ready: evidenceOf('production-incident-response.json').incident_response_ready === true,
    critical_deltas: criticalDeltas,
  };
  if (criticalDeltas.length !== 0) fail('STAGING_DELTA_NOT_PASS');
  for (const field of ['rollback_rehearsal_passed', 'mobile_320_passed', 'governance_gate_passed', 'observability_passed', 'incident_response_ready']) {
    if (deltaEvidence[field] !== true) fail(`AUXILIARY_NOT_PASS:${field}`);
  }
  const observedAt = [...auxiliaryLoaded.values()].map((loaded) => loaded.value.observed_at).sort().at(-1);
  const delta = { id: 'KIDULTS_STAGING_PRODUCTION_DELTA_EVIDENCE_V1', version: VERSION, producer_id: 'KIDULTS_STAGING_PRODUCTION_DELTA_CERTIFIER_V1', source_sha: sourceSha, observed_at: observedAt, state: 'VERIFIED', evidence: deltaEvidence };
  const deltaLoaded = { raw: encodeJson(delta), value: delta };

  const supportFiles = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name.endsWith('.json')) supportFiles.push(absolute);
      else fail('SUPPORT_ENTRY_INVALID');
    }
  };
  walk(path.join(evidenceDir, 'support'));
  const supports = supportFiles.map((absolute) => {
    const preliminary = JSON.parse(readRegular(absolute, 'SUPPORT_INVALID'));
    const kind = preliminary.evidence_kind;
    const subject = preliminary.subject_id;
    if (!Object.hasOwn(SUPPORT_PRODUCERS, kind)) fail('SUPPORT_KIND_INVALID');
    const member = path.relative(evidenceDir, absolute).split(path.sep).join('/');
    return { member, loaded: loadEnvelope(absolute, { id: 'KIDULTS_PRODUCTION_SUPPORT_EVIDENCE_RECEIPT_V1', producer: SUPPORT_PRODUCERS[kind], sourceSha, kind, subject, code: `SUPPORT:${member}` }) };
  }).sort((left, right) => left.member.localeCompare(right.member));
  const byKey = new Map(supports.map((item) => [`${item.loaded.value.evidence_kind}:${item.loaded.value.subject_id}`, item]));
  const required = (key) => byKey.get(key) ?? fail(`SUPPORT_MISSING:${key}`);
  const receipt = (key) => sha256(required(key).loaded.raw);
  const naturalItems = supports.filter((item) => item.loaded.value.evidence_kind === 'NATURAL_RUN');
  const naturalRuns = naturalItems.map((item) => ({ ...item.loaded.value.evidence, receipt_sha256: sha256(item.loaded.raw) }));
  const ledger = required('OBSERVATION_LEDGER:observation_ledger').loaded.value.evidence;
  const beta = required('BETA_RELIABILITY:beta_reliability').loaded.value.evidence;
  const slo = required('SLO_ERROR_BUDGET:slo_error_budget').loaded.value.evidence;
  const pitr = required('PITR:pitr').loaded.value.evidence;
  const rollback = required('ROLLBACK:rollback').loaded.value.evidence;
  const policyPath = path.join(ROOT, 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json');
  const policyRaw = readRegular(policyPath, 'POLICY_INVALID');
  const policy = JSON.parse(policyRaw);
  const technical = {
    id: 'KIDULTS_PRODUCTION_READINESS_EVIDENCE_V1', version: VERSION, source_sha: sourceSha,
    policy_binding: { path: 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json', id: policy.id, version: policy.version, sha256: sha256(policyRaw) },
    auxiliary_evidence_bindings: [...AUXILIARY.map(([member]) => binding(member, auxiliaryLoaded.get(member))), binding('staging-production-delta.json', deltaLoaded)],
    support_evidence_bindings: supports.map((item) => supportBinding(item.member, item.loaded)),
    observation_window: { ...ledger.observation_window, ledger_receipt_sha256: receipt('OBSERVATION_LEDGER:observation_ledger') },
    cohort_binding: { cohort_sha256: beta.cohort_sha256, rights_census_sha256: beta.rights_census_sha256, schema_census_sha256: beta.schema_census_sha256, rights_census_state: beta.rights_census_state, schema_census_state: beta.schema_census_state },
    beta_reliability: { ...beta, receipt_sha256: receipt('BETA_RELIABILITY:beta_reliability') },
    natural_runs: naturalRuns,
    slo_error_budget: { ...slo, receipt_sha256: receipt('SLO_ERROR_BUDGET:slo_error_budget') },
    recovery: { ...pitr, pitr_receipt_sha256: receipt('PITR:pitr'), ...rollback, rollback_receipt_sha256: receipt('ROLLBACK:rollback') },
  };
  validateTechnicalEvidence(technical, { expectedSourceSha: sourceSha, policy, policySha256: sha256(policyRaw) });
  atomicWrite(evidenceDir, 'staging-production-delta.json', delta);
  atomicWrite(evidenceDir, 'production-readiness-evidence-v1.json', technical);
  process.stdout.write(`KIDULTS_EVIDENCE_COMPOSE_PASS\nsource_sha=${sourceSha}\n`);
};

try { main(); } catch (error) { process.stderr.write(`KIDULTS_EVIDENCE_COMPOSE_FAIL:${error.message}\n`); process.exitCode = 1; }
