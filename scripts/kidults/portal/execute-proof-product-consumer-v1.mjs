#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {admitProofProductProjection} from '../../../apps/kidults-enterprise-staging/public/portal-r001/proof-product-admission.js';

const SURFACES={
  PORTAL_RENDER:'PUBLIC_DISPLAY',
  PUBLIC_API_RESPONSE:'API_REDISTRIBUTION',
  EXPORT:'API_REDISTRIBUTION'
};

function parseArgs(argv){
  const args={};
  for(let index=0;index<argv.length;index+=1){
    const key=argv[index];
    if(!key.startsWith('--'))throw new Error(`unexpected argument: ${key}`);
    const value=argv[index+1];
    if(value===undefined||value.startsWith('--'))throw new Error(`missing value for ${key}`);
    args[key.slice(2)]=value;
    index+=1;
  }
  return args;
}

export function consumeProofProductProjection(projection,{surface}={}){
  if(!Object.hasOwn(SURFACES,surface))throw new Error(`unsupported surface: ${surface}`);
  // No API/export release route or signed control-plane capability exists yet.
  // Caller-supplied clock/release strings are intentionally ignored.
  const admission=admitProofProductProjection(projection,{
    surface,
    purpose:SURFACES[surface],
    trustedNow:null,
    clockAuthority:'NO_BOUND_CONTROL_PLANE',
    releaseAuthority:'HOLD'
  });
  return Object.freeze({
    ok:admission.accepted,
    state:admission.accepted?(admission.state_only?'NO_PROJECTION':'ADMITTED'):'INVALID',
    receipt:admission.receipt,
    payload:admission.accepted&&!admission.state_only?admission.payload:null,
    production:'HOLD',
    public:'HOLD',
    g5:'HOLD'
  });
}

function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.projection||!args.surface){
    throw new Error('required: --projection FILE --surface PORTAL_RENDER|PUBLIC_API_RESPONSE|EXPORT');
  }
  const projectionPath=path.resolve(process.cwd(),args.projection);
  const projection=JSON.parse(fs.readFileSync(projectionPath,'utf8'));
  // Normal execution stays HOLD. No CLI flag may self-authorize approved output.
  const result=consumeProofProductProjection(projection,{surface:args.surface});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
  return result.ok?0:2;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{process.exitCode=main()}catch(error){
    process.stderr.write(`${JSON.stringify({ok:false,state:'INVALID',error:error.message,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2)}\n`);
    process.exitCode=2;
  }
}
