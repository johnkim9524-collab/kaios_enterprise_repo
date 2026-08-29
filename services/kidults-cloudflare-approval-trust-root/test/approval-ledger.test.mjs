import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import worker, { ApprovalLedger } from '../src/index.mjs';
import {
  REQUEST_SIGNATURE_HEADER,
  computeTargetDigest,
  consumeApproval
} from '../../../scripts/governance/external-one-shot-approval-ledger-v1.mjs';

const requestKey = Buffer.alloc(32, 7);
const responseKeys = generateKeyPairSync('ed25519');
const responsePublicKey = responseKeys.publicKey.export({ format:'der',type:'spki' }).toString('base64');
const responsePublicKeySha256 = `sha256:${createHash('sha256').update(Buffer.from(responsePublicKey,'base64')).digest('hex')}`;
const env = {
  KIDULTS_APPROVAL_LEDGER_REQUEST_HMAC_KEY_B64: requestKey.toString('base64'),
  KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64: responseKeys.privateKey.export({ format:'der',type:'pkcs8' }).toString('base64')
};
const targetBase = { provider:'CLOUDFLARE',resource_type:'PAGES_PROJECT',resource_id:'kidults-workspace-staging',environment:'STAGING' };
const target = { ...targetBase, target_digest:computeTargetDigest(targetBase) };
const futureExpiry = new Date(Date.now()+120_000).toISOString();
const context = (overrides={}) => ({
  id:'kidults-external-one-shot-approval-consume-request-v1',version:'1.0.0',approval_id:'CF-TEST-01',
  operation_id:'CLOUDFLARE_PAGES_GOVERNED_STAGING',repository:'johnkim9524-collab/kaios_enterprise_repo',
  workflow_ref:'.github/workflows/kpmo-cloudflare-approval-consume-v1.yml@refs/heads/main',
  control_sha:'a'.repeat(40),source_sha:'b'.repeat(40),github_run_id:'33262992819',github_run_attempt:1,
  consume_nonce:crypto.randomUUID(),requested_at:new Date().toISOString(),request_expires_at:new Date(Date.now()+30_000).toISOString(),
  approval_expires_at:futureExpiry,target,...overrides
});
const record = overrides => ({
  state:'ACTIVE',approval_id:'CF-TEST-01',operation_id:'CLOUDFLARE_PAGES_GOVERNED_STAGING',
  repository:'johnkim9524-collab/kaios_enterprise_repo',
  workflow_ref:'.github/workflows/kpmo-cloudflare-approval-consume-v1.yml@refs/heads/main',
  control_sha:'a'.repeat(40),source_sha:'b'.repeat(40),github_run_id:'33262992819',github_run_attempt:1,target,expires_at:futureExpiry,...overrides
});
class Storage {
  constructor(value) { this.map=new Map([['approval',value]]); this.tail=Promise.resolve(); }
  async transaction(fn) {
    let unlock; const prior=this.tail; this.tail=new Promise(resolve=>{unlock=resolve;}); await prior;
    try { return await fn({get:key=>this.map.get(key),put:(key,value)=>this.map.set(key,value)}); } finally { unlock(); }
  }
}
const signedRequest = (body,url='https://ledger.invalid/v1/approvals/consume') => {
  const raw=JSON.stringify(body);
  const signature=createHmac('sha256',requestKey).update(raw).digest('hex');
  return new Request(url,{method:'POST',body:raw,headers:{
    'content-type':'application/json',[REQUEST_SIGNATURE_HEADER]:`hmac-sha256=${signature}`
  }});
};

test('generic client and Durable Object interoperate with one atomic concurrent winner', async () => {
  const storage=new Storage(record()); const ledger=new ApprovalLedger({storage},env);
  const body=context();
  const attempts=await Promise.allSettled([1,2].map(() => consumeApproval({
    request:body,
    baseUrl:'https://ledger.invalid/',
    requestKey,
    responsePublicKey,
    expectedResponsePublicKeySha256:responsePublicKeySha256,
    fetchImpl:async (_url,init) => {
      assert.equal(init.headers['x-kidults-request-timestamp'],undefined);
      return ledger.fetch(new Request('https://ledger.invalid/v1/approvals/consume',init));
    }
  })));
  assert.equal(attempts.filter(value=>value.status==='fulfilled').length,1);
  assert.equal(attempts.filter(value=>value.status==='rejected').length,1);
  assert.match(attempts.find(value=>value.status==='rejected').reason.message,/^ALREADY_CONSUMED_OR_REPLAY:409$/);
  const winner=attempts.find(value=>value.status==='fulfilled').value;
  assert.equal(winner.ledger_receipt.id,'kidults-external-one-shot-approval-consumption-receipt-v1');
  assert.equal(winner.ledger_receipt.state,'CONSUMED');
  assert.equal(winner.ledger_receipt.target.target_digest,computeTargetDigest(targetBase));
  assert.equal(storage.map.get('approval').state,'CONSUMED');
  assert.ok(storage.map.get('approval').ledger_transaction_id);
});

