// Read-only CLI; the imported policy has no I/O authority.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LOCK_DIRECTORIES, validateDependencyLock} from './security-dependency-lock-v1.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
try {
  const results = LOCK_DIRECTORIES.map(directory => {
    const read = name => JSON.parse(fs.readFileSync(path.join(root, directory, name), 'utf8'));
    return {directory, ...validateDependencyLock(read('package.json'), read('package-lock.json'))};
  });
  console.log(JSON.stringify({suite: 'SECURITY_DEPENDENCY_LOCK_V1', state: 'VERIFIED_PASS', results}, null, 2));
} catch (error) {
  console.error(JSON.stringify({suite: 'SECURITY_DEPENDENCY_LOCK_V1', state: 'VERIFIED_FAIL', reason: error.message}));
  process.exitCode = 1;
}
