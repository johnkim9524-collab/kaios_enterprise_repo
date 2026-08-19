import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const cwd = resolve(currentDir, '..');
const repoRoot = resolve(cwd, '../..');
const read = (path) => readFileSync(resolve(repoRoot,path),'utf8').replace(/^\uFEFF/,'');
const config = JSON.parse(read('services/kidults-autonomous-intelligence/wrangler.jsonc'));
const mesh = JSON.parse(read('coordination/kidults/source-intelligence/asi-market-funnel-engine-mesh-v1.json'));
const queueContract = JSON.parse(read('coordination/kidults/source-intelligence/asi-queue-and-partition-contract-v1.json'));
const admissionPolicy = JSON.parse(read('coordination/kidults/source-intelligence/asi-purpose-specific-admission-policy-v1.json'));
const registrySource = read('services/kidults-autonomous-intelligence/src/asi/registry.ts');
const migration = read('services/kidults-autonomous-intelligence/migrations/0003_asi_market_funnel_shadow.sql');
const processorMigration = read('services/kidults-autonomous-intelligence/migrations/0004_asi_processor_shadow.sql');
const recoveryMigration = read('services/kidults-autonomous-intelligence/migrations/0005_asi_runtime_recovery_fairness_shadow.sql');
const taskLeaseFencingMigration = read('services/kidults-autonomous-intelligence/migrations/0006_asi_task_lease_atomic_fencing_shadow.sql');
const processorSource = read('services/kidults-autonomous-intelligence/src/asi/processors.ts');
const processorRuntimeSource = read('services/kidults-autonomous-intelligence/src/asi/processor-runtime.ts');
const processorTestSource = read('services/kidults-autonomous-intelligence/scripts/asi-processor-shadow-test.mjs');
const processorE2eTestSource = read('services/kidults-autonomous-intelligence/scripts/asi-processor-runtime-e2e-test.mjs');
const recoveryTestSource = read('services/kidults-autonomous-intelligence/scripts/asi-runtime-recovery-fairness-test.mjs');
const ingestSource = read('services/kidults-autonomous-intelligence/src/index.ts');
const workerSource = read('services/kidults-autonomous-intelligence/src/worker.ts');
const httpSecuritySource = read('services/kidults-autonomous-intelligence/src/http-security.ts');
const eventEnvelopeSource = read('services/kidults-autonomous-intelligence/src/asi/event.ts');
const eventRuntimeSource = read('services/kidults-autonomous-intelligence/src/asi/runtime.ts');

const failures = [];
const unique = (values) => new Set(values).size === values.length;
const db = config?.d1_databases?.find((item) => item.binding === 'DB');
if (!db?.database_name || !db?.database_id || db.database_id === 'REPLACE_WITH_D1_DATABASE_ID') failures.push('D1 binding DB is incomplete.');
if (config?.main !== 'src/worker.ts') failures.push('Worker entrypoint must remain src/worker.ts.');
if (config?.compatibility_date !== '2026-08-18') failures.push('Compatibility date must match the reviewed alignment baseline.');
if (!config?.compatibility_flags?.includes('nodejs_compat')) failures.push('nodejs_compat is required.');
if (config?.observability?.enabled !== true || config?.observability?.logs?.enabled !== true) failures.push('Structured observability must be enabled.');
if (config?.vars?.ASI_MESH_MODE !== 'SHADOW') failures.push('ASI mesh must remain SHADOW.');
if (config?.vars?.ASI_PUBLICATION_ENABLED !== 'false') failures.push('Publication must remain fail-closed.');
if (config?.vars?.SOURCE_ADAPTERS_JSON !== '[]') failures.push('Legacy synchronous adapter execution must remain disabled.');
if (!Array.isArray(config?.triggers?.crons) || !config.triggers.crons.length) failures.push('Shadow heartbeat cron is missing.');

const contractFleets = mesh.asi_funnel.stages.flatMap((stage) => stage.engine_fleets);
const registryFleets = [...registrySource.matchAll(/\{ id: '([^']+)', stage: '[^']+', binding: '([^']+)', queue: '([^']+)' \}/g)]
  .map((match) => ({ id:match[1],binding:match[2],queue:match[3] }));
