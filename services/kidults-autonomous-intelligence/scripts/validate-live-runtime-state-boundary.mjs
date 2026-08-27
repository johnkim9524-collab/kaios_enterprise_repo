#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (...parts) => path.join(ROOT, 'src', ...parts);
const worker = readFileSync(src('worker.ts'), 'utf8');
const routeBoundary = readFileSync(src('control-tower-gateway', 'route-boundary.ts'), 'utf8');

const forbiddenRuntimeImports = [
  './control-tower-gateway/control-tower-gateway.js',
  './control-tower-gateway/action-idempotency.js',
  './control-tower-gateway/action-lock.js',
  './executive-orchestration/execution-orchestrator.js',
  './executive-orchestration/idempotency.js',
  './executive-orchestration/execution-lock.js',
];

const durableStateModules = [
  ['control-tower-gateway/action-idempotency.ts', 'DURABLE_ACTION_IDEMPOTENCY_STORE_REQUIRED'],
  ['control-tower-gateway/action-lock.ts', 'DURABLE_ACTION_LOCK_STORE_REQUIRED'],
  ['executive-orchestration/idempotency.ts', 'DURABLE_IDEMPOTENCY_STORE_REQUIRED'],
  ['executive-orchestration/execution-lock.ts', 'DURABLE_EXECUTION_LOCK_STORE_REQUIRED'],
];

const findings = [];
for (const specifier of forbiddenRuntimeImports) {
  if (worker.includes(specifier)) findings.push(`LIVE_WORKER_IMPORTS_EPHEMERAL_STATE:${specifier}`);
}
if (!worker.includes("./control-tower-gateway/route-boundary.js")) {
  findings.push('PURE_GATEWAY_ROUTE_BOUNDARY_NOT_USED');
}
if (/\bnew\s+(?:Map|Set)\s*\(/.test(routeBoundary)) findings.push('ROUTE_BOUNDARY_CONTAINS_PROCESS_MEMORY_STATE');
if (/^\s*import\s/m.test(routeBoundary)) findings.push('ROUTE_BOUNDARY_MUST_HAVE_ZERO_IMPORTS');

for (const [relative, requiredMarker] of durableStateModules) {
  const source = readFileSync(src(...relative.split('/')), 'utf8');
  if (/\bnew\s+(?:Map|Set)\s*\(/.test(source)) findings.push(`PROCESS_MEMORY_STATE_FORBIDDEN:${relative}`);
  if (!source.includes(requiredMarker)) findings.push(`DURABLE_FAIL_CLOSED_MARKER_MISSING:${relative}`);
}

const receipt = {
  gate: 'LIVE_RUNTIME_DURABLE_STATE_BOUNDARY',
  status: findings.length ? 'HOLD' : 'PASS',
  live_worker: 'src/worker.ts',
  route_boundary: 'src/control-tower-gateway/route-boundary.ts',
  durable_state_modules: durableStateModules.map(([relative]) => `src/${relative}`),
  forbidden_ephemeral_modules: forbiddenRuntimeImports,
  findings,
  production: 'HOLD',
};
console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exitCode = 1;
