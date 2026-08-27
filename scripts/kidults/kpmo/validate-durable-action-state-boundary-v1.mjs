#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  worker: 'services/kidults-autonomous-intelligence/src/worker.ts',
  a29Idem: 'services/kidults-autonomous-intelligence/src/executive-orchestration/idempotency.ts',
  a29Lock: 'services/kidults-autonomous-intelligence/src/executive-orchestration/execution-lock.ts',
  a31Idem: 'services/kidults-autonomous-intelligence/src/control-tower-gateway/action-idempotency.ts',
  a31Lock: 'services/kidults-autonomous-intelligence/src/control-tower-gateway/action-lock.ts',
};
const text = Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.readFileSync(p,'utf8')]));
const failures=[];
const req=(name,condition)=>{if(!condition)failures.push(name)};
for (const key of ['a29Idem','a29Lock','a31Idem','a31Lock']) {
  req(`${key}:process-memory-map-forbidden`, !/new\s+Map\s*</.test(text[key]) && !/new\s+Map\s*\(/.test(text[key]));
  req(`${key}:durable-backend-required`, text[key].includes('POSTGRESQL_DURABLE_BACKEND_REQUIRED'));
  req(`${key}:runtime-not-ready`, text[key].includes('RUNTIME_READY = false'));
  req(`${key}:fail-closed-error`, /DURABLE_[A-Z_]+BACKEND_REQUIRED/.test(text[key]));
}
req('worker:gateway-route-fail-closed', text.worker.includes('isControlTowerRoute(url.pathname) || isGatewayRoute(url.pathname)'));
req('worker:gateway-423', text.worker.includes('},423)'));
req('worker:no-live-gateway-handler-import', !text.worker.includes('handleGatewayRequest'));
req('worker:durable-runtime-reason', text.worker.includes('DURABLE_ACTION_RUNTIME_EXIST'));
const receipt={id:'kidults-durable-action-state-boundary-v1',state:failures.length?'VERIFIED_FAIL':'VERIFIED_PASS',system_of_record:'POSTGRESQL',d1_role:'READ_MODEL_ONLY',a29_runtime_action_state:'FAIL_CLOSED_UNTIL_POSTGRESQL_BACKEND',a31_runtime_action_state:'FAIL_CLOSED_UNTIL_POSTGRESQL_BACKEND',control_tower_action_routes:'HTTP_423_HOLD',process_memory_idempotency_or_lock_in_deployable_runtime:'FORBIDDEN',failures,production:'HOLD',public_release:'HOLD',g5:'HOLD'};
console.log(JSON.stringify(receipt,null,2));
if(failures.length)process.exit(1);
