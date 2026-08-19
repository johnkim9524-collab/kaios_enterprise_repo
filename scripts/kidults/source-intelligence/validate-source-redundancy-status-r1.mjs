import fs from 'node:fs/promises';

const p='coordination/kidults/source-intelligence/source-redundancy-status-r1.json';
const x=JSON.parse(await fs.readFile(p,'utf8'));
if(x.production!=='HOLD') throw new Error('PRODUCTION_BOUNDARY_INVALID');
if(x.scope!=='COLLECTIBLES_ONLY') throw new Error('SCOPE_BOUNDARY_INVALID');
const e=x.evidence_classes||{};
const identity=e.IDENTITY_CANONICAL_REFERENCE;
const historical=e.HISTORICAL_TRANSACTION_PROVENANCE;
const scarcity=e.SCARCITY_POPULATION;
const sold=e.CURRENT_SOLD_TRANSACTION;
if(!identity||identity.independent_owner_count<2||identity.fallback_available!==true) throw new Error('IDENTITY_REDUNDANCY_NOT_PROVEN');
if(!historical||historical.status!=='CONCENTRATION_GAP'||historical.independent_owner_count!==1||historical.fallback_available!==false) throw new Error('HISTORICAL_CONCENTRATION_TRUTH_INVALID');
if(!scarcity||scarcity.independent_owner_count!==0||scarcity.fallback_available!==false) throw new Error('SCARCITY_FAIL_CLOSED_INVALID');
if(!sold||sold.independent_owner_count!==0||sold.fallback_available!==false) throw new Error('CURRENT_SOLD_FAIL_CLOSED_INVALID');
if(x.exit_state?.issue_559_complete!==false) throw new Error('FALSE_COMPLETION_CLAIM');
console.log('Source Redundancy Status R1 PASS: bounded identity redundancy proven; historical concentration + scarcity/current-SOLD gaps remain fail-closed.');
