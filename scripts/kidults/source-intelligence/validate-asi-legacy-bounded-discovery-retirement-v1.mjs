#!/usr/bin/env node
import fs from 'node:fs';

const workflowPath=process.argv[2]||'.github/workflows/kidults-asi-self-driving-control-loop-v1.yml';
const s=fs.readFileSync(workflowPath,'utf8');
const fail=m=>{throw new Error(m)};

for(const forbidden of [
  'asi-product-linked-live-v2.mjs',
  'validate-asi-product-linked-live-v2.mjs',
  'bounded-live-discovery.json'
]) if(s.includes(forbidden)) fail(`legacy bounded discovery still active: ${forbidden}`);

for(const required of [
  'asi-global-low-risk-discovery-v1.mjs',
  'validate-asi-global-low-risk-discovery-v1.mjs',
  'global-low-risk-discovery.json',
  'build-asi-proactive-source-pool-v1.mjs'
]) if(!s.includes(required)) fail(`Global Any-Site default path missing: ${required}`);

console.log(JSON.stringify({status:'PASS',legacy_bounded_discovery:'RETIRED_FROM_DEFAULT_EXECUTION_PATH',default_discovery:'GLOBAL_ANY_SITE_V2',production:'HOLD'},null,2));
