import {spawnSync} from 'node:child_process';
const suites=[
  'scripts/kidults/internalization/validate-rights-intelligence-policy-v1.mjs',
  'scripts/kidults/internalization/validate-provider-internalization-matrix-v1.mjs',
  'scripts/kidults/internalization/validate-provider-removal-simulation-v1.mjs',
  'scripts/kidults/internalization/validate-minimum-external-dependency-negotiation-v1.mjs',
  'scripts/kidults/internalization/validate-provider-commercial-rights-ledger-v1.mjs',
  'scripts/kidults/internalization/validate-provider-operating-admission-gate-v1.mjs',
  'scripts/kidults/internalization/validate-partner-pre-send-internalization-gate-v1.mjs',
  'scripts/kidults/internalization/validate-provider-removal-baseline-v1.mjs'
];
const failures=[];
for(const s of suites){
  const r=spawnSync(process.execPath,[s],{stdio:'inherit'});
  if(r.status!==0) failures.push(s);
}
if(failures.length){console.error(`Phase2 failures: ${failures.join(', ')}`);process.exit(1);}
console.log(JSON.stringify({suite:'KIDULTS_INTERNALIZATION_PHASE2_RUNTIME_BRIDGE_V1',result:'PASS',suites:suites.length,provider_activation:'HOLD_UNTIL_JOINT_GATE_PASS',production:'HOLD'},null,2));
