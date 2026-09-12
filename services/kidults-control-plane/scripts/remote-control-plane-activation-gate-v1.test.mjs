import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateRemoteActivation } from './remote-control-plane-activation-gate-v1.mjs';

const HEAD = 'a'.repeat(40);
const IDS = [
  'remote-postgres-provisioning','remote-postgres-rls-concurrency','remote-postgres-pitr','governed-d1-projector-deployment',
  'legacy-d1-writer-cutover','remote-rollback','exact-head-checks','post-merge-main-revalidation'
];
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const canonicalJson = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
};

function receipt(id) {
  return {
    id,
    receipt_type: id,
    schema_version: '1.0.0',
    status: 'PASS',
    head_sha: HEAD,
    observed_at: '2026-08-30T00:00:00.000Z',
    producer_workflow_path: '.github/workflows/p0-remote-postgres-persistence-pitr.yml',
    producer_run_id: 101,
    artifact_digest: `sha256:${'1'.repeat(64)}`,
    authority: 'POSTGRESQL_SYSTEM_OF_RECORD',
    authority_receipt_digest: `sha256:${'2'.repeat(64)}`,
    production: 'HOLD',
    public_release: 'HOLD',
    g5: 'HOLD',
  };
}

async function writeManifest(fixtureValue, receipts = fixtureValue.entries) {
  const signed = { version:'remote-control-plane-evidence-manifest-v1', head_sha:HEAD, receipts };
  const signature = sign(null, Buffer.from(canonicalJson(signed)), fixtureValue.privateKey).toString('base64');
  await writeFile(fixtureValue.manifestPath, `${JSON.stringify({ ...signed, signature_algorithm:'Ed25519', signature })}\n`);
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'kaios-remote-evidence-'));
  const evidenceDir = path.join(root, 'receipts');
  await mkdir(evidenceDir);
  const entries = [];
  for (const id of IDS) {
    const file = `${id}.json`;
    const raw = Buffer.from(`${JSON.stringify(receipt(id))}\n`);
    await writeFile(path.join(evidenceDir, file), raw);
    entries.push({ id, file, sha256: sha256(raw) });
  }
  const manifestPath = path.join(root, 'manifest.json');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const value = { root, evidenceDir, manifestPath, entries, publicKey, privateKey, cleanup: () => rm(root,{recursive:true,force:true}) };
  await writeManifest(value);
  return value;
}

test('complete digest-bound exact-head bundle passes', async () => {
  const f=await fixture(); try {
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD,trustedPublicKeyPem:f.publicKey});
    assert.equal(r.ok,true); assert.equal(r.verified_receipts.length,8); assert.match(r.manifest_sha256,/^[a-f0-9]{64}$/);
  } finally { await f.cleanup(); }
});

test('stale head fails closed', async () => {
  const f=await fixture(); try {
    assert.deepEqual(evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:'b'.repeat(40),trustedPublicKeyPem:f.publicKey}),{ok:false,reason:'REMOTE_EVIDENCE_MANIFEST_STALE_HEAD'});
  } finally { await f.cleanup(); }
});

test('tampered receipt fails digest binding', async () => {
  const f=await fixture(); try {
    await writeFile(path.join(f.evidenceDir,f.entries[0].file),`${JSON.stringify({id:IDS[0],status:'PASS',head_sha:HEAD,tampered:true})}\n`);
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD,trustedPublicKeyPem:f.publicKey});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'RECEIPT_DIGEST_MISMATCH');
  } finally { await f.cleanup(); }
});

test('path traversal fails closed', async () => {
  const f=await fixture(); try {
    const entries=[...f.entries]; entries[0]={...entries[0],file:'../escape.json'}; await writeManifest(f, entries);
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD,trustedPublicKeyPem:f.publicKey});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'RECEIPT_PATH_ESCAPE');
  } finally { await f.cleanup(); }
});

test('receipt cannot self-authorize Production/Public/G5', async () => {
  const f=await fixture(); try {
    const id=IDS[2], file=`${id}.json`;
    const raw=Buffer.from(`${JSON.stringify({ ...receipt(id), production:'AUTHORIZED' })}\n`);
    await writeFile(path.join(f.evidenceDir,file),raw);
    await writeManifest(f, f.entries.map(e=>e.id===id?{...e,sha256:sha256(raw)}:e));
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD,trustedPublicKeyPem:f.publicKey});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'RECEIPT_SCHEMA_OR_AUTHORITY_INVALID');
  } finally { await f.cleanup(); }
});

test('symlink receipt outside the evidence root fails closed', async () => {
  const f=await fixture(); try {
    const id=IDS[0], outside=path.join(f.root,'outside.json');
    const raw=Buffer.from(`${JSON.stringify(receipt(id))}\n`);
    await writeFile(outside,raw);
    await rm(path.join(f.evidenceDir,`${id}.json`));
    await symlink(outside,path.join(f.evidenceDir,`${id}.json`));
    await writeManifest(f, f.entries.map(e=>e.id===id?{...e,sha256:sha256(raw)}:e));
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD,trustedPublicKeyPem:f.publicKey});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'RECEIPT_UNREADABLE');
  } finally { await f.cleanup(); }
});

test('duplicate, extra and schema-less receipt sets fail closed', async () => {
  for (const mutate of [
    (entries)=>[...entries.slice(0,-1),entries[0]],
    (entries)=>[...entries,{id:'unexpected',file:'unexpected.json',sha256:'0'.repeat(64)}],
  ]) {
    const f=await fixture(); try {
      await writeManifest(f, mutate(f.entries));
      const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD,trustedPublicKeyPem:f.publicKey});
      assert.equal(r.ok,false); assert.equal(r.reason,'REMOTE_EVIDENCE_MANIFEST_RECEIPT_SET_INVALID');
    } finally { await f.cleanup(); }
  }
  const f=await fixture(); try {
    const id=IDS[1], raw=Buffer.from(`${JSON.stringify({id,status:'PASS',head_sha:HEAD})}\n`);
    await writeFile(path.join(f.evidenceDir,`${id}.json`),raw);
    await writeManifest(f,f.entries.map(e=>e.id===id?{...e,sha256:sha256(raw)}:e));
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:HEAD,trustedPublicKeyPem:f.publicKey});
    assert.equal(r.ok,false); assert.equal(r.invalid[0].reason,'RECEIPT_SCHEMA_OR_AUTHORITY_INVALID');
  } finally { await f.cleanup(); }
});

test('manifest signature is mandatory and tamper evident', async () => {
  const f=await fixture(); try {
    const raw=JSON.parse(await (await import('node:fs/promises')).readFile(f.manifestPath,'utf8'));
    raw.head_sha='b'.repeat(40);
    await writeFile(f.manifestPath,`${JSON.stringify(raw)}\n`);
    const r=evaluateRemoteActivation({evidenceDir:f.evidenceDir,manifestPath:f.manifestPath,expectedHeadSha:'b'.repeat(40),trustedPublicKeyPem:f.publicKey});
    assert.equal(r.ok,false); assert.equal(r.reason,'REMOTE_EVIDENCE_MANIFEST_SIGNATURE_INVALID');
  } finally { await f.cleanup(); }
});
