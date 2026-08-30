#!/usr/bin/env node
import fs from 'node:fs';

const prepPath='.github/workflows/kidults-asi-intelligence-preparation-wave-v1.yml';
const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';

function validate(prep, assurance) {
  const failures=[];
  const need=(text,needle,label)=>{if(!text.includes(needle))failures.push('missing '+label)};
  const reject=(text,needle,label)=>{if(text.includes(needle))failures.push('forbidden '+label)};

  need(prep,"group: kidults-asi-intelligence-preparation-wave-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}",'exact upstream-run concurrency');
  reject(prep,'group: kidults-asi-intelligence-preparation-wave-v1-${{ github.ref }}','ref-only concurrency');
  const auditGate=assurance.match(/^  audit:\n([\s\S]*?)^    concurrency:/m)?.[1]||'';
  const auditJob=assurance.match(/^  audit:\n([\s\S]*)$/m)?.[1]||'';
  need(assurance,"- 'KIDULTS ASI Intelligence Preparation Wave v1'",'Continuous Assurance producer watch');
  need(auditGate,"(github.event_name != 'workflow_run' ||\n       (github.event.workflow_run.repository.full_name == github.repository",'cancellation-aware workflow_run audit gate');
  reject(auditGate,"github.event.workflow_run.conclusion == 'success'",'success-only workflow_run audit gate');
  need(auditJob,'KPMO_UPSTREAM_CONCLUSION: ${{ github.event.workflow_run.conclusion || \'\' }}','upstream conclusion receipt');
  need(auditJob,'KPMO_TERMINAL_OBSERVATION_NON_DEDUPABLE','terminal observation dedupe bypass receipt');
  need(auditJob,'resolve-continuous-assurance-ephemeral-guard-v1.mjs','canonical guard execution');
  need(prep,'node scripts/kidults/redteam/validate-intelligence-preparation-assurance-coverage-v1.mjs','producer invariant execution');
  need(assurance,'node scripts/kidults/redteam/validate-intelligence-preparation-assurance-coverage-v1.mjs','assurance invariant execution');
  return failures;
}

const prep=fs.readFileSync(prepPath,'utf8');
const assurance=fs.readFileSync(assurancePath,'utf8');
const failures=validate(prep,assurance);
if(failures.length){console.error('Intelligence Preparation assurance coverage: FAIL');for(const f of failures)console.error('- '+f);process.exit(1)}

const mutations=[
  [prep.replace("group: kidults-asi-intelligence-preparation-wave-v1-${{ github.event_name }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}","group: kidults-asi-intelligence-preparation-wave-v1-${{ github.ref }}"),assurance],
  [prep,assurance.replace("      - 'KIDULTS ASI Intelligence Preparation Wave v1'\n",'')],
  [prep,assurance.replaceAll("(github.event_name != 'workflow_run' ||\n       (github.event.workflow_run.repository.full_name == github.repository","(github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' &&\n       (github.event.workflow_run.repository.full_name == github.repository")]
];
for(const [mp,ma] of mutations){if(validate(mp,ma).length===0){console.error('mutation not rejected');process.exit(1)}}
console.log(JSON.stringify({status:'VERIFIED_PASS',control:'INTELLIGENCE_PREPARATION_CANCELLATION_AWARE_ASSURANCE',mutation_cases_rejected:mutations.length,production:'HOLD',public_release:'HOLD'},null,2));
