import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const controlPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'ontology-entity-integrity-controls-v1.json');
const globalPath = path.join(root, 'coordination', 'kidults', 'kpmo', 'global-leadership-risk-controls-v1.json');
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
const global = JSON.parse(fs.readFileSync(globalPath, 'utf8'));

let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };
const req = (c, m) => { if (!c) fail(m); };

for (const p of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) req(control.operating_principles?.includes(p), `missing principle ${p}`);
for (const r of ['IDENTIFIER_MATCH_NE_ENTITY_IDENTITY','ALIAS_MATCH_NE_CANONICAL_MERGE','SAME_NAME_NE_SAME_OBJECT','ENTITY_MUTATION_REQUIRES_DEPENDENCY_REPLAY']) req(control.truth_rules?.includes(r), `missing truth rule ${r}`);

const byId = new Map((control.controls || []).map(x => [x.id, x]));
for (const id of ['FALSE_MERGE_PREVENTION','FALSE_SPLIT_PREVENTION','ALIAS_AND_IDENTIFIER_COLLISION','VARIANT_AND_EDITION_BOUNDARY','ONTOLOGY_AND_TYPE_DRIFT','HIGH_FANOUT_IDENTITY_MUTATION','REVERSIBLE_ENTITY_LINEAGE']) req(byId.has(id), `missing control ${id}`);

req(byId.get('FALSE_MERGE_PREVENTION')?.rules?.some(r => r.includes('CONFLICTING_HIGH_AUTHORITY_IDENTIFIERS_FORCE_IDENTITY_QUARANTINE')), 'conflicting identifier quarantine missing');
req(byId.get('ALIAS_AND_IDENTIFIER_COLLISION')?.rules?.some(r => r.includes('IDENTIFIER_NAMESPACE_AND_ISSUER_MUST_BE_EXPLICIT')), 'identifier namespace rule missing');
req(byId.get('VARIANT_AND_EDITION_BOUNDARY')?.rules?.some(r => r.includes('COMPARABLES_MUST_DECLARE_ENTITY_GRAIN')), 'entity grain declaration missing');
req(byId.get('HIGH_FANOUT_IDENTITY_MUTATION')?.rules?.some(r => r.includes('AFFECTED_CLAIMS_FACTORS_SNAPSHOTS_AND_PROJECTIONS_MUST_REPLAY_OR_HOLD')), 'dependency replay/hold missing');
req(byId.get('REVERSIBLE_ENTITY_LINEAGE')?.rules?.some(r => r.includes('TOMBSTONE_AND_MAPPING_LINEAGE')), 'identity tombstone lineage missing');

req(global.risk_control_bindings?.ontology_entity_integrity === 'ontology-entity-integrity-controls-v1.json', 'global control binding missing');
req(global.non_negotiable_truth_rules?.includes('IDENTIFIER_MATCH_NE_ENTITY_IDENTITY'), 'global identifier truth rule missing');
req(global.non_negotiable_truth_rules?.includes('SAME_NAME_NE_SAME_OBJECT'), 'global same-name truth rule missing');

req(control.activation_ceiling?.empirical_promotion === 'PROHIBITED_FROM_CONTROL_OR_SYNTHETIC_TESTS', 'empirical promotion ceiling missing');
req(control.activation_ceiling?.live_mutation === 'DISABLED_UNTIL_SEPARATE_ACTIVATION_GATE', 'live mutation ceiling missing');
req(control.activation_ceiling?.production === 'HOLD', 'Production HOLD missing');
req(control.activation_ceiling?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5 gate missing');

if (failed) process.exit(1);
console.log('PASS: ontology/entity identity integrity controls validated');
