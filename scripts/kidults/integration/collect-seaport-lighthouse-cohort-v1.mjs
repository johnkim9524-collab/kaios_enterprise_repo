#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const ENDPOINT = process.env.KIDULTS_ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';
const SEAPORT = '0x0000000000000068f116a894984e2db1123eb395';
const ANCHOR_TX = '0x8180cca28afdc58271732849b20c45e896ca96080aa5925badc0a32b2a52a061';
const TARGET = Math.max(25, Math.min(Number(process.env.KIDULTS_COHORT_SIZE || 50), 50));
const WINDOW_SECONDS = 7 * 24 * 60 * 60;
const MAX_BLOCKS = 52000;
const CHUNK = 100;
const OUTPUT = process.argv[2] || 'artifacts/kidults-seaport-lighthouse/current-cohort.json';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function post(body, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();
    if (attempt === attempts) throw new Error(`RPC_HTTP_${response.status}`);
    await sleep(attempt * 750);
  }
}
let requestId = 0;
async function rpc(method, params) {
  const payload = await post({jsonrpc:'2.0', id:++requestId, method, params});
  if (payload.error) throw new Error(`RPC_${method}_${payload.error.code}`);
  return payload.result;
}
async function batch(calls) {
  const body = calls.map(({method, params}) => ({jsonrpc:'2.0', id:++requestId, method, params}));
  const payload = await post(body);
  const byId = new Map(payload.map(item => [item.id, item]));
  return body.map(item => {
    const value = byId.get(item.id);
    if (!value || value.error) throw new Error(`RPC_BATCH_${item.method}_FAILED`);
    return value.result;
  });
}
const hex = value => '0x' + Number(value).toString(16);
const number = value => Number.parseInt(value, 16);
const digest = value => 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const anchor = await rpc('eth_getTransactionReceipt', [ANCHOR_TX]);
if (!anchor || anchor.status !== '0x1') throw new Error('ANCHOR_RECEIPT_NOT_SUCCESS');
const anchorLog = anchor.logs.find(log =>
  log.address.toLowerCase() === SEAPORT && number(log.logIndex) === 639
);
if (!anchorLog || !anchorLog.topics?.[0]) throw new Error('ANCHOR_ORDER_FULFILLED_LOG_MISSING');
const topic0 = anchorLog.topics[0];

const latest = number(await rpc('eth_blockNumber', []));
let cursor = latest;
const lowerBound = Math.max(0, latest - MAX_BLOCKS);
const found = [];
while (cursor >= lowerBound && found.length < TARGET * 2) {
  const from = Math.max(lowerBound, cursor - CHUNK + 1);
  const logs = await rpc('eth_getLogs', [{
    fromBlock: hex(from), toBlock: hex(cursor), address: SEAPORT, topics: [topic0],
  }]);
  found.push(...logs.filter(log => !log.removed));
  cursor = from - 1;
  await sleep(120);
}
const unique = [...new Map(found.map(log => [`${log.transactionHash}:${number(log.logIndex)}`, log])).values()]
  .sort((a,b) => number(b.blockNumber) - number(a.blockNumber))
  .slice(0, TARGET);
if (unique.length < 25) throw new Error(`LIGHTHOUSE_FLOOR_NOT_MET:${unique.length}`);

const blockNumbers = [...new Set(unique.map(log => log.blockNumber))];
const calls = [
  ...blockNumbers.map(value => ({method:'eth_getBlockByNumber', params:[value, false]})),
  ...unique.map(log => ({method:'eth_getTransactionReceipt', params:[log.transactionHash]})),
];
const results = await batch(calls);
const blocks = new Map(results.slice(0, blockNumbers.length).map(block => [block.number, block]));
const receipts = new Map(results.slice(blockNumbers.length).map(receipt => [receipt.transactionHash.toLowerCase(), receipt]));
const now = Math.floor(Date.now()/1000);

const records = unique.map(log => {
  const block = blocks.get(log.blockNumber);
  const receipt = receipts.get(log.transactionHash.toLowerCase());
  if (!block || !receipt || receipt.status !== '0x1') throw new Error('EVENT_RECEIPT_BINDING_FAILED');
  const occurredAt = new Date(number(block.timestamp) * 1000).toISOString();
  if (now - number(block.timestamp) > WINDOW_SECONDS) throw new Error('EVENT_OUTSIDE_STRICT_CURRENT_WINDOW');
  return {
    event_id: `ethereum-mainnet:${number(log.blockNumber)}:${log.transactionHash}:${number(log.logIndex)}`,
    chain: 'ethereum-mainnet',
    block_number: number(log.blockNumber),
    block_hash: log.blockHash,
    transaction_hash: log.transactionHash,
    log_index: number(log.logIndex),
    receipt_status: 1,
    occurred_at: occurredAt,
    finality_confirmations_at_collection: latest - number(log.blockNumber),
    protocol: 'Seaport 1.6',
    protocol_contract: SEAPORT,
    event_name: 'OrderFulfilled',
    event_topic0: topic0,
    order_hash: log.topics[1] || null,
    source_payload_sha256: digest({topics:log.topics,data:log.data,blockHash:log.blockHash,transactionHash:log.transactionHash,logIndex:log.logIndex}),
    market_observation_type: 'ORDER_FULFILLED',
    sold_claim: false,
    rights_state: 'CONDITIONAL',
    claim_ceiling: 'STRICT_CURRENT_ONCHAIN_SEAPORT_PAID_FULFILLMENT_FACT_ONLY',
  };
});
const payload = {
  record_type: 'seaport_lighthouse_cohort',
  version: '1.0.0',
  generated_at: new Date().toISOString(),
  source_head_block: latest,
  strict_current_window_days: 7,
  target_count: TARGET,
  admitted_count: records.length,
  unique_event_count: new Set(records.map(x=>x.event_id)).size,
  source: {
    factual_origin_owner: 'Ethereum protocol',
    transport_provider: 'PublicNode / Allnodes',
    rpc_endpoint: ENDPOINT,
    provider_page: 'https://www.publicnode.com/',
    protocol_documentation: 'https://docs.opensea.io/docs/seaport-events-and-errors',
    access_mode: 'READ_ONLY_NO_KEY_PUBLIC_RPC',
    collect: 'PASS_TRANSIENT_FACTUAL_POC',
    store: 'CONDITIONAL_NO_PRODUCT_PERSISTENCE',
    derive: 'CONDITIONAL_INTERNAL_VALIDATION_ONLY',
    commercial_use: 'HOLD',
  },
  claim_ceiling: 'STRICT_CURRENT_ONCHAIN_SEAPORT_PAID_FULFILLMENT_FACT_ONLY',
  sold_claim: false,
  cohort_promotion_authorized: false,
  replay_authorized: false,
  projection_authorized: false,
  public_authorized: false,
  production_authorized: false,
  g5_authorized: false,
  records,
};
if (payload.admitted_count !== payload.unique_event_count) throw new Error('COHORT_DEDUPE_FAILED');
fs.mkdirSync(OUTPUT.split('/').slice(0, -1).join('/') || '.', {recursive:true});
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify({
  suite:'KIDULTS_SEAPORT_LIGHTHOUSE_COHORT_V1', result:'PASS',
  admitted_count:payload.admitted_count, source_head_block:latest,
  claim_ceiling:payload.claim_ceiling, sold_claim:false,
  track_b_input_generation:'NEXT_CONTROLLED_STEP',
  public:'HOLD', production:'HOLD', g5:'HOLD',
}, null, 2));
