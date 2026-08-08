import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));

function run(args) {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', ...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: process.env.CI || '1' },
  });
}

console.log(`KIDULTS autonomous intelligence runtime smoke — ${pkg.version}`);
run(['d1', 'migrations', 'apply', 'DB', '--local']);
run(['d1', 'execute', 'DB', '--local', '--command', 'SELECT COUNT(*) AS methodology_count FROM methodology_registry;', '--json']);
run(['d1', 'execute', 'DB', '--local', '--command', "SELECT value_json FROM autonomous_checkpoints WHERE key='visual_baseline';", '--json']);
console.log('KIDULTS autonomous runtime smoke PASS');
