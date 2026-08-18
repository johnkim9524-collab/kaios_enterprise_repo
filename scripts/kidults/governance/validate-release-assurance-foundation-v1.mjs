import fs from 'node:fs';
import process from 'node:process';
const paths = [
  'coordination/kidults/governance/release-assurance-contract-v1.json',
  'coordination/kidults/governance/field-level-rights-release-manifest-v1.json',
  'coordination/kidults/governance/privacy-retention-minimization-contract-v1.json',
  'coordination/kidults/governance/portal-accessibility-assurance-v1.json',
  'coordination/kidults/governance/secure-sdlc-supply-chain-contract-v1.json',
  'coordination/kidults/runtime/observability-slo-contract-v1.json'
];
const docs = paths.map(path => [path, JSON.parse(fs.readFileSync(path, 'utf8'))]);
const errors=[]; const assert=(c,m)=>{if(!c)errors.push(m)};
for (const [path, doc] of docs) {
  assert(doc.version === '1.0.0', `${path}: version mismatch`);
  assert(doc.production === 'HOLD', `${path}: Production must remain HOLD`);
}
const rights=docs[1][1], privacy=docs[2][1], accessibility=docs[3][1], security=docs[4][1], obs=docs[5][1];
assert(rights.purposes.includes('display_public') && rights.default_disposition==='HOLD','Rights contract must fail closed for public display.');
assert(privacy.rules?.unclassified_personal_data_admission===false,'Unclassified personal data must not be admitted.');
assert(accessibility.standard==='WCAG_2_2' && accessibility.required_checks.length>=8,'WCAG 2.2 assurance scope incomplete.');
assert(security.framework_alignment.includes('NIST_SSDF') && security.required_release_evidence.length>=6,'Secure SDLC evidence scope incomplete.');
assert(obs.signals.join(',')==='metrics,logs,traces' && obs.required_slis.length>=10,'Observability contract incomplete.');
assert(obs.slo_policy==='NO_NUMERIC_SLO_UNTIL_BOUNDED_REAL_POC_BASELINE_MEASURED','SLO must not be fabricated before empirical baseline.');
if(errors.length){console.error(`Release assurance foundation: FAIL (${errors.length})`);for(const e of errors)console.error(`ERROR: ${e}`);process.exit(1)}
console.log('Release assurance foundation: PASS');
console.log(`Contracts: ${docs.length}`);
console.log('Security: NIST SSDF aligned foundation');
console.log('Accessibility: WCAG 2.2 evidence required');
console.log('Observability: metrics/logs/traces + empirical SLO baseline');
console.log('Production: HOLD');
