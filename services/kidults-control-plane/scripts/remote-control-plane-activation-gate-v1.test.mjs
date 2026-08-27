import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateRemoteActivation } from './remote-control-plane-activation-gate-v1.mjs';

const HEAD = 'a'.repeat(40);
const IDS = [
  'remote-postgres-provisioning','remote-postgres-rls-concurrency','remote-postgres-pitr','governed-d1-projector-deployment',
  'legacy-d1-writer-cutover','remote-rollback','exact-head-checks','post-merge-main-revalidation'
];
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'kaios-remote-evidence-'));
  const evidenceDir = path.join(root, 'receipts');
  await mkdir(evidenceDir);
  const entries = [];
  for (const id of IDS) {
    const file = `${id}.json`;
    const raw = Buffer.from(`${JSON.stringify({ id, status:'PASS', head_sha:HEAD, production:'HOLD', public_release:'HOLD', g5:'HOLD' })}\n`);
    await writeFile(path.join(evidenceDir, file), raw);
    entries.push({ id, file, sha256: sha256(raw) });
  }
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify({ version:'remote-control-plane-evidence-manifest-v1', head_sha:HEAD, receipts:entries })}\n`);
  return { root, evidenceDir, manifestPath, entries, cleanup: () => rm(root,{recursive:true,force:true}) };
}

test('complete digest-bound exact-head bundle passes', async () => {
  const f=await fixture(); try {
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD});
    assert.equal(r.ok,true); assert.equal(r.verified_receipts.length,8); assert.match(r.manifest_sha256,/^[a-f0-9]{64}$/);
  } finally { await f.cleanup(); }
});

test('stale head fails closed', async () => {
  const f=await fixture(); try {
    assert.deepEqual(evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:'b'.repeat(40)}),{ok:false,reason:'REMOTE_EVIDENCE_MANIFEST_STALE_HEAD'});
  } finally { await f.cleanup(); }
});

test('tampered receipt fails digest binding', async () => {
  const f=await fixture(); try {
    await writeFile(path.join(f.evidenceDir,f.entries[0].file),`${JSON.stringify({id:IDS[0],status:'PASS',head_sha:HEAD,tampered:true})}\n`);
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'RECEIPT_DIGEST_MISMATCH');
  } finally { await f.cleanup(); }
});

test('path traversal fails closed', async () => {
  const f=await fixture(); try {
    const m={version:'remote-control-plane-evidence-manifest-v1',head_sha:HEAD,receipts:[...f.entries]};
    m.receipts[0]={...m.receipts[0],file:'../escape.json'}; await writeFile(f.manifestPath,`${JSON.stringify(m)}\n`);
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'RECEIPT_PATH_ESCAPE');
  } finally { await f.cleanup(); }
});

test('receipt cannot self-authorize Production/Public/G5', async () => {
  const f=await fixture(); try {
    const id=IDS[2], file=`${id}.json`;
    const raw=Buffer.from(`${JSON.stringify({id,status:'PASS',head_sha:HEAD,production:'AUTHORIZED',public_release:'HOLD',g5:'HOLD'})}\n`);
    await writeFile(path.join(f.evidenceDir,file),raw);
    const m={version:'remote-control-plane-evidence-manifest-v1',head_sha:HEAD,receipts:f.entries.map(e=>e.id===id?{...e,sha256:sha256(raw)}:e)};
    await writeFile(f.manifestPath,`${JSON.stringify(m)}\n`);
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'FORBIDDEN_PRODUCTION_AUTHORIZATION_IN_EVIDENCE');
  } finally { await f.cleanup(); }
});
