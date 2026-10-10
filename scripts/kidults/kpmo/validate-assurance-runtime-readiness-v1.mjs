import fs from 'node:fs';
import {verifyAutonomousRuntimeReadiness} from './lib/assurance-full-proof-v1.mjs';
const [proofPath] = process.argv.slice(2);
if (!proofPath || !/^[a-f0-9]{40}$/.test(process.env.KPMO_SOURCE_SHA || '')) {
  throw new Error('ASSURANCE_RUNTIME_READINESS_ARGUMENTS');
}
const result = verifyAutonomousRuntimeReadiness(JSON.parse(fs.readFileSync(proofPath, 'utf8')), process.env.KPMO_SOURCE_SHA);
console.log(JSON.stringify({...result, scope:result.scope, production:'HOLD',public:'HOLD',g5:'HOLD'}));
