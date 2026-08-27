#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = path.join(ROOT, 'src', 'worker.ts');
const routeBoundaryPath = path.join(ROOT, 'src', 'control-tower-gateway', 'route-boundary.ts');
const worker = readFileSync(workerPath, 'utf8');
const routeBoundary = readFileSync(routeBoundaryPath, 'utf8');

const forbiddenRuntimeImports = [
  './control-tower-gateway/control-tower-gateway.js',
  './control-tower-gateway/action-idempotency.js',
  './control-tower-gateway/action-lock.js',
  './executive-orchestration/execution-orchestrator.js',
  './executive-orchestration/idempotency.js',
  './executive-orchestration/execution-lock.js',
];

const findings = [];
for (const specifier of forbiddenRuntimeImports) {
  if (worker.includes(specifier)) findings.push(`LIVE_WORKER_IMPORTS_EPHEMERAL_STATE:${specifier}`);
}
if (!worker.includes("./control-tower-gateway/route-boundary.js")) {
  findings.push('PURE_GATEWAY_ROUTE_BOUNDARY_NOT_USED');
}
if (/\bnew\s+(?:Map|Set)\s*\(/.test(routeBoundary)) {
  findings.push('ROUTE_BOUNDARY_CONTAINS_PROCESS_MEMORY_STATE');
}
if (/^\s*import\s/m.test(routeBoundary)) {
  findings.push('ROUTE_BOUNDARY_MUST_HAVE_ZERO_IMPORTS');
}

const receipt = {
  gate: 'LIVE_RUNTIME_DURABLE_STATE_BOUNDARY',
  status: findings.length ? 'HOLD' : 'PASS',
  live_worker: 'src/worker.ts',
  route_boundary: 'src/control-tower-gateway/route-boundary.ts',
  forbidden_ephemeral_modules: forbiddenRuntimeImports,
  findings,
  production: 'HOLD',
};
console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exitCode = 1;