const producers = config?.queues?.producers || [];
const consumers = config?.queues?.consumers || [];
const fleetProducers = producers.filter((item) => item.binding !== 'ASI_DEAD_LETTER_QUEUE');
const fleetConsumers = consumers.filter((item) => item.queue !== 'kidults-asi-shadow-dead-letter');
const dlqConsumers = consumers.filter((item) => item.queue === 'kidults-asi-shadow-dead-letter');

if (contractFleets.length !== 25 || !unique(contractFleets)) failures.push('Contract must contain 25 unique ASI fleets.');
if (registryFleets.length !== 25 || !unique(registryFleets.map((item) => item.id))) failures.push('Runtime registry must contain 25 unique ASI fleets.');
if (JSON.stringify([...contractFleets].sort()) !== JSON.stringify(registryFleets.map((item) => item.id).sort())) failures.push('Runtime fleet registry does not exactly match the contract.');
if (fleetProducers.length !== 25 || fleetConsumers.length !== 25 || dlqConsumers.length !== 1) failures.push('Exactly 25 fleet transports and one shared DLQ consumer are required.');
if (!unique(fleetProducers.map((item) => item.binding)) || !unique(fleetProducers.map((item) => item.queue))) failures.push('Fleet queue bindings and names must be unique.');
if (producers.some((item) => item.queue.length > 63) || consumers.some((item) => item.queue.length > 63 || (item.dead_letter_queue?.length ?? 0) > 63)) failures.push('Cloudflare Queue names must be 63 characters or fewer.');
if (JSON.stringify(fleetProducers.map((item) => item.queue).sort()) !== JSON.stringify(fleetConsumers.map((item) => item.queue).sort())) failures.push('Every fleet producer queue must have one fleet consumer.');
if (fleetConsumers.some((item) => item.max_retries !== 3 || item.dead_letter_queue !== 'kidults-asi-shadow-dead-letter')) failures.push('Every fleet consumer needs bounded retry and the shared DLQ.');
if (dlqConsumers.some((item) => item.max_retries !== 3 || Object.hasOwn(item,'dead_letter_queue'))) failures.push('Shared DLQ consumer needs bounded retries without a recursive DLQ.');
if (consumers.some((item) => Object.hasOwn(item,'max_concurrency'))) failures.push('Fixed max_concurrency is forbidden; Queue autoscaling must remain elastic.');
if (!producers.some((item) => item.binding === 'ASI_DEAD_LETTER_QUEUE' && item.queue === 'kidults-asi-shadow-dead-letter')) failures.push('Shared dead-letter queue binding is missing.');

for (const table of [
  'asi_event_log','asi_outbox','asi_engine_assertions','asi_purpose_admissions','asi_admission_assertions','asi_queue_watermarks',
  'asi_dead_letters','asi_processed_messages','asi_engine_health','asi_task_leases','asi_replay_requests','asi_circuit_breakers','asi_fleet_budgets',
]) {
  if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) failures.push(`Missing durable ASI table ${table}.`);
}
for (const table of [
  'asi_source_candidates','asi_source_candidate_observations','asi_processor_assertions','asi_processor_fan_in_groups',
  'asi_processor_fan_in_requirements','asi_processor_fan_in_members','asi_source_pool_decisions',
]) {
  if (!processorMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) failures.push(`Missing processor ASI table ${table}.`);
}
if (!processorMigration.includes('CREATE VIEW IF NOT EXISTS asi_processor_fan_in_readiness') ||
  !processorMigration.includes('CREATE VIEW IF NOT EXISTS asi_source_pool_effective') ||
  !processorMigration.includes("production_state='HOLD'")) failures.push('Processor fan-in and fail-closed SHADOW source-pool guards are incomplete.');
