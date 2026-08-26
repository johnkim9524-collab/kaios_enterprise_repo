#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PAIRS=Object.freeze([
  ['scripts/kidults/portal/runtime/projection-store.js','apps/kidults-enterprise-staging/public/portal-r001/projection-store.js'],
  ['scripts/kidults/portal/runtime/proof-product-admission.js','apps/kidults-enterprise-staging/public/portal-r001/proof-product-admission.js'],
  ['scripts/kidults/portal/runtime/proof-product-schema-validator.js','apps/kidults-enterprise-staging/public/portal-r001/proof-product-schema-validator.js']
]);
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');

export function assertTrustedPortalRuntimeParity(root=process.cwd()){
  const receipts=[];
  for(const [trusted,portal] of PAIRS){
    const trustedPath=path.resolve(root,trusted);
    const portalPath=path.resolve(root,portal);
    if(!fs.existsSync(trustedPath)||!fs.existsSync(portalPath))throw new Error(`TRUSTED_PORTAL_RUNTIME_FILE_MISSING:${trusted}:${portal}`);
    const trustedBytes=fs.readFileSync(trustedPath);
    const portalBytes=fs.readFileSync(portalPath);
    const trustedSha=digest(trustedBytes);
    const portalSha=digest(portalBytes);
    if(trustedSha!==portalSha)throw new Error(`TRUSTED_PORTAL_RUNTIME_PARITY_MISMATCH:${trusted}:${portal}`);
    receipts.push(Object.freeze({trusted,portal,sha256:trustedSha}));
  }
  return Object.freeze({state:'VERIFIED_PASS',pair_count:receipts.length,pairs:Object.freeze(receipts),production:'HOLD',public:'HOLD',g5:'HOLD'});
}

if(import.meta.url===`file://${process.argv[1]}`){
  try{process.stdout.write(`${JSON.stringify(assertTrustedPortalRuntimeParity(),null,2)}\n`)}
  catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1}
}
