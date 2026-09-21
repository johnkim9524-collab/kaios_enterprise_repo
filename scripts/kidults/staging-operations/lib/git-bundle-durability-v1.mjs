import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { canonical, sha256 } from './canonical-v1.mjs';

export const buildGitBundleManifest = ({ repositoryRoot, ref, expectedSha, outputDirectory, signer, verifier, immutableStore }) => {
  const actualSha = execFileSync('/usr/bin/git', ['-C', repositoryRoot, 'rev-parse', ref], { encoding: 'utf8' }).trim();
  if (actualSha !== expectedSha) throw new Error('PROTECTED_MAIN_SHA_MISMATCH');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const bundlePath = path.join(outputDirectory, 'repository.bundle');
  execFileSync('/usr/bin/git', ['-C', repositoryRoot, 'bundle', 'create', bundlePath, ref]);
  execFileSync('/usr/bin/git', ['bundle', 'verify', bundlePath], { stdio: ['ignore', 'ignore', 'pipe'] });
  const bundle = fs.readFileSync(bundlePath);
  const manifest = {
    format: 'kidults-git-bundle-manifest-v1', ref, protected_sha: actualSha,
    bundle_sha256: sha256(bundle), bundle_bytes: bundle.length,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
  const signature = signer(Buffer.from(canonical(manifest)));
  if (!verifier(Buffer.from(canonical(manifest)), signature)) throw new Error('KMS_SIGNATURE_VERIFY_FAILED');
  const key = `git-bundles/${actualSha}/${manifest.bundle_sha256.slice(7)}.bundle`;
  const uploaded = immutableStore.put(key, bundle.toString('base64'), {
    object_lock: 'COMPLIANCE', retention_years: 10, sse: 'aws:kms',
    manifest: canonical(manifest), signature: signature.toString('base64'),
  });
  const readback = immutableStore.get(key);
  if (sha256(Buffer.from(readback.value, 'base64')) !== manifest.bundle_sha256) throw new Error('BUNDLE_READBACK_MISMATCH');
  return { manifest, key, version_id: uploaded.version_id, signature_verified: true, readback_verified: true };
};
