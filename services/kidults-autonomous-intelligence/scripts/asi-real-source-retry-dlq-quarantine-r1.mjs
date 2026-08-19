import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const baseHarness = resolve(scriptDir, 'asi-processor-runtime-e2e-test.mjs');
const generatedHarness = resolve(scriptDir, `.generated-asi-real-source-retry-dlq-quarantine-r1-${process.pid}.mjs`);
const bridgePath = process.argv[2] || process.env.KAIOS_ASI_REAL_SOURCE_BRIDGE_PATH;
const reportPath = process.argv[3] || '/tmp/asi-real-source-retry-dlq-quarantine-r1.json';
if (!bridgePath) throw new Error('REAL_SOURCE_BRIDGE_PATH_REQUIRED');

const bridge = JSON.parse(readFileSync(bridgePath, 'utf8'));
const getty = bridge?.source_pool_admission?.inputs?.find((item) => item.source_id === 'getty-provenance-index');
if (!getty || getty.rights_state !== 'ALLOW' || getty.evidence_class !== 'HISTORICAL_SALE_ACTIVITY') {
  throw new Error('GETTY_ADMITTED_BRIDGE_INPUT_REQUIRED');
}
if (getty.market_event_temporality !== 'HISTORICAL_ONLY') throw new Error('GETTY_TEMPORALITY_GUARD_REQUIRED');

let source = readFileSync(baseHarness, 'utf8');
const hostNeedle = 'const canonicalHost = `${sourceId}.example`;';
if (!source.includes(hostNeedle)) throw new Error('E2E_HARNESS_HOST_PATCH_POINT_NOT_FOUND');
source = source.replace(
  hostNeedle,
  "const canonicalHost = sourceId.startsWith('real-getty-') ? 'data.getty.edu' : `${sourceId}.example`;",
);

