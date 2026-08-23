import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('coordination/kidults/internalization/minimum-external-dependency-negotiation-contract-v1.json','utf8'));
const errs = [];
for (const x of ['canonical_identity_ownership','normalization_ownership','methodology_scoring_ownership','confidence_provenance_ownership','ontology_ownership','provider_switching_control','historical_learning_control']) if (!c.never_concede?.includes(x)) errs.push(`missing never_concede ${x}`);
for (const x of ['post_termination_derived_intelligence','portability_export']) if (!c.rights_requirements?.includes(x)) errs.push(`missing rights requirement ${x}`);
if (c.fail_closed?.unknown_material_rights !== 'HOLD') errs.push('unknown rights must HOLD');
if (c.fail_closed?.provider_core_capture !== 'NO_GO') errs.push('provider core capture must NO_GO');
if (c.non_bypass?.spend !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('spend boundary drift');
if (c.non_bypass?.contract !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('contract boundary drift');
if (c.non_bypass?.credential_activation !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('credential boundary drift');
if (c.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');
if (c.non_bypass?.g5 !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push('g5 boundary drift');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({suite:'KIDULTS_MINIMUM_EXTERNAL_DEPENDENCY_NEGOTIATION_V1',result:'PASS',providers:Object.keys(c.provider_request_strategy||{}).length,production:c.non_bypass.production,g5:c.non_bypass.g5},null,2));
