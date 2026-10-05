#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function fail(code) { throw new Error(code); }
function read(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
function digest(value) { return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`; }
function one(items, code) { if (items.length !== 1) fail(`${code}:${items.length}`); return items[0]; }

export function classifyCoverageObservation({ run, artifacts, admission }) {
  if (!Number.isInteger(run?.id) || run.id < 1 || run.status !== 'completed' || run.conclusion !== 'success') fail('COVERAGE_RUN_NOT_SUCCESS');
  if (run.path !== '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml') fail('COVERAGE_WORKFLOW_PATH');
  if (run.event !== 'workflow_run' || run.head_branch !== 'main' || !SHA.test(run.head_sha || '')) fail('COVERAGE_RUN_SCOPE');
  if (run.repository?.full_name !== run.head_repository?.full_name) fail('COVERAGE_REPOSITORY_SCOPE');
  const live = (artifacts?.artifacts || []).filter((artifact) => artifact.expired === false && artifact.workflow_run?.id === run.id && artifact.workflow_run?.head_sha === run.head_sha);
  const full = live.filter((artifact) => artifact.name === 'kidults-asi-requirement-adapter-coverage-v1');
  const admissionName = `kidults-asi-requirement-coverage-admission-v1-${run.id}-${run.run_attempt}`;
  const admissions = live.filter((artifact) => artifact.name === admissionName);
  if (full.length === 1) {
    if (!DIGEST.test(full[0].digest || '')) fail('COVERAGE_ARTIFACT_DIGEST');
    return { state: 'AUTHORITATIVE_COVERAGE_ARTIFACT_PRESENT', execute_full_audit: true, promotion_authority: false };
  }
  if (full.length !== 0) fail(`COVERAGE_ARTIFACT_CARDINALITY:${full.length}`);
  const artifact = one(admissions, 'COVERAGE_ADMISSION_ARTIFACT_CARDINALITY');
  if (!DIGEST.test(artifact.digest || '')) fail('COVERAGE_ADMISSION_ARTIFACT_DIGEST');
  if (admission?.id !== 'kidults-asi-requirement-coverage-admission-v1' || admission?.version !== '1.0.0' ||
      admission?.state !== 'VERIFIED_SKIP' || admission?.admission !== 'EXPECTED_NONAUTHORITATIVE_SKIP' ||
      admission?.should_run !== false || admission?.promotion_authority !== false ||
      admission?.repository !== run.repository.full_name || admission?.execution_sha !== run.head_sha ||
      admission?.production !== 'HOLD' || admission?.public_release !== 'HOLD' || admission?.g5 !== 'HOLD') {
    fail('COVERAGE_NONAUTHORITATIVE_ADMISSION_INVALID');
  }
  const receipt = {
    id: 'kidults-platform-coverage-nonauthoritative-observation-v1', version: '1.0.0',
    state: 'VERIFIED_NONAUTHORITATIVE_OBSERVATION', repository: run.repository.full_name,
    source_sha: run.head_sha, coverage_run_id: run.id, coverage_run_attempt: run.run_attempt,
    admission_artifact_id: artifact.id, admission_artifact_digest: artifact.digest,
    admission_reason: admission.reason, execute_full_audit: false, coverage_authority: false,
    promotion_authority: false, production: 'HOLD', public_release: 'HOLD', g5: 'HOLD'
  };
  return { ...receipt, receipt_digest: digest(JSON.stringify(receipt)) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [runPath, artifactsPath, admissionPath, outputPath] = process.argv.slice(2);
  if (!runPath || !artifactsPath || !admissionPath || !outputPath) fail('USAGE');
  const result = classifyCoverageObservation({ run: read(runPath), artifacts: read(artifactsPath), admission: read(admissionPath) });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `execute_full_audit=${result.execute_full_audit}\n`);
}
