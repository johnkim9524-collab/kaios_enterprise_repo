#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson, digestObject } from '../src/common-control/canonical-v1.mjs';
import {
  AUTONOMOUS_POSTGRES_MIGRATIONS_V1,
  verifyAutonomousPostgresEvidenceReceipt,
} from '../src/common-control/autonomous-postgres-evidence-receipt-v1.mjs';
import { evaluateAdmission } from '../src/common-control/admission-v1.mjs';
import { claimTask, createTask } from '../src/autonomous-control/task-lifecycle-v1.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '..', '..');
const SHA = /^[0-9a-f]{40}$/;
const SAFE_DATABASE = /^kidults_ephemeral_[a-z0-9_]{1,48}$/;
const CONFIRMATION = 'EPHEMERAL_NON_PRODUCTION_APPROVED';
const MIGRATIONS = AUTONOMOUS_POSTGRES_MIGRATIONS_V1;

function fail(code) { throw new Error(code); }
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function json(value) { return sql(JSON.stringify(value)); }

export function validateEphemeralTarget({ expectedSha, confirmation, databaseName, schemaPresent }) {
  if (!SHA.test(expectedSha ?? '')) fail('AUTONOMOUS_POSTGRES_EXPECTED_SHA_INVALID');
  if (confirmation !== CONFIRMATION) fail('AUTONOMOUS_POSTGRES_EPHEMERAL_CONFIRMATION_REQUIRED');
  if (!SAFE_DATABASE.test(databaseName ?? '')) fail('AUTONOMOUS_POSTGRES_DATABASE_NAME_DENIED');
  if (schemaPresent !== false) fail('AUTONOMOUS_POSTGRES_NONEMPTY_TARGET_DENIED');
  return { expectedSha, databaseName };
}

function sourceRequest(taskId) {
  return {
    requestId: `request:${taskId}`, taskId, sourceId: 'synthetic-source',
    sourceFamilyId: 'synthetic-family', providerId: null,
    purpose: 'INTERNAL_CONTROL_VALIDATION', scope: 'EPHEMERAL_POSTGRES_FIXTURE',
    dataClass: 'NON_PERSONAL_SYNTHETIC', region: 'GLOBAL',
    requestedMode: 'SYNTHETIC_SHADOW', synthetic: true,
    endpointFingerprint: digestObject({ endpoint: 'none' }),
  };
}

function controlState() {
  return {
    policyRevision: 1, policyDigest: digestObject({ policy: 'ephemeral-v1' }),
    registryRevision: 1, registryDigest: digestObject({ registry: 'ephemeral-v1' }),
    killEpoch: 1, globalKill: false, killedSourceFamilies: [], killedSources: [],
    externalEgress: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
}

function proof(taskId, now) {
  const source = sourceRequest(taskId);
  return { sourceRequest: source, ...evaluateAdmission({
    sourceRequest: source, controlState: controlState(), now, ttlSeconds: 300,
  }) };
}

function proofInsert(proofValue) {
  const proofDigest = digestObject(proofValue);
  const proofId = `admission-proof:${proofDigest.slice(7)}`;
  return `INSERT INTO kidults_control.autonomous_admission_proofs
    (proof_id, task_id, request_digest, decision_id, decision_digest, manifest_id,
     manifest_digest, issued_at, expires_at, proof_json, proof_digest, writer_id)
    VALUES (${sql(proofId)}, ${sql(proofValue.sourceRequest.taskId)}, ${sql(digestObject(proofValue.sourceRequest))},
      ${sql(proofValue.decision.decisionId)}, ${sql(proofValue.decision.decisionDigest)},
      ${sql(proofValue.manifest.manifestId)}, ${sql(proofValue.manifest.manifestDigest)},
      ${sql(proofValue.manifest.issuedAt)}, ${sql(proofValue.manifest.expiresAt)},
      ${json(proofValue)}::jsonb, ${sql(proofDigest)}, 'kpmo-autonomous-admission-proof-writer-v1')`;
}

function snapshotValues(task) {
  return [task.taskId, task.revision, task.state, task.attempt, task.leaseOwner,
    task.leaseEpoch, JSON.stringify(task), digestObject(task), 'kpmo-autonomous-task-writer-v1'];
}

function snapshotTuple(task) {
  return snapshotValues(task).map((value, index) => value === null ? 'NULL'
    : [1, 3, 5].includes(index) ? String(value)
      : index === 6 ? `${json(task)}::jsonb` : sql(value)).join(', ');
}

function transitionTuple(receipt) {
  const values = [receipt.receiptId, receipt.taskId, receipt.fromRevision, receipt.toRevision,
    receipt.transition, receipt.fromState, receipt.toState, receipt.beforeDigest,
    receipt.afterDigest, receipt.workerId, receipt.leaseEpoch, receipt.reason,
    receipt.observedAt, JSON.stringify(receipt), receipt.receiptDigest,
    'kpmo-autonomous-task-writer-v1'];
  return values.map((value, index) => value === null ? 'NULL'
    : [2, 3, 10].includes(index) ? String(value)
      : index === 13 ? `${sql(value)}::jsonb` : sql(value)).join(', ');
}

export function buildEphemeralFixture(expectedSha) {
  if (!SHA.test(expectedSha ?? '')) fail('AUTONOMOUS_POSTGRES_EXPECTED_SHA_INVALID');
  const issuedAt = new Date('2026-09-19T08:00:00.000Z');
  const taskId = `task:ephemeral:${expectedSha.slice(0, 12)}`;
  const admissionProof = proof(taskId, issuedAt);
  const initial = createTask({ taskId, workflowType: 'synthetic-shadow', maxAttempts: 3,
    admissionRequestDigest: digestObject(admissionProof.sourceRequest), now: issuedAt });
  const first = claimTask(initial, { workerId: 'synthetic-worker:postgres-a', leaseSeconds: 120,
    now: new Date('2026-09-19T08:00:01.000Z') });
  const second = claimTask(initial, { workerId: 'synthetic-worker:postgres-b', leaseSeconds: 120,
    now: new Date('2026-09-19T08:00:01.000Z') });
  const rollbackProof = proof(`${taskId}:rollback`, new Date('2026-09-19T08:00:02.000Z'));
  return { taskId, admissionProof, rollbackProof, initial, claims: [first, second] };
}

function psqlArgs(extras = []) {
  return ['--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
    ...extras];
}

export function psqlEnvironment(dsn) {
  let parsed;
  try { parsed = new URL(dsn); } catch { fail('AUTONOMOUS_POSTGRES_DSN_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname
    || !parsed.pathname || parsed.pathname === '/') fail('AUTONOMOUS_POSTGRES_DSN_INVALID');
  const sslmode = parsed.searchParams.get('sslmode');
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC',
    PGHOST: parsed.hostname, ...(parsed.port ? { PGPORT: parsed.port } : {}),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    ...(parsed.username ? { PGUSER: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { PGPASSWORD: decodeURIComponent(parsed.password) } : {}),
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
    PGAPPNAME: 'kidults-autonomous-postgres-evidence-v1',
  };
}

function runPsql(dsn, statement, code = 'AUTONOMOUS_POSTGRES_SQL_FAILED') {
  const result = spawnSync('psql', psqlArgs(), { input: statement, encoding: 'utf8',
    env: psqlEnvironment(dsn), timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.signal || result.status !== 0) fail(code);
  return result.stdout.trim();
}

function expectDenied(dsn, statement, expected) {
  const result = spawnSync('psql', psqlArgs(), { input: statement, encoding: 'utf8',
    env: psqlEnvironment(dsn), timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.status === 0 || !String(result.stderr).includes(expected)) {
    fail('AUTONOMOUS_POSTGRES_NEGATIVE_MUTATION_ACCEPTED');
  }
}

function concurrentPsql(dsn, statement) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', psqlArgs(), { stdio: ['pipe', 'pipe', 'pipe'],
      env: psqlEnvironment(dsn) });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', () => reject(new Error('AUTONOMOUS_POSTGRES_CONCURRENCY_PROCESS_FAILED')));
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim().split('\n').at(-1));
      else reject(new Error(`AUTONOMOUS_POSTGRES_CONCURRENCY_SQL_FAILED:${sha256(stderr)}`));
    });
    child.stdin.end(statement);
  });
}

