import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonical, sha256 } from './canonical-v1.mjs';

export class MockImmutableStore {
  constructor({ failUpload = false, corruptReadback = false } = {}) {
    this.failUpload = failUpload;
    this.corruptReadback = corruptReadback;
    this.objects = new Map();
  }
  put(key, value, metadata) {
    if (this.failUpload) throw new Error('S3_UPLOAD_FAILED');
    if (this.objects.has(key)) throw new Error('OBJECT_ALREADY_EXISTS');
    this.objects.set(key, { value, metadata });
    return { version_id: sha256({ key, value }).slice(7, 39) };
  }
  get(key) {
    const stored = this.objects.get(key);
    if (!stored) throw new Error('OBJECT_NOT_FOUND');
    return this.corruptReadback ? { ...stored, value: `${stored.value}corrupt` } : stored;
  }
}

export class AwsDurabilityBoundary {
  constructor({ store, signer, verifier, mainSha, failSign = false }) {
    Object.assign(this, { store, signer, verifier, mainSha, failSign });
  }

  seal(evidence) {
    const evidenceBody = canonical(evidence);
    const evidenceDigest = sha256(evidenceBody);
    const manifest = {
      format: 'kidults-staging-evidence-bundle-v1',
      protected_main_sha: this.mainSha,
      evidence_digest: evidenceDigest,
      object_lock: 'COMPLIANCE',
      retention_years: 10,
      sse: 'aws:kms',
      production: 'HOLD', public: 'HOLD', g5: 'HOLD',
    };
    try {
      if (!/^[0-9a-f]{40}$/.test(this.mainSha)) throw new Error('PROTECTED_MAIN_SHA_INVALID');
      if (this.failSign) throw new Error('KMS_SIGN_FAILED');
      const signature = this.signer(Buffer.from(canonical(manifest)));
      const key = `staging-operations/${evidence.task_id}/${evidenceDigest.slice(7)}.json`;
      const payload = canonical({ evidence, manifest, signature: signature.toString('base64') });
      const uploaded = this.store.put(key, payload, { object_lock: 'COMPLIANCE', retention_years: 10, sse: 'aws:kms' });
      const readback = this.store.get(key);
      if (sha256(readback.value) !== sha256(payload)) throw new Error('READBACK_DIGEST_MISMATCH');
      if (!this.verifier(Buffer.from(canonical(manifest)), signature)) throw new Error('SIGNATURE_VERIFY_FAILED');
      return {
        verified: true,
        evidence_uri: `evidence://staging/${key}`,
        receipt_digest: sha256(payload),
        version_id: uploaded.version_id,
        signature_verified: true,
        readback_verified: true,
        state: 'COMPLETE_VERIFIED',
      };
    } catch (error) {
      return {
        verified: false,
        evidence_uri: `evidence://staging/pending/${evidence.task_id}`,
        receipt_digest: evidenceDigest,
        signature_verified: false,
        readback_verified: false,
        state: 'EVIDENCE_PENDING',
        reason: error.message,
      };
    }
  }
}

export const ephemeralEd25519 = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    signer: bytes => sign(null, bytes, privateKey),
    verifier: (bytes, signature) => verify(null, bytes, publicKey, signature),
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
};

export const deterministicFixtureEd25519 = () => {
  const seed = createHash('sha256').update('KIDULTS-STAGING-SHADOW-FIXTURE-KEY-V1').digest();
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([pkcs8Prefix, seed]), format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);
  return {
    signer: bytes => sign(null, bytes, privateKey),
    verifier: (bytes, signature) => verify(null, bytes, publicKey, signature),
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
    fixture_only: true,
  };
};
