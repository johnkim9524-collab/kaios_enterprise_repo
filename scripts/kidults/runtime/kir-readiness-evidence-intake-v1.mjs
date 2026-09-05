#!/usr/bin/env node
// Read-only content intake. This does not attest where evidence was produced.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateKirRuntime, loadKirRuntime } from './kir-runtime-kernel-v1.mjs';
import { canonicalJsonDigest } from '../market/current-sold-batch-v1.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fail = code => { throw new Error(code); };

export function inspectKirReadinessEvidence(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).length !== 2 ||
      !['identity','evidenceDirectory'].every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(input,k) || {}, 'value'))) fail('KIR_READINESS_INPUT');
  const kir = evaluateKirRuntime({...loadKirRuntime(), identity: input.identity});
  const directory = input.evidenceDirectory;
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('KIR_READINESS_DIRECTORY');
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) fail('KIR_READINESS_PRIVATE_DIRECTORY');
  if (fs.realpathSync(directory) !== directory) fail('KIR_READINESS_DIRECTORY_ALIAS');
  const result = spawnSync(process.execPath, [
    path.join(ROOT,'scripts/production/validate-kidults-production-release-v1.mjs'), 'technical',
    '--evidence', path.join(directory,'production-readiness-evidence-v1.json'),
    '--evidence-dir', directory, '--expected-source-sha', kir.source_sha,
  ], {cwd:ROOT, encoding:'utf8', timeout:30000, maxBuffer:1048576,
    env:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin', LANG:'C.UTF-8', TZ:'UTC'}});
  // Never persist child stderr, source paths, payload bodies, tokens or claims from an unsuccessful gate.
  if (result.error || result.status !== 0) fail('KIR_READINESS_TECHNICAL_GATE_REJECTED');
  let verdict; try { verdict=JSON.parse(result.stdout); } catch { fail('KIR_READINESS_GATE_JSON'); }
  const x=verdict?.summary;
  if (verdict.suite !== 'KIDULTS_PRODUCTION_TECHNICAL_READINESS_V1' || verdict.result !== 'VERIFIED_PASS' ||
      x?.state !== 'TECHNICAL_READINESS_VERIFIED' || x.source_sha !== kir.source_sha ||
      !/^sha256:[a-f0-9]{64}$/.test(x.readiness_evidence_sha256 || '') || x.production_release_authorized !== false) fail('KIR_READINESS_GATE_RESULT');
  return {
    id:'kidults-kir-readiness-evidence-intake-v1', version:'1.0.0',
    state:'TECHNICAL_CONTENT_VALIDATED_EXECUTION_UNATTESTED',
    scope:'KIR_STAGING_PRODUCTION_READINESS_CONTENT_ONLY',
    repository:kir.repository, source_sha:kir.source_sha, run_id:kir.run_id,
    run_attempt:kir.run_attempt, trigger_event:kir.trigger_event,
    kir_receipt_sha256:canonicalJsonDigest(kir),
    readiness_evidence_sha256:x.readiness_evidence_sha256, policy_sha256:x.policy_sha256,
    bound_member_count:x.auxiliary_evidence_member_count+x.support_evidence_member_count,
    staging_delta_content_validated:true, technical_member_closure_validated:true,
    producer_execution_attested:false, staging_business_workload_verified:false,
    natural_runs_observed_by_this_intake:0, empirical_current_sold_delta:0,
    postgres_rows_written:0, runtime_activation_authorized:false,
    provider_authority:false, database_authority:false, empirical_authority:false,
    producer_health_authority:false, promotion_eligible:false,
    public_release:'HOLD', production:'HOLD', g5:'HOLD',
    blockers:[...kir.blockers,'STAGING_BUSINESS_WORKLOAD_EXECUTION_NOT_ATTESTED','PRODUCTION_EVIDENCE_PRODUCER_EXECUTION_NOT_ATTESTED'],
  };
}
