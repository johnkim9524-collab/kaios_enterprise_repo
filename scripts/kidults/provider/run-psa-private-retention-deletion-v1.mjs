import { resolve } from 'node:path';
import { createPsaPrivateFileStore, resolvePsaPrivateStoreRoot } from '../../../services/kidults-control-plane/src/psa-private-evaluation-store.mjs';
import { deleteExpiredPsaEvaluations } from '../../../services/kidults-control-plane/src/psa-private-evaluation.mjs';

const rootInput = process.env.PSA_PRIVATE_STORE_ROOT;
const keyInput = process.env.PSA_PRIVATE_STORE_KEY_B64;
if (!rootInput) throw new Error('PSA_PRIVATE_STORE_ROOT_REQUIRED');
if (!keyInput) throw new Error('PSA_PRIVATE_STORE_KEY_B64_REQUIRED');

const repository = resolve(process.cwd());
const root = await resolvePsaPrivateStoreRoot({ rootDir: rootInput, forbiddenRoot: repository });
const key = Buffer.from(keyInput, 'base64');
if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== keyInput.replace(/=+$/, '')) {
  throw new Error('PSA_PRIVATE_STORE_KEY_B64_INVALID');
}

const now = new Date();
const store = createPsaPrivateFileStore({ rootDir: root, key, now: () => now });
const receipt = await deleteExpiredPsaEvaluations({ privateStore: store, now });
process.stdout.write(`${JSON.stringify({
  ...receipt,
  runner_id: 'KIDULTS_PSA_PRIVATE_RETENTION_DELETION_V1',
  executed_at: now.toISOString(),
  store_root_disclosed: false,
  key_persisted: false,
  production: 'HOLD'
}, null, 2)}\n`);
