import fs from 'node:fs';

const TARGET = 'scripts/kidults/audit/certify-pre-partner-intake-gate-v1.mjs';
const source = fs.readFileSync(TARGET, 'utf8');

const forbidden = [
  /no_internally_solvable_p0_p1_detected_by_certification\s*:\s*true/,
  /global_p0_p1_absence_claim\s*:\s*['"]ASSERTED['"]/,
  /no[_ -]?p0[_ -]?p1[^\n]*true/i
];

const mutationCases = [
  "no_internally_solvable_p0_p1_detected_by_certification: true",
  "global_p0_p1_absence_claim: 'ASSERTED'",
  "no-p0-p1: true"
];
for (const sample of mutationCases) {
  if (!forbidden.some((re) => re.test(sample))) {
    throw new Error(`truth-scope mutation self-test missed unsafe claim: ${sample}`);
  }
}

const findings = forbidden
  .filter((re) => re.test(source))
  .map((re) => re.toString());

if (!source.includes("certification_scope: 'PRE_PARTNER_CONTROL_READINESS_ONLY'")) {
  findings.push('missing_scoped_certification_scope');
}
if (!source.includes("global_p0_p1_absence_claim: 'NOT_ASSERTED'")) {
  findings.push('missing_global_absence_nonassertion');
}
if (!source.includes("empirical_gate_effect: 'NONE'")) {
  findings.push('missing_empirical_nonpromotion_boundary');
}
if (!source.includes("production: 'HOLD'") || !source.includes("public_intelligence: 'HOLD'") || !source.includes("g5: 'EXPLICIT_APPROVAL_REQUIRED'")) {
  findings.push('missing_release_hold_boundary');
}

console.log(JSON.stringify({
  suite: 'KIDULTS_SCOPED_CERTIFICATION_TRUTH_BOUNDARY_V1',
  target: TARGET,
  mutation_cases_detected: mutationCases.length,
  findings,
  result: findings.length === 0 ? 'PASS' : 'FAIL',
  certification_scope: 'PRE_PARTNER_CONTROL_READINESS_ONLY',
  global_p0_p1_absence_claim: 'NOT_ASSERTED',
  empirical_gate_effect: 'NONE',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
}, null, 2));

if (findings.length) process.exit(1);
