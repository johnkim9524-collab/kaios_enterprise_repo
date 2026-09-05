#!/usr/bin/env node
// All input receipts here are test fixtures. Never export them as natural evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { inspectKirReadinessEvidence } from '../../../scripts/kidults/runtime/kir-readiness-evidence-intake-v1.mjs';
import { makeEvidenceFixture, writeEvidenceDirectory } from './kir-readiness-control-fixtures-v1.mjs';
export function runKirReadinessControlProbe(identity) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kir-readiness-control-'));
  try {
    writeEvidenceDirectory(directory,makeEvidenceFixture(identity.source_sha));
    for(const name of ['staging-production-delta.json','production-readiness-evidence-v1.json']) fs.unlinkSync(path.join(directory,name));
    const compose=spawnSync(process.execPath,['scripts/production/compose-kidults-production-readiness-evidence-v1.mjs','--evidence-dir',directory,'--expected-source-sha',identity.source_sha],
      {encoding:'utf8',timeout:30000,maxBuffer:1048576,env:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin',LANG:'C.UTF-8',TZ:'UTC'}});
    assert.equal(compose.status,0,'SYNTHETIC_READINESS_COMPOSER_FAILED');
    const content=inspectKirReadinessEvidence({identity,evidenceDirectory:directory});
    fs.unlinkSync(path.join(directory,'staging-production-delta.json'));
    assert.throws(()=>inspectKirReadinessEvidence({identity,evidenceDirectory:directory}),/KIR_READINESS_TECHNICAL_GATE_REJECTED/);
    return {id:'kidults-kir-readiness-control-integration-v1',version:'1.0.0',state:'VERIFIED_PASS',
      scope:'SYNTHETIC_KIR_READINESS_COMPOSER_AND_MEMBER_GATE_ONLY',
      repository:content.repository,source_sha:content.source_sha,run_id:content.run_id,run_attempt:content.run_attempt,trigger_event:content.trigger_event,
      kir_receipt_sha256:content.kir_receipt_sha256,case_count:2,
      cases:{composer_to_member_gate:true,missing_staging_member_rejected:true},
      input_class:'SYNTHETIC_TEST_FIXTURE_NOT_LIVE_EVIDENCE',
      natural_runs_observed:0,empirical_current_sold_delta:0,postgres_rows_written:0,
      staging_business_workload_verified:false,production_readiness_verified:false,
      provider_authority:false,database_authority:false,empirical_authority:false,
      runtime_activation_authorized:false,producer_health_authority:false,promotion_eligible:false,
      public_release:'HOLD',production:'HOLD',g5:'HOLD'};
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
}