for (const table of [
  'asi_relay_fairness','asi_replay_attempts','asi_transport_attempts','asi_transport_control_holds','asi_terminal_dlq_receipts',
]) {
  if (!recoveryMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) failures.push(`Missing recovery ASI table ${table}.`);
}
if (!recoveryMigration.includes('CREATE VIEW IF NOT EXISTS asi_runtime_recovery_holds') ||
  !recoveryMigration.includes('ACK_AFTER_D1_PERSIST') ||
  !recoveryMigration.includes('loss_guarantee INTEGER NOT NULL DEFAULT 0') ||
  !recoveryMigration.includes('ALTER TABLE asi_replay_requests ADD COLUMN lease_owner') ||
  !recoveryMigration.includes('ALTER TABLE asi_outbox ADD COLUMN fairness_key')) {
  failures.push('Recovery, fair relay and terminal DLQ fail-closed schema is incomplete.');
}
if (!taskLeaseFencingMigration.includes('CREATE TABLE IF NOT EXISTS asi_task_lease_write_fences') ||
  !taskLeaseFencingMigration.includes('trg_asi_task_lease_write_fence_active') ||
  !taskLeaseFencingMigration.includes("RAISE(ABORT,'ASI_TASK_LEASE_FENCE_LOST')") ||
  !taskLeaseFencingMigration.includes('l.attempt_count=NEW.lease_epoch')) {
  failures.push('Atomic task-lease owner and epoch write fencing schema is incomplete.');
}
if (!processorSource.includes('export function asiProcessorInventory') ||
  !processorSource.includes('SOURCE_POOL_DECIDED') ||
  !processorRuntimeSource.includes('evaluateBoundedShadowAdmission') ||
  !eventRuntimeSource.includes('runAsiProcessorTask')) failures.push('All 25 deterministic SHADOW processors must be wired through the Queue consumer runtime.');
if (!eventRuntimeSource.includes('export async function runAsiRecoveryCycle') ||
  !eventRuntimeSource.includes('export async function recoverPendingReplays') ||
  !eventRuntimeSource.includes('export function asiFairnessKey') ||
  !eventRuntimeSource.includes('ACK_ONLY_AFTER_D1_TERMINAL_LEDGER_PERSIST') ||
  !eventRuntimeSource.includes('loss_guarantee:false') ||
  !eventRuntimeSource.includes('INSERT INTO asi_task_lease_write_fences') ||
  !eventRuntimeSource.includes('fence.leaseEpoch') ||
  !workerSource.includes('runAsiRecoveryCycle(env)')) {
  failures.push('Scheduled SHADOW recovery, replay, fair relay or terminal DLQ truth boundary is not wired.');
}
if (queueContract.partition_key_encoding?.version !== 'partition:v1' ||
  queueContract.partition_key_encoding?.method !== 'CANONICAL_JSON_TUPLE' ||
  queueContract.partition_key_encoding?.delimiter_collision_possible !== false ||
  !eventEnvelopeSource.includes('partition:v1:') ||
  !processorRuntimeSource.includes('ASI_DISCOVERY_CANONICAL_HOST_HASH_MISMATCH') ||
  !processorRuntimeSource.includes('ASI_DISCOVERY_CANONICAL_SITE_ID_MISMATCH')) failures.push('Partition and canonical host identity encoding must be collision-safe and runtime-derived.');
if (!processorTestSource.includes('classification_required:classificationFleets.length') ||
  !processorTestSource.includes('qualification_required:qualificationFleets.length') ||
  !processorE2eTestSource.includes('processors_exercised:25') ||
  !processorE2eTestSource.includes('discovery_fleets_queue_d1_exercised:12') ||
  !processorE2eTestSource.includes('full_queue_d1_processor_deliveries:13 * 14') ||
  !processorE2eTestSource.includes('global_pool_bootstrap_seed_events:bootstrap.queue_seed_events.length') ||
  !processorE2eTestSource.includes('ASI_EVENT_PAYLOAD_HASH_MISMATCH') ||
  !processorE2eTestSource.includes('discovery seed ALLOW cannot override envelope DENY') ||
  !processorE2eTestSource.includes('discovery seed ALLOW cannot override envelope REJECT') ||
  !processorE2eTestSource.includes("hold_pool_state:'HOLD'")) failures.push('Processor durability/fan-in/end-to-end behavioral tests are incomplete.');
