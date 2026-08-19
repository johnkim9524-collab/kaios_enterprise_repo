import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const baseHarness = resolve(scriptDir, 'asi-processor-runtime-e2e-test.mjs');
const generatedHarness = resolve(scriptDir, `.generated-asi-real-source-queue-injection-r1-${process.pid}.mjs`);
const bridgePath = process.argv[2] || process.env.KAIOS_ASI_REAL_SOURCE_BRIDGE_PATH;
const reportPath = process.argv[3] || '/tmp/asi-real-source-queue-injection-r1.json';
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
  "const canonicalHost = sourceId === 'real-getty-provenance' ? process.env.KAIOS_REAL_SOURCE_CANONICAL_HOST : `${sourceId}.example`;",
);

const insertPoint = source.lastIndexOf('\n} finally {');
if (insertPoint < 0) throw new Error('E2E_HARNESS_FINAL_INSERT_POINT_NOT_FOUND');
const injection = `

  // Local Queue/D1-compatible DEV/SHADOW injection of metadata derived from an
  // upstream Getty admission artifact. The original Getty record is not processed
  // by this deterministic in-memory harness, and historical context is never
  // promoted to current market price/liquidity/demand.
  const realBridge = JSON.parse(readFileSync(process.env.KAIOS_ASI_REAL_SOURCE_BRIDGE_PATH,'utf8'));
  const realGetty = realBridge.source_pool_admission.inputs.find((item) => item.source_id === 'getty-provenance-index');
  assert.equal(realGetty.rights_state,'ALLOW');
  assert.equal(realGetty.evidence_class,'HISTORICAL_SALE_ACTIVITY');
  assert.equal(realGetty.market_event_temporality,'HISTORICAL_ONLY');

  const realRequest = await discoveryRequest(processors,'real-getty-provenance',true);
  realRequest.input_snapshot_ref = realGetty.payload_hash;
  realRequest.payload.real_source_admission = {
    source_id: realGetty.source_id,
    evidence_class: realGetty.evidence_class,
    rights_state: realGetty.rights_state,
    payload_hash: realGetty.payload_hash,
    market_event_eligible: realGetty.market_event_eligible,
    market_event_temporality: realGetty.market_event_temporality,
    claim_ceiling: realGetty.claim_ceiling,
  };
  realRequest.payload_hash = await processors.sha256Ref(realRequest.payload);
  realRequest.trace_refs.push('bridge:asi-real-source-processor-bridge-r1');
  const realEnqueue = await runtime.enqueueAsiEvent(env,realRequest);
  test('Getty-derived metadata enters the local Queue/D1-compatible DEV/SHADOW discovery harness', () => {
    assert.equal(realEnqueue.state,'DISPATCHED');
    assert.deepEqual(realEnqueue.fleets,['DISCOVERY_WIKIDATA']);
  });
  const realDeliveriesBefore = mesh.deliveries.length;
  const realDrainCount = await mesh.drain(runtime);
  const realAdmission = queryOne(db,'SELECT decision,rights_state,required_assertion_count,satisfied_assertion_count FROM asi_purpose_admissions WHERE source_id=?','real-getty-provenance');
  const realPool = queryOne(db,'SELECT recorded_pool_state,rights_state,current_admission_decision,current_admission_rights_state,effective_pool_state,effective_usable,content_collection_authorized,market_claim_authorized,commercial_projection_authorized,production_eligible,production_state FROM asi_source_pool_effective WHERE source_id=?','real-getty-provenance');
  test('Getty-derived metadata remains fail-closed HOLD without claim inflation', () => {
    assert.ok(realDrainCount > 0);
    assert.ok(mesh.deliveries.length > realDeliveriesBefore);
    const candidate = queryOne(db,'SELECT source_id,canonical_host,rights_state,candidate_state FROM asi_source_candidates WHERE source_id=?','real-getty-provenance');
    assert.equal(candidate.source_id,'real-getty-provenance');
    assert.equal(candidate.canonical_host,'data.getty.edu');
    assert.equal(candidate.rights_state,'ALLOW');
    assert.equal(realAdmission.decision,'HOLD');
    assert.equal(realAdmission.rights_state,'UNKNOWN');
    assert.ok(Number(realAdmission.satisfied_assertion_count) < Number(realAdmission.required_assertion_count));
    assert.equal(realPool.recorded_pool_state,'HOLD');
    assert.equal(realPool.rights_state,'UNKNOWN');
    assert.equal(realPool.current_admission_decision,'HOLD');
    assert.equal(realPool.current_admission_rights_state,'UNKNOWN');
    assert.equal(realPool.effective_pool_state,'HOLD');
    assert.equal(Number(realPool.effective_usable),0);
    assert.equal(Number(realPool.content_collection_authorized),0);
    assert.equal(Number(realPool.market_claim_authorized),0);
    assert.equal(Number(realPool.commercial_projection_authorized),0);
    assert.equal(Number(realPool.production_eligible),0);
    assert.equal(realPool.production_state,'HOLD');
  });

  writeFileSync(process.env.KAIOS_ASI_REAL_SOURCE_QUEUE_REPORT_PATH,JSON.stringify({
    id:'asi-real-source-queue-injection-r1',
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
    admission:{decision:realAdmission.decision,rights_state:realAdmission.rights_state},
    pool:{state:realPool.effective_pool_state,usable:Number(realPool.effective_usable)},
    current_market_event_evidenced:false,
    current_market_admission:'HOLD',
    content_collection_authorized:false,
    market_claim_authorized:false,
    commercial_projection_authorized:false,
    production_eligible:false,
    production:'HOLD',
    truth_boundary:'Deterministic local Queue/D1-compatible DEV/SHADOW harness only. Remote Cloudflare resources, canonical durability, original Getty record processing, current-market evidence, commercial projection, and Production readiness are not verified.'
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
      KAIOS_REAL_SOURCE_CANONICAL_HOST: 'data.getty.edu',
      KAIOS_ASI_REAL_SOURCE_QUEUE_REPORT_PATH: resolve(reportPath),
    },
  });
  if (result.status !== 0) {
    throw new Error(`ASI_REAL_SOURCE_QUEUE_INJECTION_R1_CHILD_FAILED:${result.status ?? 1}`);
  }
  console.log('ASI_REAL_SOURCE_QUEUE_INJECTION_R1_LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_PASS_REMOTE_NOT_VERIFIED');
} finally {
  try { unlinkSync(generatedHarness); } catch {}
}
