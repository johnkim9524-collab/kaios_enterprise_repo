#!/usr/bin/env node
import fs from 'node:fs';

const REGISTRY_PATH='coordination/kidults/runtime/kir-module-registry-v1.json';
const READINESS_PATH='coordination/kidults/market/current-sold-value-chain-readiness-v1.json';
const fail=code=>{throw new Error(code);};
const req=(value,code)=>{if(!value)fail(code);};

export function validateKirReadinessStructure(registry, readiness) {
  req(Array.isArray(registry?.modules) && registry.modules.length > 0, 'KIR_RACI_MODULES_REQUIRED');
  req(Array.isArray(readiness?.stages), 'KIR_RACI_STAGES_REQUIRED');
  req(readiness.stages.length === registry.modules.length, 'KIR_RACI_STAGE_CARDINALITY');

  const expected = new Map();
  for (const module of registry.modules) {
    req(typeof module?.id === 'string' && module.id, 'KIR_RACI_MODULE_ID');
    req(typeof module?.source_stage === 'string' && module.source_stage, `KIR_RACI_SOURCE_STAGE:${module.id}`);
    req(typeof module?.owner === 'string' && module.owner, `KIR_RACI_OWNER:${module.id}`);
    req(typeof module?.runtime_owner === 'string' && module.runtime_owner, `KIR_RACI_RUNTIME_OWNER:${module.id}`);
    req(!expected.has(module.source_stage), `KIR_RACI_DUPLICATE_MODULE_SOURCE_STAGE:${module.source_stage}`);
    expected.set(module.source_stage, module);
  }

  const seen = new Set();
  for (const stage of readiness.stages) {
    req(typeof stage?.stage === 'string' && stage.stage, 'KIR_RACI_STAGE_ID');
    req(!seen.has(stage.stage), `KIR_RACI_DUPLICATE_READINESS_STAGE:${stage.stage}`);
    seen.add(stage.stage);
    const module = expected.get(stage.stage);
    req(module, `KIR_RACI_EXTRA_READINESS_STAGE:${stage.stage}`);
    req(stage.owner === module.owner, `KIR_RACI_STAGE_OWNER_DRIFT:${module.id}`);
    req(typeof stage.runtime_owner === 'string' && stage.runtime_owner, `KIR_RACI_STAGE_RUNTIME_OWNER_MISSING:${module.id}`);
    req(stage.runtime_owner === module.runtime_owner, `KIR_RACI_STAGE_RUNTIME_OWNER_DRIFT:${module.id}`);
  }

  for (const [stage] of expected) req(seen.has(stage), `KIR_RACI_STAGE_MISSING:${stage}`);
  return {
    id:'kidults-kir-readiness-structure-validation-v1',
    state:'VERIFIED_PASS',
    module_count:registry.modules.length,
    stage_count:readiness.stages.length,
    exact_stage_set:true,
    explicit_runtime_owner_binding:true,
    production:'HOLD',
    public:'HOLD',
    g5:'HOLD'
  };
}

function selfTest(){
  const registry={modules:[
    {id:'A',source_stage:'STAGE_A',owner:'TRACK_A',runtime_owner:'ASI'},
    {id:'B',source_stage:'STAGE_B',owner:'TRACK_B',runtime_owner:'TRACK_B'}
  ]};
  const good={stages:[
    {stage:'STAGE_A',owner:'TRACK_A',runtime_owner:'ASI'},
    {stage:'STAGE_B',owner:'TRACK_B',runtime_owner:'TRACK_B'}
  ]};
  validateKirReadinessStructure(registry,good);
  const cases=[
    {id:'missing-runtime-owner',mutate:x=>{delete x.stages[0].runtime_owner;},code:'KIR_RACI_STAGE_RUNTIME_OWNER_MISSING'},
    {id:'runtime-owner-drift',mutate:x=>{x.stages[0].runtime_owner='TRACK_A';},code:'KIR_RACI_STAGE_RUNTIME_OWNER_DRIFT'},
    {id:'duplicate-stage',mutate:x=>{x.stages[1].stage='STAGE_A';},code:'KIR_RACI_DUPLICATE_READINESS_STAGE'},
    {id:'extra-stage',mutate:x=>{x.stages[1].stage='STAGE_X';},code:'KIR_RACI_EXTRA_READINESS_STAGE'},
    {id:'missing-stage',mutate:x=>{x.stages.pop();},code:'KIR_RACI_STAGE_CARDINALITY'},
    {id:'owner-drift',mutate:x=>{x.stages[0].owner='KPMO';},code:'KIR_RACI_STAGE_OWNER_DRIFT'}
  ];
  for(const test of cases){
    const value=structuredClone(good);test.mutate(value);let rejected=false;
    try{validateKirReadinessStructure(registry,value);}catch(error){rejected=String(error.message).startsWith(test.code);}
    if(!rejected)fail(`KIR_RACI_SELF_TEST_ESCAPE:${test.id}`);
  }
  return {id:'kidults-kir-readiness-structure-self-test-v1',state:'VERIFIED_PASS',negative_cases:cases.length};
}

if(process.argv.includes('--self-test')){
  console.log(JSON.stringify(selfTest()));
}else{
  const registry=JSON.parse(fs.readFileSync(REGISTRY_PATH,'utf8'));
  const readiness=JSON.parse(fs.readFileSync(READINESS_PATH,'utf8'));
  console.log(JSON.stringify(validateKirReadinessStructure(registry,readiness),null,2));
}