if (!recoveryTestSource.includes("fair_partitions:3") ||
  !recoveryTestSource.includes("terminal_ack_policy:'ACK_AFTER_D1_PERSIST'") ||
  !recoveryTestSource.includes('expired replay lease is reclaimed once') ||
  !recoveryTestSource.includes('five control holds do not consume send attempts') ||
  !recoveryTestSource.includes('corrupt outbox is terminal HOLD without circuit impact') ||
  !recoveryTestSource.includes('stale task lease owner cannot mutate processor state') ||
  !recoveryTestSource.includes('after the final fence read before the output batch') ||
  !recoveryTestSource.includes('replay claim and attempt insertion are atomic') ||
  !recoveryTestSource.includes('stale half-open probe owner cannot close or count') ||
  !recoveryTestSource.includes('data quality has unique replay/outbox grains') ||
  !recoveryTestSource.includes('loss_guarantee:false')) {
  failures.push('Recovery/fairness/DLQ/replay deterministic behavioral tests are incomplete.');
}
const boundedAssertions = admissionPolicy.purposes?.find((item) => item.purpose === 'BOUNDED_SHADOW_ACQUISITION')?.required_assertions || [];
const expectedBoundedAssertions = ['COLLECT','STORE','TRANSFORM','RETENTION','RATE_LIMIT','ROBOTS','SCHEMA','PROVENANCE','FRESHNESS'];
if (JSON.stringify(boundedAssertions) !== JSON.stringify(expectedBoundedAssertions)) failures.push('Bounded shadow admission policy assertion set drifted.');
if (!migration.includes("'admission-staging-golden-path-v1'") || !migration.includes("'kidults-asi-purpose-specific-admission-policy-v1@1.0.0'")) failures.push('Versioned bounded staging admission seed is missing.');
if (!migration.includes("[\"STAGING_NONCOMMERCIAL_FIXTURE_ONLY\"]',9,9") || !migration.includes('asi_admission_assertions')) failures.push('Staging admission must bind all nine required assertions.');
if (!migration.includes('ADD COLUMN admission_id TEXT REFERENCES asi_purpose_admissions(admission_id)')) failures.push('Evidence ledger must persist the admission foreign key.');
if (!ingestSource.includes('COUNT(DISTINCT ea.assertion_type)=9') || !ingestSource.includes('a.required_assertion_count=9 AND a.satisfied_assertion_count=9')) failures.push('Ingest must revalidate all nine admission assertions.');
if (!ingestSource.includes('a.superseded_at IS NULL') || !ingestSource.includes('a.revoked_at IS NULL') || !ingestSource.includes('a.review_due_at>?')) failures.push('Ingest must reject stale, superseded or revoked admissions.');
if (!ingestSource.includes('admissionInputSnapshotRef') || !ingestSource.includes('admission_id\n      ) VALUES')) failures.push('Ingest must bind snapshot and persist admission lineage.');
if (!ingestSource.includes('bearerAuthorized(request,env.INGEST_TOKEN)') || !workerSource.includes('bearerAuthorized(request,env.INGEST_TOKEN)') ||
  !httpSecuritySource.includes('if (!token) return false;') || !httpSecuritySource.includes('timingSafeEqual') || !httpSecuritySource.includes('REQUEST_BODY_TOO_LARGE')) failures.push('Internal runtime endpoints need bounded parsing and constant-time fail-closed bearer authentication.');
if (!workerSource.includes('asi_transport_unavailable') || !workerSource.includes('clientError ? 400 : 503')) failures.push('Transient enqueue failures must return a retryable 5xx response.');
if (!eventRuntimeSource.includes('ASI_QUEUE_TASK_OUTBOX_PROVENANCE_MISMATCH') ||
  !eventRuntimeSource.includes('SELECT 1 FROM asi_event_log WHERE event_id=?') ||
  !eventRuntimeSource.includes('assertAsiEventPayloadHash')) failures.push('Payload hash, outbox writes and consumer receipts must be bound to immutable event lineage.');

const expectedVisualLock = 'KIDULTS Portal Visual Baseline v1.0';
const lockMigration = read('services/kidults-autonomous-intelligence/migrations/0002_autonomous_orchestration.sql');
if (!lockMigration.includes(expectedVisualLock) || !lockMigration.includes('"locked":true')) failures.push('Visual baseline lock checkpoint is missing or changed.');

if (failures.length) {
  console.error('KIDULTS deployment preflight BLOCKED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('KIDULTS deployment preflight PASS');
console.log(`D1: ${db.database_name} (${db.database_id})`);
console.log('ASI: SHADOW / 25 deterministic processors + bounded recovery/fair relay queue transports code-wired / publication HOLD');
console.log('Shadow runtime state: processor/fan-in/event/outbox/watermark/replay/circuit/budget/DLQ code wired; remote resources, load and deployment NOT VERIFIED');