const insertPoint = source.lastIndexOf('\n} finally {');
if (insertPoint < 0) throw new Error('E2E_HARNESS_FINAL_INSERT_POINT_NOT_FOUND');
const injection = `

  const realControlBridge = JSON.parse(readFileSync(process.env.KAIOS_ASI_REAL_SOURCE_BRIDGE_PATH,'utf8'));
  const realControlGetty = realControlBridge.source_pool_admission.inputs.find((item) => item.source_id === 'getty-provenance-index');
  assert.equal(realControlGetty.rights_state,'ALLOW');
  assert.equal(realControlGetty.evidence_class,'HISTORICAL_SALE_ACTIVITY');

  // Synthetic transport retry/DLQ control using Getty-derived admission metadata.
  // The forced failure is injected locally and was not observed from the source
  // or from a remote Cloudflare resource.
  const retryRequest = await discoveryRequest(processors,'real-getty-retry',true);
  retryRequest.input_snapshot_ref = realControlGetty.payload_hash;
  retryRequest.payload.real_source_admission = {
    source_id:realControlGetty.source_id,
    evidence_class:realControlGetty.evidence_class,
    rights_state:realControlGetty.rights_state,
    payload_hash:realControlGetty.payload_hash,
    market_event_temporality:realControlGetty.market_event_temporality,
    claim_ceiling:realControlGetty.claim_ceiling,
  };
  retryRequest.payload_hash = await processors.sha256Ref(retryRequest.payload);
  retryRequest.trace_refs.push('control:real-source-retry-dlq-r1');

  const retryFleet = registry.ASI_FLEET_BY_ID.get('DISCOVERY_WIKIDATA');
  const healthyBinding = env[retryFleet.binding];
  let forcedSendFailures = 0;
  env[retryFleet.binding] = {
    send: async () => { forcedSendFailures += 1; throw new Error('FORCED_REAL_SOURCE_TRANSPORT_FAILURE'); },
    sendBatch: async () => { forcedSendFailures += 1; throw new Error('FORCED_REAL_SOURCE_TRANSPORT_FAILURE'); },
  };

  const retryIngress = await runtime.enqueueAsiEvent(env,retryRequest);
  test('Getty-derived metadata enters local synthetic RETRY control state', () => {
    assert.equal(retryRequest.payload.assertion_inputs.COLLECT.rights_state,'UNKNOWN');
    assert.equal(retryIngress.state,'QUEUED_FOR_RELAY');
    const row = queryOne(db,'SELECT status,attempt_count,last_error FROM asi_outbox WHERE event_id=?',retryRequest.event_id);
    assert.equal(row.status,'RETRY');
    assert.equal(Number(row.attempt_count),1);
    assert.equal(row.last_error,'FORCED_REAL_SOURCE_TRANSPORT_FAILURE');
  });

  const retryRelayResults = [];
  for (let attempt = 2; attempt <= 5; attempt += 1) {
    db.sqlite.prepare("UPDATE asi_outbox SET next_attempt_at=datetime('now','-1 second') WHERE event_id=?").run(retryRequest.event_id);
    retryRelayResults.push(await runtime.relayPendingOutbox(env,25));
  }
  const deadLetterOutbox = queryOne(db,'SELECT status,attempt_count,last_error FROM asi_outbox WHERE event_id=?',retryRequest.event_id);
  const deadLetterRow = queryOne(db,'SELECT error_code,error_message,attempts,event_id FROM asi_dead_letters WHERE event_id=?',retryRequest.event_id);
  const retryAdmissionCount = Number(queryOne(db,"SELECT COUNT(*) AS n FROM asi_purpose_admissions WHERE source_id='real-getty-retry'").n);
  const retryPoolCount = Number(queryOne(db,"SELECT COUNT(*) AS n FROM asi_source_pool_decisions WHERE source_id='real-getty-retry'").n);
  test('local synthetic transport control exhausts retries into a local DLQ row without qualification', () => {
    assert.equal(deadLetterOutbox.status,'DEAD_LETTERED');
    assert.equal(Number(deadLetterOutbox.attempt_count),5);
    assert.equal(deadLetterOutbox.last_error,'FORCED_REAL_SOURCE_TRANSPORT_FAILURE');
    assert.equal(deadLetterRow.error_code,'ASI_OUTBOX_DISPATCH_EXHAUSTED');
    assert.equal(deadLetterRow.error_message,'FORCED_REAL_SOURCE_TRANSPORT_FAILURE');
    assert.equal(Number(deadLetterRow.attempts),5);
    assert.equal(forcedSendFailures,5);
    assert.equal(retryRelayResults.at(-1).deadLettered,1);
    assert.equal(retryAdmissionCount,0);
    assert.equal(retryPoolCount,0);
  });
  env[retryFleet.binding] = healthyBinding;

  // Synthetic UNKNOWN_CONTROL rights quarantine derived from the same metadata.
  // UNKNOWN_CONTROL was not observed from Getty. The local compatible runtime must
  // preserve HOLD / unusable state with zero market claim. Use an independent
  // discovery fleet so the synthetic retry circuit cannot contaminate quarantine.
  const quarantineRequest = await discoveryRequest(processors,'real-getty-quarantine',true);
  quarantineRequest.partition.channel = 'DATACITE_AND_OPEN_RESEARCH_LANDING_METADATA';
  quarantineRequest.input_snapshot_ref = realControlGetty.payload_hash;
  quarantineRequest.payload.real_source_admission = {
    source_id:realControlGetty.source_id,
    evidence_class:realControlGetty.evidence_class,
    rights_state:'UNKNOWN_CONTROL',
    payload_hash:realControlGetty.payload_hash,
    market_event_temporality:realControlGetty.market_event_temporality,
    claim_ceiling:realControlGetty.claim_ceiling,
  };
  quarantineRequest.payload_hash = await processors.sha256Ref(quarantineRequest.payload);
  quarantineRequest.trace_refs.push('control:real-source-rights-quarantine-r1');
  const quarantineIngress = await runtime.enqueueAsiEvent(env,quarantineRequest);
  assert.equal(quarantineIngress.state,'DISPATCHED');
  const quarantineProcessed = await mesh.drain(runtime);
  const quarantineAdmission = queryOne(db,"SELECT decision,rights_state FROM asi_purpose_admissions WHERE source_id='real-getty-quarantine'");
  const quarantinePool = queryOne(db,"SELECT effective_pool_state,effective_usable,market_claim_authorized,commercial_projection_authorized,production_eligible,production_state FROM asi_source_pool_effective WHERE source_id='real-getty-quarantine'");
  test('synthetic UNKNOWN_CONTROL is quarantined locally as fail-closed HOLD', () => {
    assert.equal(quarantineProcessed,14);
    assert.equal(quarantineAdmission.decision,'HOLD');
    assert.equal(quarantineAdmission.rights_state,'UNKNOWN');
    assert.equal(quarantinePool.effective_pool_state,'HOLD');
    assert.equal(Number(quarantinePool.effective_usable),0);
    assert.equal(Number(quarantinePool.market_claim_authorized),0);
    assert.equal(Number(quarantinePool.commercial_projection_authorized),0);
    assert.equal(Number(quarantinePool.production_eligible),0);
    assert.equal(quarantinePool.production_state,'HOLD');
  });

  writeFileSync(process.env.KAIOS_ASI_REAL_SOURCE_FAILURE_REPORT_PATH,JSON.stringify({
    id:'asi-real-source-retry-dlq-quarantine-r1',
    execution_mode:'LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS',
    backend:{
      database:'LOCAL_IN_MEMORY_SQLITE',
      queue:'LOCAL_DETERMINISTIC_IN_MEMORY_QUEUE',
      remote_cloudflare:false,
      canonical_cloudflare_durability_verified:false,
    },
    source_id:'getty-provenance-index',
    original_getty_record_processed:false,
    live_derived_admission_metadata_attached:true,
    retry:{
      state:'PASS_SYNTHETIC_CONTROL',
      forced_failure:{synthetic:true,observed:false,observed_from_source:false,observed_from_remote_cloudflare:false},
      forced_failures:forcedSendFailures,
      attempts:Number(deadLetterOutbox.attempt_count),
      discovery_fixture_rights_state:'UNKNOWN',
      admission_materialized:false,
      source_pool_materialized:false,
      qualified_pool_rows:0,
    },
    dlq:{state:'PASS_LOCAL_HARNESS',error_code:deadLetterRow.error_code,attempts:Number(deadLetterRow.attempts),remote_cloudflare_observed:false},
    quarantine:{
      state:'PASS_SYNTHETIC_UNKNOWN_CONTROL_HOLD',
      unknown_control:{value:'UNKNOWN_CONTROL',synthetic:true,observed:false,observed_from_source:false},
      admission:quarantineAdmission.decision,
      rights_state:quarantineAdmission.rights_state,
      effective_pool_state:quarantinePool.effective_pool_state,
      effective_usable:Number(quarantinePool.effective_usable),
    },
    market_claim_authorized:false,
    commercial_projection_authorized:false,
    production_eligible:false,
    production:'HOLD',
    truth_boundary:'Deterministic local Queue/D1-compatible DEV/SHADOW failure controls using Getty-derived metadata. Forced transport failure and UNKNOWN_CONTROL are synthetic and not source-observed. Remote Cloudflare resources, canonical durability, original Getty record processing, current-market evidence, Candidate handoff, and Production readiness are not verified.'
  },null,2));
`;
source = source.slice(0, insertPoint) + injection + source.slice(insertPoint);
writeFileSync(generatedHarness, source, 'utf8');

try {
  const result = spawnSync(process.execPath, [generatedHarness], {
    cwd: resolve(scriptDir, '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      KAIOS_ASI_REAL_SOURCE_BRIDGE_PATH: resolve(bridgePath),
      KAIOS_ASI_REAL_SOURCE_FAILURE_REPORT_PATH: resolve(reportPath),
    },
  });
  if (result.status !== 0) {
    throw new Error(`ASI_REAL_SOURCE_RETRY_DLQ_QUARANTINE_R1_CHILD_FAILED:${result.status ?? 1}`);
  }
  console.log('ASI_REAL_SOURCE_RETRY_DLQ_QUARANTINE_R1_LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_PASS_REMOTE_NOT_VERIFIED');
} finally {
  try { unlinkSync(generatedHarness); } catch {}
}
