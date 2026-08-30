#!/usr/bin/env node
import fs from 'node:fs';
const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(`${root}/${p}`, 'utf8'));
const policyPath = 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json';
const alignPath = 'coordination/kidults/governance/current-sold-sample-governance-alignment-v1.json';
const p = read(policyPath), a = read(alignPath);
const fail = c => { throw new Error(c); };
if (a.canonical_policy !== policyPath) fail('ALIGNMENT_CANONICAL_POLICY');
if (!a.scope.includes('KPMO') || !a.scope.includes('TRACK_Z') || !a.scope.includes('FULL_VALUE_CHAIN') || !a.scope.includes('ALL_ENGINES_AND_LOGIC')) fail('ALIGNMENT_SCOPE_INCOMPLETE');
if (p.rights_gate.mode !== 'CENSUS_NOT_SAMPLE') fail('RIGHTS_CENSUS_NOT_BOUND');
if (p.coverage_gate.separate_from_sample_size !== true) fail('COVERAGE_NOT_SEPARATE');
if (p.statistical_method.optional_stopping !== false || p.statistical_method.threshold_change_after_observation !== false) fail('OPTIONAL_STOPPING_OR_POSTHOC_POLICY');
for (const id of ['KPMO','TRACK_A','TRACK_B','TRACK_C','TRACK_D','TRACK_E','TRACK_Z','ASI']) if (!a.track_alignment[id]) fail(`TRACK_ALIGNMENT_MISSING:${id}`);
if (a.legacy_migration.platform_current_sold_120 !== 'DEPRECATED') fail('LEGACY_120_NOT_DEPRECATED');
if (a.automatic_release_escalation.public_request !== 'ROUTED_TO_PRODUCTION_TIER' || a.automatic_release_escalation.downgrade_after_observation !== 'FORBIDDEN') fail('AUTO_RELEASE_ESCALATION_NOT_BOUND');
console.log(JSON.stringify({suite:'CURRENT_SOLD_GOVERNANCE_ALIGNMENT_V1',result:'VERIFIED_PASS',scope:a.scope.length,tracks:Object.keys(a.track_alignment).length,rights:'CENSUS',sample:'CLAIM_SPECIFIC',legacy_120:'DEPRECATED',production:'HOLD',public:'HOLD',g5:'HOLD'}));