function signaledConcurrentPsql(dsn, statement, signal) {
  let signalResolve; let signalReject; let settled = false;
  const signaled = new Promise((resolve, reject) => {
    signalResolve = resolve; signalReject = reject;
  });
  const completed = new Promise((resolve, reject) => {
    const child = spawn('psql', psqlArgs(), { stdio: ['pipe', 'pipe', 'pipe'],
      env: psqlEnvironment(dsn) });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (!settled && stdout.split('\n').some(line => line.trim() === signal)) {
        settled = true; signalResolve();
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', () => {
      const error = new Error('AUTONOMOUS_POSTGRES_CONCURRENCY_PROCESS_FAILED');
      if (!settled) { settled = true; signalReject(error); }
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim().split('\n').at(-1));
      else {
        const error = new Error(`AUTONOMOUS_POSTGRES_CONCURRENCY_SQL_FAILED:${sha256(stderr)}`);
        if (!settled) { settled = true; signalReject(error); }
        reject(error);
      }
      if (!settled) {
        settled = true;
        signalReject(new Error('AUTONOMOUS_POSTGRES_CONCURRENCY_SIGNAL_MISSING'));
      }
    });
    child.stdin.end(statement);
  });
  return { signaled, completed };
}

function trustHead({ revision, previousHeadDigest, lifecycleStateDigest,
  activeRegistryId, activeRegistryDigest, observedAt }) {
  const base = {
    contractId: 'kidults-approval-trust-current-head-v1', version: '1.0.0',
    state: 'CURRENT_LIFECYCLE_HEAD_RECORDED', revision, previousHeadDigest,
    candidateSetDigest: digestObject({ candidates: revision }),
    eventSetDigest: digestObject({ events: revision }), lifecycleStateDigest,
    activeRegistryId, activeRegistryDigest, observedAt,
    activationAuthorized: false, providerContactExecuted: false, spendAuthorized: false,
    externalEgress: false, credentialResolution: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const headId = `trust-current-head:${digestObject(base).slice(7)}`;
  const identified = { ...base, headId };
  return { ...identified, headDigest: digestObject(identified) };
}

function approvalConsumptionFixture(registryDigest, scenario) {
  const digest = label => digestObject({ raceFixture: scenario, label });
  const unsigned = {
    contractId: 'kidults-cryptographic-approval-consumption-receipt-v1', version: '1.0.0',
    state: 'VERIFIED_AND_CONSUMED_AUTHORITY_NOT_ACTIVATED',
    envelopeId: `approval-envelope:${digest('envelope-id').slice(7)}`,
    envelopeDigest: digest('envelope'), nonceDigest: digest('nonce'),
    matrixContractDigest: digest('matrix'), trustRegistryDigest: registryDigest,
    requestedCapabilitiesDigest: digest('capabilities'), authorityClass: 'LOCAL_SYNTHETIC_SHADOW',
    subjectType: 'SUPERVISOR_INVOCATION', subjectId: `postgres-race-${scenario}`,
    subjectDigest: digest('subject'), approvalVerificationReceiptDigest: digest('verification'),
    consumedAt: '2026-09-19T08:10:02.000Z', activationAuthorized: false,
    providerContactExecuted: false, spendAuthorized: false, externalEgress: false,
    credentialResolution: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const consumptionId = `approval-consumption:${digestObject(unsigned).slice(7)}`;
  const identified = { ...unsigned, consumptionId };
  return { ...identified, receiptDigest: digestObject(identified) };
}

export function buildTrustRevocationRaceFixture({ scenario = 'revocation-first',
  startRevision = 1, previousHeadDigest = null } = {}) {
  const registryId = `postgres-race-registry-${scenario}`;
  const registryDigest = digestObject({ registryId });
  const activeLifecycleDigest = digestObject({ scenario, lifecycle: 'active' });
  const revokedLifecycleDigest = digestObject({ scenario, lifecycle: 'revoked' });
  const activeHead = trustHead({ revision: startRevision, previousHeadDigest,
    lifecycleStateDigest: activeLifecycleDigest, activeRegistryId: registryId,
    activeRegistryDigest: registryDigest, observedAt: '2026-09-19T08:10:00.000Z' });
  const revokedHead = trustHead({ revision: startRevision + 1, previousHeadDigest: activeHead.headDigest,
    lifecycleStateDigest: revokedLifecycleDigest, activeRegistryId: null,
    activeRegistryDigest: null, observedAt: '2026-09-19T08:10:01.000Z' });
  return { registryId, registryDigest, activeLifecycleDigest, revokedLifecycleDigest,
    activeHead, revokedHead, consumption: approvalConsumptionFixture(registryDigest, scenario) };
}

export function buildContainmentFenceFixture() {
  const common = { contractId: 'kidults-autonomous-containment-fence-v1', version: '1.0.0',
    automaticActionTaken: false, mutationAllowed: false,
    production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' };
  const stopUnsigned = { ...common, state: 'APPROVED_CONTAINMENT_FENCE_ACTIVE', action: 'STOP',
    sourceEvidenceDigest: digestObject({ canary: 'containment-stop-evidence' }),
    actionPackageDigest: digestObject({ canary: 'containment-stop-package' }),
    approvalReceiptDigest: digestObject({ canary: 'containment-stop-approval' }),
    previousFenceDigest: null, allowInvocation: false };
  const stop = { ...stopUnsigned, fenceDigest: digestObject(stopUnsigned) };
  const releaseUnsigned = { ...common, state: 'APPROVED_CONTAINMENT_RELEASED', action: 'RELEASE',
    sourceEvidenceDigest: stop.fenceDigest,
    actionPackageDigest: digestObject({ canary: 'containment-release-package' }),
    approvalReceiptDigest: digestObject({ canary: 'containment-release-approval' }),
    previousFenceDigest: stop.fenceDigest, allowInvocation: true };
  return { stop, release: { ...releaseUnsigned, fenceDigest: digestObject(releaseUnsigned) } };
}

export function buildProtectedLaunchManifestConsumptionFixture(expectedSha) {
  if (!SHA.test(expectedSha ?? '')) fail('AUTONOMOUS_POSTGRES_EXPECTED_SHA_INVALID');
  const unsigned = {
    contractId: 'kidults-protected-autonomous-launch-manifest-v1', version: '1.0.0',
    sourceSha: expectedSha, request: { requestId: `postgres-manifest:${expectedSha.slice(0, 12)}` },
    automaticTrigger: 'NOT_REGISTERED_HOLD', production: 'HOLD',
    publicRelease: 'HOLD', g5: 'HOLD',
  };
  return { ...unsigned, manifestDigest: digestObject(unsigned) };
}

function manifestConsumptionInsert(manifest) {
  return `INSERT INTO kidults_control.protected_launch_manifest_consumptions
    (manifest_digest,source_sha,request_id,consumed_at,manifest_json,writer_id)
    VALUES (${sql(manifest.manifestDigest)},${sql(manifest.sourceSha)},
      ${sql(manifest.request.requestId)},'2026-09-19T08:20:00.000Z',${json(manifest)}::jsonb,
      'kpmo-autonomous-invocation-writer-v1')`;
}

function containmentFenceInsert(fence) {
  return `INSERT INTO kidults_control.autonomous_containment_fence_events
    (fence_digest,action,source_evidence_digest,action_package_digest,
     approval_receipt_digest,previous_fence_digest,fence_json,writer_id)
    VALUES (${sql(fence.fenceDigest)},${sql(fence.action)},${sql(fence.sourceEvidenceDigest)},
      ${sql(fence.actionPackageDigest)},${sql(fence.approvalReceiptDigest)},
      ${fence.previousFenceDigest === null ? 'NULL' : sql(fence.previousFenceDigest)},
      ${json(fence)}::jsonb,'kpmo-approval-consumption-writer-v1')`;
}

function headInsert(head) {
  return `INSERT INTO kidults_control.approval_trust_current_heads
    (revision, head_id, head_digest, previous_head_digest, lifecycle_state_digest,
     active_registry_id, active_registry_digest, head_json, writer_id, observed_at)
    VALUES (${head.revision},${sql(head.headId)},${sql(head.headDigest)},
      ${head.previousHeadDigest === null ? 'NULL' : sql(head.previousHeadDigest)},
      ${sql(head.lifecycleStateDigest)},${head.activeRegistryId === null ? 'NULL' : sql(head.activeRegistryId)},
      ${head.activeRegistryDigest === null ? 'NULL' : sql(head.activeRegistryDigest)},
      ${json(head)}::jsonb,'kpmo-trust-current-head-writer-v1',${sql(head.observedAt)})`;
}

function revocationPublisherSql(fixture) {
  return `BEGIN;
SET LOCAL ROLE kidults_control_trust_current_head;
SELECT set_config('kidults.writer_id','kpmo-trust-current-head-writer-v1',true);
SELECT pg_advisory_xact_lock(hashtextextended('kidults.approval-trust-current-head.v1',0));
SELECT 'TRUST_PUBLISHER_LOCK_HELD';
SELECT pg_sleep(0.25);
${headInsert(fixture.revokedHead)};
COMMIT;
SELECT 'TRUST_REVOCATION_COMMITTED';`;
}

function approvalConsumerSql(fixture, { signal = null, delaySeconds = 0 } = {}) {
  const receipt = fixture.consumption;
  return `BEGIN;
SET LOCAL ROLE kidults_control_approval_consumer;
SELECT set_config('kidults.writer_id','kpmo-approval-consumption-writer-v1',true);
SELECT pg_advisory_xact_lock(hashtextextended('kidults.approval-trust-current-head.v1',0));
${signal === null ? '' : `SELECT ${sql(signal)};`}
${delaySeconds === 0 ? '' : `SELECT pg_sleep(${delaySeconds});`}
WITH current_head AS (
  SELECT * FROM kidults_control.approval_trust_current_heads ORDER BY revision DESC LIMIT 1
), consumed AS (
  INSERT INTO kidults_control.cryptographic_approval_consumptions
    (envelope_id,envelope_digest,nonce_digest,matrix_contract_digest,trust_registry_digest,
     requested_capabilities_digest,authority_class,subject_type,subject_id,subject_digest,
     approval_verification_receipt_digest,consumption_id,consumed_at,consumption_json,
     receipt_digest,writer_id)
  SELECT ${sql(receipt.envelopeId)},${sql(receipt.envelopeDigest)},${sql(receipt.nonceDigest)},
    ${sql(receipt.matrixContractDigest)},${sql(receipt.trustRegistryDigest)},
    ${sql(receipt.requestedCapabilitiesDigest)},${sql(receipt.authorityClass)},
    ${sql(receipt.subjectType)},${sql(receipt.subjectId)},${sql(receipt.subjectDigest)},
    ${sql(receipt.approvalVerificationReceiptDigest)},${sql(receipt.consumptionId)},
    ${sql(receipt.consumedAt)},${json(receipt)}::jsonb,${sql(receipt.receiptDigest)},
    'kpmo-approval-consumption-writer-v1'
  FROM current_head WHERE lifecycle_state_digest=${sql(fixture.activeLifecycleDigest)}
    AND active_registry_id=${sql(fixture.registryId)}
    AND active_registry_digest=${sql(fixture.registryDigest)} RETURNING 1
)
SELECT count(*) FROM consumed;
COMMIT;`;
}

function claimSql(result) {
  return `BEGIN;
SET LOCAL ROLE kidults_control_autonomous_task;
SELECT set_config('kidults.writer_id', 'kpmo-autonomous-task-writer-v1', true);
WITH inserted_snapshot AS (
  INSERT INTO kidults_control.autonomous_task_snapshots
    (task_id, revision, state, attempt, lease_owner, lease_epoch, task_json, task_digest, writer_id)
  VALUES (${snapshotTuple(result.task)})
  ON CONFLICT (task_id, revision) DO NOTHING RETURNING 1
), inserted_transition AS (
  INSERT INTO kidults_control.autonomous_task_transitions
    (receipt_id, task_id, from_revision, to_revision, transition, from_state, to_state,
     before_digest, after_digest, worker_id, lease_epoch, reason, observed_at,
     receipt_json, receipt_digest, writer_id)
  SELECT ${transitionTuple(result.receipt)} FROM inserted_snapshot RETURNING 1
)
SELECT count(*) FROM inserted_transition;
COMMIT;`;
}

function safeOutputDirectory(directory) {
  if (!path.isAbsolute(directory ?? '')) fail('AUTONOMOUS_POSTGRES_OUTPUT_ABSOLUTE_REQUIRED');
  const resolved = path.resolve(directory);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    fail('AUTONOMOUS_POSTGRES_OUTPUT_INSIDE_REPOSITORY_DENIED');
  }
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(resolved) !== resolved
    || readdirSync(resolved).length !== 0) fail('AUTONOMOUS_POSTGRES_OUTPUT_DIRECTORY_INVALID');
  if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o700) {
    fail('AUTONOMOUS_POSTGRES_OUTPUT_DIRECTORY_NOT_PRIVATE');
  }
  if (process.platform !== 'win32' && typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    fail('AUTONOMOUS_POSTGRES_OUTPUT_DIRECTORY_OWNER_INVALID');
  }
  return resolved;
}

