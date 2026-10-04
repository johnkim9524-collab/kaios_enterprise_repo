import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createClaim,takeoverClaim,commitClaim,createAlias,canonicalClaimKey,claimDigest,
} from '../../../scripts/kidults/kpmo/lib/durable-canonical-claim-v1.mjs';

const key='sha256:'+'a'.repeat(64);
const receipt='sha256:'+'b'.repeat(64);
const sha='c'.repeat(40);
const ns='KIDULTS_PLATFORM_CONTINUOUS_ASSURANCE_V1';

test('one canonical leader commits and exact alias binds durably',()=>{
  const claim=createClaim({namespace:ns,canonicalKey:key,runId:'101',headSha:sha,nowMs:1000,leaseMs:60000});
  assert.equal(claim.pk,canonicalClaimKey({namespace:ns,canonicalKey:key}));
  const committed=commitClaim({claim,runId:'101',headSha:sha,receiptDigest:receipt,nowMs:2000});
  const alias=createAlias({claim:committed,aliasRunId:'102',headSha:sha,receiptDigest:receipt});
  assert.equal(alias.state,'DEDUPED_ALIAS');
  assert.equal(alias.canonical_run_id,'101');
  assert.match(claimDigest(committed),/^sha256:[0-9a-f]{64}$/);
});

test('active leader cannot be taken over',()=>{
  const claim=createClaim({namespace:ns,canonicalKey:key,runId:'101',headSha:sha,nowMs:1000,leaseMs:60000});
  assert.throws(()=>takeoverClaim({claim,runId:'102',headSha:sha,nowMs:2000,leaseMs:60000}),/CANONICAL_LEASE_STILL_ACTIVE/);
});
test('expired leader supports one monotonic takeover epoch',()=>{
  const claim=createClaim({namespace:ns,canonicalKey:key,runId:'101',headSha:sha,nowMs:1000,leaseMs:60000});
  const next=takeoverClaim({claim,runId:'102',headSha:sha,nowMs:61001,leaseMs:60000});
  assert.equal(next.owner_run_id,'102');
  assert.equal(next.lease_epoch,2);
  assert.throws(()=>commitClaim({claim,runId:'101',headSha:sha,receiptDigest:receipt,nowMs:61001}),/CANONICAL_COMMIT_LEASE_EXPIRED/);
});

test('alias replay cannot bind a different digest, sha, or leader run',()=>{
  const claim=createClaim({namespace:ns,canonicalKey:key,runId:'101',headSha:sha,nowMs:1000,leaseMs:60000});
  const committed=commitClaim({claim,runId:'101',headSha:sha,receiptDigest:receipt,nowMs:2000});
  assert.throws(()=>createAlias({claim:committed,aliasRunId:'102',headSha:'d'.repeat(40),receiptDigest:receipt}),/CANONICAL_ALIAS_BINDING_INVALID/);
  assert.throws(()=>createAlias({claim:committed,aliasRunId:'102',headSha:sha,receiptDigest:'sha256:'+'e'.repeat(64)}),/CANONICAL_ALIAS_BINDING_INVALID/);
  assert.throws(()=>createAlias({claim:committed,aliasRunId:'101',headSha:sha,receiptDigest:receipt}),/CANONICAL_ALIAS_RUN_INVALID/);
});

test('invalid canonical identity and short leases fail closed',()=>{
  assert.throws(()=>canonicalClaimKey({namespace:'bad space',canonicalKey:key}),/CANONICAL_NAMESPACE_INVALID/);
  assert.throws(()=>createClaim({namespace:ns,canonicalKey:key,runId:'101',headSha:sha,nowMs:1000,leaseMs:1000}),/CANONICAL_LEASE_INVALID/);
});
