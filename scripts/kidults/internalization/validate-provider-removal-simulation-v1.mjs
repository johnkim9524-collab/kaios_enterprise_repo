import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-removal-simulation-contract-v1.json','utf8'));
const errs = [];
for (const p of ['canonical_identity','methodology','confidence_history','derived_history','downstream_contracts','replacement_adapter']) {
  if (!c.required_continuity?.includes(p)) errs.push(`missing continuity ${p}`);
}
if (c.failure_rule !== 'PLATFORM_REWRITE_REQUIRED_EQUALS_FAIL') errs.push('rewrite failure rule missing');
if (c.raw_provider_payload_required_for_continuity !== false) errs.push('raw provider payload must not be required for continuity');
if (c.production !== 'HOLD') errs.push('production boundary drift');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_REMOVAL_SIMULATION_V1',result:'PASS',continuity:c.required_continuity.length,raw_provider_payload_required:false,production:c.production},null,2));