function exactHead(expectedSha) {
  const git = args => execFileSync('/usr/bin/git', ['--no-replace-objects', '-c',
    'core.fsmonitor=false', ...args], { cwd: repositoryRoot, encoding: 'utf8', timeout: 10000,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } }).trim();
  if (git(['rev-parse', 'HEAD']) !== expectedSha) fail('AUTONOMOUS_POSTGRES_CHECKOUT_MISMATCH');
  if (git(['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('AUTONOMOUS_POSTGRES_DIRTY_SOURCE');
  const origin = git(['remote', 'get-url', 'origin']);
  if (!['https://github.com/johnkim9524-collab/kaios_enterprise_repo.git',
    'https://github.com/johnkim9524-collab/kaios_enterprise_repo'].includes(origin)) {
    fail('AUTONOMOUS_POSTGRES_ORIGIN_INVALID');
  }
}

export async function runEphemeralPostgresEvidence({ dsn, expectedSha, confirmation, outputDirectory }) {
  if (typeof dsn !== 'string' || dsn.length < 1) fail('AUTONOMOUS_POSTGRES_DSN_REQUIRED');
  exactHead(expectedSha);
  const output = safeOutputDirectory(outputDirectory);
  const version = spawnSync('psql', ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (version.error || version.status !== 0) fail('AUTONOMOUS_POSTGRES_PSQL_REQUIRED');
  const preflight = runPsql(dsn, `SELECT current_database() || E'\\t' ||
    current_setting('server_version_num') || E'\\t' ||
    (to_regnamespace('kidults_control') IS NOT NULL)::text;`, 'AUTONOMOUS_POSTGRES_PREFLIGHT_FAILED').split('\t');
  validateEphemeralTarget({ expectedSha, confirmation, databaseName: preflight[0],
    schemaPresent: preflight[2] === 'true' });

  const migrationBytes = [];
  for (const migration of MIGRATIONS) {
    const file = path.join(serviceRoot, 'migrations/postgres', migration);
    const bytes = readFileSync(file); migrationBytes.push(bytes);
    const applied = spawnSync('psql', psqlArgs(['--file', file]), { encoding: 'utf8',
      env: psqlEnvironment(dsn), timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    if (applied.error || applied.signal || applied.status !== 0) fail('AUTONOMOUS_POSTGRES_MIGRATION_FAILED');
  }

  const fixture = buildEphemeralFixture(expectedSha);
  const roleCheck = runPsql(dsn, `SELECT (
    NOT (SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
      FROM pg_roles WHERE rolname='kidults_control_autonomous_admission')
    AND NOT (SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
      FROM pg_roles WHERE rolname='kidults_control_autonomous_task')
    AND NOT (SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
      FROM pg_roles WHERE rolname='kidults_control_autonomous_invocation')
    AND NOT (SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
      FROM pg_roles WHERE rolname='kidults_control_approval_consumer')
    AND NOT (SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
      FROM pg_roles WHERE rolname='kidults_control_trust_root_lifecycle')
    AND NOT (SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
      FROM pg_roles WHERE rolname='kidults_control_trust_registry_snapshot')
    AND NOT (SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls
      FROM pg_roles WHERE rolname='kidults_control_trust_current_head')
    AND has_table_privilege('kidults_control_autonomous_admission','kidults_control.autonomous_admission_proofs','SELECT')
    AND has_table_privilege('kidults_control_autonomous_admission','kidults_control.autonomous_admission_proofs','INSERT')
    AND NOT has_table_privilege('kidults_control_autonomous_admission','kidults_control.autonomous_admission_proofs','UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_autonomous_task','kidults_control.autonomous_admission_proofs','SELECT')
    AND NOT has_table_privilege('kidults_control_autonomous_task','kidults_control.autonomous_admission_proofs','INSERT,UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_autonomous_invocation','kidults_control.autonomous_supervisor_invocation_requests','SELECT,INSERT')
    AND has_table_privilege('kidults_control_autonomous_invocation','kidults_control.autonomous_supervisor_invocation_decisions','SELECT,INSERT')
    AND has_table_privilege('kidults_control_autonomous_invocation','kidults_control.autonomous_supervisor_invocation_consumptions','SELECT,INSERT')
    AND NOT has_table_privilege('kidults_control_autonomous_invocation','kidults_control.autonomous_supervisor_invocation_requests','UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('kidults_control_autonomous_invocation','kidults_control.autonomous_supervisor_invocation_decisions','UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('kidults_control_autonomous_invocation','kidults_control.autonomous_supervisor_invocation_consumptions','UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_autonomous_invocation','kidults_control.protected_launch_manifest_consumptions','SELECT,INSERT')
    AND NOT has_table_privilege('kidults_control_autonomous_invocation','kidults_control.protected_launch_manifest_consumptions','UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_approval_consumer','kidults_control.cryptographic_approval_consumptions','SELECT,INSERT')
    AND NOT has_table_privilege('kidults_control_approval_consumer','kidults_control.cryptographic_approval_consumptions','UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_trust_root_lifecycle','kidults_control.approval_trust_root_candidates','SELECT,INSERT')
    AND has_table_privilege('kidults_control_trust_root_lifecycle','kidults_control.approval_trust_root_lifecycle_events','SELECT,INSERT')
    AND NOT has_table_privilege('kidults_control_trust_root_lifecycle','kidults_control.approval_trust_root_candidates','UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('kidults_control_trust_root_lifecycle','kidults_control.approval_trust_root_lifecycle_events','UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_trust_registry_snapshot','kidults_control.approval_trust_registry_snapshots','SELECT,INSERT')
    AND NOT has_table_privilege('kidults_control_trust_registry_snapshot','kidults_control.approval_trust_registry_snapshots','UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_approval_consumer','kidults_control.approval_trust_registry_snapshots','SELECT')
    AND NOT has_table_privilege('kidults_control_approval_consumer','kidults_control.approval_trust_registry_snapshots','INSERT,UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_trust_current_head','kidults_control.approval_trust_current_heads','SELECT,INSERT')
    AND NOT has_table_privilege('kidults_control_trust_current_head','kidults_control.approval_trust_current_heads','UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_approval_consumer','kidults_control.approval_trust_current_heads','SELECT')
    AND NOT has_table_privilege('kidults_control_approval_consumer','kidults_control.approval_trust_current_heads','INSERT,UPDATE,DELETE,TRUNCATE')
    AND has_table_privilege('kidults_control_approval_consumer','kidults_control.autonomous_containment_fence_events','SELECT,INSERT')
    AND NOT has_table_privilege('kidults_control_approval_consumer','kidults_control.autonomous_containment_fence_events','UPDATE,DELETE,TRUNCATE')
    AND has_sequence_privilege('kidults_control_approval_consumer','kidults_control.autonomous_containment_fence_events_event_sequence_seq','USAGE,SELECT')
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='autonomous_task_snapshot_transition_pair'
      AND tgdeferrable AND tginitdeferred)
  )::text;`);
  if (roleCheck !== 'true') fail('AUTONOMOUS_POSTGRES_ROLE_OR_TRIGGER_READBACK_FAILED');

  const proofStatement = proofInsert(fixture.admissionProof);
  runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_autonomous_admission;
    SELECT set_config('kidults.writer_id','kpmo-autonomous-admission-proof-writer-v1',true);
    ${proofStatement}; COMMIT;`);
  const replay = runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_autonomous_admission;
    SELECT set_config('kidults.writer_id','kpmo-autonomous-admission-proof-writer-v1',true);
    WITH replay AS (${proofStatement} ON CONFLICT (proof_id) DO NOTHING RETURNING 1)
    SELECT count(*) FROM replay; COMMIT;`).split('\n').at(-1);
  if (replay !== '0') fail('AUTONOMOUS_POSTGRES_PROOF_REPLAY_NOT_IDEMPOTENT');

  expectDenied(dsn, `BEGIN; SET LOCAL ROLE kidults_control_autonomous_task; ${proofStatement}; COMMIT;`,
    'permission denied for table autonomous_admission_proofs');
  expectDenied(dsn, `UPDATE kidults_control.autonomous_admission_proofs SET task_id=task_id;`,
    'KIDULTS_APPEND_ONLY_MUTATION_DENIED');
  expectDenied(dsn, `BEGIN; SET LOCAL ROLE kidults_control_autonomous_task;
    SELECT set_config('kidults.writer_id','kpmo-autonomous-task-writer-v1',true);
    ${snapshotInsert(fixture.claims[0].task)}; COMMIT;`,
    'KIDULTS_AUTONOMOUS_TASK_TRANSITION_PAIR_REQUIRED');

  const rollbackStatement = proofInsert(fixture.rollbackProof);
  runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_autonomous_admission;
    SELECT set_config('kidults.writer_id','kpmo-autonomous-admission-proof-writer-v1',true);
    ${rollbackStatement}; ROLLBACK;`);
  const rollbackCount = runPsql(dsn, `SELECT count(*) FROM kidults_control.autonomous_admission_proofs
    WHERE task_id=${sql(fixture.rollbackProof.sourceRequest.taskId)};`);
  if (rollbackCount !== '0') fail('AUTONOMOUS_POSTGRES_ROLLBACK_FAILED');

  runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_autonomous_task;
    SELECT set_config('kidults.writer_id','kpmo-autonomous-task-writer-v1',true);
    ${snapshotInsert(fixture.initial)}; COMMIT;`);
  const results = await Promise.all(fixture.claims.map(result => concurrentPsql(dsn, claimSql(result))));
  if (results.sort().join(',') !== '0,1') fail('AUTONOMOUS_POSTGRES_TWO_CLIENT_CAS_FAILED');
  const pairCount = runPsql(dsn, `SELECT
    (SELECT count(*) FROM kidults_control.autonomous_task_snapshots WHERE task_id=${sql(fixture.taskId)})
    || '|' ||
    (SELECT count(*) FROM kidults_control.autonomous_task_transitions WHERE task_id=${sql(fixture.taskId)});`);
  if (pairCount !== '2|1') fail('AUTONOMOUS_POSTGRES_SNAPSHOT_TRANSITION_PAIR_COUNT_INVALID');

  const trustRace = buildTrustRevocationRaceFixture();
  runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_trust_current_head;
    SELECT set_config('kidults.writer_id','kpmo-trust-current-head-writer-v1',true);
    ${headInsert(trustRace.activeHead)}; COMMIT;`);
  const publisher = signaledConcurrentPsql(dsn, revocationPublisherSql(trustRace),
    'TRUST_PUBLISHER_LOCK_HELD');
  await publisher.signaled;
  const consumerResult = concurrentPsql(dsn, approvalConsumerSql(trustRace));
  const [publisherResult, consumedRows] = await Promise.all([publisher.completed, consumerResult]);
  if (publisherResult !== 'TRUST_REVOCATION_COMMITTED' || consumedRows !== '0') {
    fail('AUTONOMOUS_POSTGRES_TRUST_REVOCATION_RACE_FAILED');
  }
  const trustRaceCounts = runPsql(dsn, `SELECT
    (SELECT count(*) FROM kidults_control.approval_trust_current_heads) || '|' ||
    (SELECT count(*) FROM kidults_control.cryptographic_approval_consumptions);`);
  if (trustRaceCounts !== '2|0') fail('AUTONOMOUS_POSTGRES_TRUST_REVOCATION_COUNTS_INVALID');

  const consumptionFirstRace = buildTrustRevocationRaceFixture({
    scenario: 'consumption-first', startRevision: 3,
    previousHeadDigest: trustRace.revokedHead.headDigest,
  });
  runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_trust_current_head;
    SELECT set_config('kidults.writer_id','kpmo-trust-current-head-writer-v1',true);
    ${headInsert(consumptionFirstRace.activeHead)}; COMMIT;`);
  const consumer = signaledConcurrentPsql(dsn, approvalConsumerSql(consumptionFirstRace, {
    signal: 'TRUST_CONSUMER_LOCK_HELD', delaySeconds: 0.25,
  }), 'TRUST_CONSUMER_LOCK_HELD');
  await consumer.signaled;
  const waitingPublisher = concurrentPsql(dsn, revocationPublisherSql(consumptionFirstRace));
  const [consumptionResult, waitingPublisherResult] = await Promise.all([
    consumer.completed, waitingPublisher,
  ]);
  if (consumptionResult !== '1' || waitingPublisherResult !== 'TRUST_REVOCATION_COMMITTED') {
    fail('AUTONOMOUS_POSTGRES_TRUST_CONSUMPTION_FIRST_RACE_FAILED');
  }
  const bidirectionalRaceCounts = runPsql(dsn, `SELECT
    (SELECT count(*) FROM kidults_control.approval_trust_current_heads) || '|' ||
    (SELECT count(*) FROM kidults_control.cryptographic_approval_consumptions);`);
  if (bidirectionalRaceCounts !== '4|1') {
    fail('AUTONOMOUS_POSTGRES_TRUST_BIDIRECTIONAL_RACE_COUNTS_INVALID');
  }

  const containment = buildContainmentFenceFixture();
  runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_approval_consumer;
    SELECT set_config('kidults.writer_id','kpmo-approval-consumption-writer-v1',true);
    SELECT pg_advisory_xact_lock(hashtext('kidults.autonomous-containment-fence.v1'));
    ${containmentFenceInsert(containment.stop)}; COMMIT;`);
  const stopState = runPsql(dsn, `SELECT (fence_json->>'allowInvocation') || '|' ||
    (fence_json->>'state') FROM kidults_control.autonomous_containment_fence_events
    ORDER BY event_sequence DESC LIMIT 1;`);
  if (stopState !== 'false|APPROVED_CONTAINMENT_FENCE_ACTIVE') {
    fail('AUTONOMOUS_POSTGRES_CONTAINMENT_STOP_NOT_ENFORCED');
  }
  expectDenied(dsn, `UPDATE kidults_control.autonomous_containment_fence_events
    SET action=action WHERE fence_digest=${sql(containment.stop.fenceDigest)};`,
  'KIDULTS_APPEND_ONLY_MUTATION_DENIED');
  const forgedReleaseUnsigned = { ...containment.release,
    sourceEvidenceDigest: digestObject({ canary: 'substituted-stop-fence' }) };
  delete forgedReleaseUnsigned.fenceDigest;
  const forgedRelease = { ...forgedReleaseUnsigned,
    fenceDigest: digestObject(forgedReleaseUnsigned) };
  expectDenied(dsn, `BEGIN; SET LOCAL ROLE kidults_control_approval_consumer;
    SELECT set_config('kidults.writer_id','kpmo-approval-consumption-writer-v1',true);
    ${containmentFenceInsert(forgedRelease)}; COMMIT;`, 'violates check constraint');
  runPsql(dsn, `BEGIN; SET LOCAL ROLE kidults_control_approval_consumer;
    SELECT set_config('kidults.writer_id','kpmo-approval-consumption-writer-v1',true);
    SELECT pg_advisory_xact_lock(hashtext('kidults.autonomous-containment-fence.v1'));
    ${containmentFenceInsert(containment.release)}; COMMIT;`);
  const releaseState = runPsql(dsn, `SELECT (fence_json->>'allowInvocation') || '|' ||
    (fence_json->>'state') || '|' || (previous_fence_digest=${sql(containment.stop.fenceDigest)})::text
    FROM kidults_control.autonomous_containment_fence_events
    ORDER BY event_sequence DESC LIMIT 1;`);
  if (releaseState !== 'true|APPROVED_CONTAINMENT_RELEASED|true') {
    fail('AUTONOMOUS_POSTGRES_CONTAINMENT_RELEASE_NOT_ENFORCED');
  }
  const containmentOrder = runPsql(dsn, `SELECT
    ((SELECT event_sequence FROM kidults_control.autonomous_containment_fence_events
      WHERE fence_digest=${sql(containment.stop.fenceDigest)}) <
     (SELECT event_sequence FROM kidults_control.autonomous_containment_fence_events
      WHERE fence_digest=${sql(containment.release.fenceDigest)}))::text || '|' || count(*)
    FROM kidults_control.autonomous_containment_fence_events;`);
  if (containmentOrder !== 'true|2') {
    fail('AUTONOMOUS_POSTGRES_CONTAINMENT_EVENT_ORDER_INVALID');
  }

  const launchManifest = buildProtectedLaunchManifestConsumptionFixture(expectedSha);
  const consumeSql = `BEGIN; SET LOCAL ROLE kidults_control_autonomous_invocation;
    SELECT set_config('kidults.writer_id','kpmo-autonomous-invocation-writer-v1',true);
    WITH consumed AS (${manifestConsumptionInsert(launchManifest)}
      ON CONFLICT (manifest_digest) DO NOTHING RETURNING 1)
    SELECT count(*) FROM consumed; COMMIT;`;
  const manifestRace = await Promise.all([
    concurrentPsql(dsn, consumeSql), concurrentPsql(dsn, consumeSql),
  ]);
  if (manifestRace.sort().join(',') !== '0,1') {
    fail('AUTONOMOUS_POSTGRES_MANIFEST_TWO_CLIENT_RACE_FAILED');
  }
  const manifestReplay = runPsql(dsn, consumeSql).split('\n').at(-1);
  if (manifestReplay !== '0') fail('AUTONOMOUS_POSTGRES_MANIFEST_RESTART_REPLAY_FAILED');
  const manifestCount = runPsql(dsn, `SELECT count(*) FROM
    kidults_control.protected_launch_manifest_consumptions
    WHERE manifest_digest=${sql(launchManifest.manifestDigest)};`);
  if (manifestCount !== '1') fail('AUTONOMOUS_POSTGRES_MANIFEST_COUNT_INVALID');
  expectDenied(dsn, `UPDATE kidults_control.protected_launch_manifest_consumptions
    SET request_id=request_id WHERE manifest_digest=${sql(launchManifest.manifestDigest)};`,
  'KIDULTS_APPEND_ONLY_MUTATION_DENIED');
  expectDenied(dsn, 'TRUNCATE kidults_control.protected_launch_manifest_consumptions;',
    'KIDULTS_APPEND_ONLY_MUTATION_DENIED');

  const unsigned = {
    id: 'kidults-autonomous-postgres-evidence-v1', version: '1.2.0', state: 'VERIFIED_PASS',
    exactSourceSha: expectedSha, databaseName: preflight[0], serverVersionNum: preflight[1],
    migrationDigest: sha256(Buffer.concat(migrationBytes)), migrations: [...MIGRATIONS],
    checks: {
      freshEphemeralDatabase: true, roleIsolation: true, appendOnlyMutationDenied: true,
      proofExactReplay: true, rollback: true, deferredTransitionPair: true,
      invocationAdmissionLeastPrivilege: true,
      twoClientCas: true, snapshots: 2, transitions: 1,
      trustRevocationWinsTwoClientRace: true,
      trustConsumptionWinsTwoClientRace: true, trustCurrentHeads: 4,
      cryptographicApprovalConsumptions: 1,
      containmentStopFenceBlocks: true, containmentReleaseFenceAllows: true,
      containmentReleaseChainEnforced: true, containmentAppendOnlyMutationDenied: true,
      containmentMonotonicEventOrder: true,
      containmentFenceEvents: 2,
      protectedManifestLeastPrivilege: true, protectedManifestTwoClientSingleWinner: true,
      protectedManifestRestartReplayHeld: true, protectedManifestAppendOnlyMutationDenied: true,
      protectedManifestConsumptions: 1,
    },
    scope: 'EPHEMERAL_POSTGRES_SCHEMA_PRIVILEGE_CAS_TRUST_CONTAINMENT_AND_MANIFEST_REPLAY',
    runtimeRunnerDatabaseExecution: false, providerAuthority: false,
    externalEgress: false, credentialMaterialRetained: false,
    observedAt: new Date().toISOString(), production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD',
  };
  const receipt = verifyAutonomousPostgresEvidenceReceipt(
    { ...unsigned, receiptDigest: digestObject(unsigned) },
    { expectedSourceSha: expectedSha, expectedMigrationDigest: unsigned.migrationDigest },
  );
  writeFileSync(path.join(output, 'receipt.json'), `${canonicalJson(receipt)}\n`, { flag: 'wx', mode: 0o600 });
  return receipt;
}

function snapshotInsert(task) {
  return `INSERT INTO kidults_control.autonomous_task_snapshots
    (task_id, revision, state, attempt, lease_owner, lease_epoch, task_json, task_digest, writer_id)
    VALUES (${snapshotTuple(task)})`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--expected-sha' || args[2] !== '--output-dir') {
    fail('AUTONOMOUS_POSTGRES_ARGUMENTS_INVALID');
  }
  const receipt = await runEphemeralPostgresEvidence({
    dsn: process.env.KIDULTS_EPHEMERAL_POSTGRES_DSN,
    confirmation: process.env.KIDULTS_EPHEMERAL_POSTGRES_CONFIRM,
    expectedSha: args[1], outputDirectory: args[3],
  });
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify({ id: 'kidults-autonomous-postgres-evidence-v1',
      state: 'HOLD', reason: /^AUTONOMOUS_POSTGRES_[A-Z0-9_]+$/.test(error.message)
        ? error.message : 'AUTONOMOUS_POSTGRES_INTERNAL_ERROR', mutationState: 'UNKNOWN_FAIL_CLOSED',
      credentialMaterialRetained: false, production: 'HOLD', publicRelease: 'HOLD', g5: 'HOLD' }));
    process.exitCode = 1;
  });
}