test('consumed, expired, revoked, mismatch and forged requests fail closed', async () => {
  for (const [value,input,expected] of [
    [record({state:'CONSUMED'}),context(),409],
    [record({expires_at:new Date(Date.now()-1).toISOString()}),context(),422],
    [record({state:'REVOKED'}),context(),409]
  ]) {
    const ledger=new ApprovalLedger({storage:new Storage(value)},env);
    assert.equal((await ledger.fetch(signedRequest(input))).status,expected);
  }
  const mismatch=context(); mismatch.control_sha='c'.repeat(40);
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(mismatch))).status,422);
  assert.equal((await new ApprovalLedger({storage:new Storage(record({state:'CONSUMED'}))},env).fetch(signedRequest(mismatch))).status,422);
  const forged=signedRequest(context()); forged.headers.set(REQUEST_SIGNATURE_HEADER,'hmac-sha256='+'0'.repeat(64));
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(forged)).status,401);
  const badNonce=context({consume_nonce:'not-a-uuid'});
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(badNonce))).status,422);
  const wrongRun=context({github_run_id:'33262992820'});
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(wrongRun))).status,422);
  const wrongAttempt=context({github_run_attempt:2});
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(wrongAttempt))).status,422);
  const reversed=context(); reversed.request_expires_at=new Date(Date.parse(reversed.requested_at)-1).toISOString();
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(reversed))).status,422);
  const stale=context({requested_at:new Date(Date.now()-120_000).toISOString(),request_expires_at:new Date(Date.now()-60_000).toISOString()});
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(stale))).status,410);
  const wrongExpiry=context({approval_expires_at:new Date(Date.now()+180_000).toISOString()});
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(wrongExpiry))).status,422);
  const expiredAt = new Date(Date.now()-1_000).toISOString();
  const exactExpired = context({
    requested_at:new Date(Date.now()-2_000).toISOString(),
    approval_expires_at:expiredAt,
  });
  assert.equal((await new ApprovalLedger({storage:new Storage(record({expires_at:expiredAt}))},env).fetch(signedRequest(exactExpired))).status,410);
  const wrongDigest=context(); wrongDigest.target={...wrongDigest.target,target_digest:`sha256:${'0'.repeat(64)}`};
  assert.equal((await new ApprovalLedger({storage:new Storage(record())},env).fetch(signedRequest(wrongDigest))).status,422);
});

test('no reset, issue or delete endpoint exists and historical consumed backfill cannot rerun', async () => {
  const ledger=new ApprovalLedger({storage:new Storage(record({state:'CONSUMED',consumption_id:'historical'}))},env);
  for (const method of ['GET','PUT','DELETE','PATCH']) {
    const response=await ledger.fetch(new Request('https://ledger.invalid/v1/approvals/consume',{method}));
    assert.notEqual(response.status,201);
  }
  assert.equal((await ledger.fetch(signedRequest(context(),'https://ledger.invalid/v1/approvals/readback'))).status,404);
  assert.equal((await ledger.fetch(signedRequest(context()))).status,409);
});

test('queued transaction cannot consume after request or approval expiry', async () => {
  const originalNow = Date.now;
  const base = originalNow();
  const expiresAt = new Date(base + 1_000).toISOString();
  const input = context({
    requested_at: new Date(base - 1_000).toISOString(),
    request_expires_at: expiresAt,
    approval_expires_at: expiresAt,
  });
  const storage = new Storage(record({expires_at: expiresAt}));
  let reads = 0;
  Date.now = () => reads++ === 0 ? base : base + 2_000;
  try {
    const response = await new ApprovalLedger({storage}, env).fetch(signedRequest(input));
    assert.equal(response.status, 410);
    assert.equal(storage.map.get('approval').state, 'ACTIVE');
  } finally {
    Date.now = originalNow;
  }
});

test('top-level worker and Durable Object reject declared and chunked oversized bodies before routing or storage', async () => {
  let routed = 0;
  const topEnv = {
    ...env,
    APPROVAL_LEDGER: {
      idFromName: value => value,
      get: () => ({fetch: async () => { routed += 1; return new Response(null, {status:204}); }}),
    },
  };
  const declared = new Request('https://ledger.invalid/v1/approvals/consume', {
    method:'POST', body:'{}', headers:{'content-type':'application/json','content-length':String(32 * 1024 + 1)},
  });
  assert.equal((await worker.fetch(declared, topEnv)).status, 413);
  assert.equal(routed, 0);

  const oversizedStream = () => new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(20 * 1024));
      controller.enqueue(new Uint8Array(20 * 1024));
      controller.close();
    },
  });
  const chunkedTop = new Request('https://ledger.invalid/v1/approvals/consume', {
    method:'POST', body:oversizedStream(), duplex:'half', headers:{'content-type':'application/json'},
  });
  assert.equal((await worker.fetch(chunkedTop, topEnv)).status, 413);
  assert.equal(routed, 0);

  let transactions = 0;
  const ledger = new ApprovalLedger({storage:{transaction:async () => { transactions += 1; }}}, env);
  const chunkedDo = new Request('https://ledger.invalid/v1/approvals/consume', {
    method:'POST', body:oversizedStream(), duplex:'half', headers:{'content-type':'application/json'},
  });
  assert.equal((await ledger.fetch(chunkedDo)).status, 413);
  assert.equal(transactions, 0);
});
