import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const baseHarness = resolve(scriptDir, 'asi-processor-runtime-e2e-test.mjs');
const generatedHarness = resolve(scriptDir, '.generated-asi-real-source-queue-injection-r1.mjs');
const bridgePath = process.argv[2] || process.env.KAIOS_ASI_REAL_SOURCE_BRIDGE_PATH;
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

  // Real-source-derived Queue/D1 injection. The live Getty artifact was fetched
  // and rights-admitted before this harness starts. This event carries only the
  // bounded admission context; historical evidence is never promoted to current
  // market price/liquidity/demand.
  const realBridge = JSON.parse(readFileSync(process.env.KAIOS_ASI_REAL_SOURCE_BRIDGE_PATH,'utf8'));
  const realGetty = realBridge.source_pool_admission.inputs.find((item) => item.source_id === 'getty-provenance-index');
  assert.equal(realGetty.rights_state,'ALLOW');
  assert.equal(realGetty.evidence_class,'HISTORICAL_SALE_ACTIVITY');
  assert.equal(realGetty.market_event_temporality,'HISTORICAL_ONLY');

  const realRequest = await discoveryRequest(processors,'real-getty-provenance',false);
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
  test('rights-admitted Getty record is durably injected into canonical Queue/D1 discovery path', () => {
    assert.equal(realEnqueue.state,'DISPATCHED');
    assert.deepEqual(realEnqueue.fleets,['DISCOVERY_WIKIDATA']);
  });
  const realDeliveriesBefore = mesh.deliveries.length;
  const realDrainCount = await mesh.drain(runtime);
  test('real-source-derived Getty event traverses processor mesh without claim inflation', () => {
    assert.ok(realDrainCount > 0);
    assert.ok(mesh.deliveries.length > realDeliveriesBefore);
    const candidate = queryOne(db,'SELECT source_id,canonical_host,rights_state,candidate_state FROM asi_source_candidates WHERE source_id=?','real-getty-provenance');
    assert.equal(candidate.source_id,'real-getty-provenance');
    assert.equal(candidate.canonical_host,'data.getty.edu');
    assert.equal(candidate.rights_state,'ALLOW');
    const decisions = queryAll(db,'SELECT pool_state,rights_state,market_claim_authorized,commercial_projection_authorized,production_eligible,production_state FROM asi_source_pool_decisions WHERE source_id=? ORDER BY decided_at','real-getty-provenance');
    assert.ok(decisions.length > 0);
    const latest = decisions.at(-1);
    assert.equal(latest.rights_state,'ALLOW');
    assert.equal(Number(latest.market_claim_authorized),0);
    assert.equal(Number(latest.commercial_projection_authorized),0);
    assert.equal(Number(latest.production_eligible),0);
    assert.equal(latest.production_state,'HOLD');
  });
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
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log('ASI_REAL_SOURCE_QUEUE_INJECTION_R1_PASS');
} finally {
  try { unlinkSync(generatedHarness); } catch {}
}
