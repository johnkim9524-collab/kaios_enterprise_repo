import fs from "node:fs/promises";

const output = process.argv[2] || "/tmp/met-real-source-admission-r1.json";
const artifact = {
  id: "met-real-source-admission-run-r1",
  version: "1.1.0",
  status: "HOLD_GOVERNED_MET_OWNER_ONLY",
  execution_mode: "LEGACY_DIRECT_PROVIDER_PATH_DISABLED",
  source_id: "met-open-access-api",
  generated_at: new Date().toISOString(),
  provider_call_count: 0,
  requests_executed: 0,
  samples: [],
  sample_count: 0,
  data_admission_performed: false,
  immutable_candidate_evidence_pair_created: false,
  track_b_submission_count: 0,
  track_b_assessment_count: 0,
  production_mutation: false,
  blocker: "ONLY_AUTONOMOUS_MET_SAMPLE_WORKFLOW_MAY_PERFORM_LIVE_REFERENCE_READS",
  governed_owner_workflow: ".github/workflows/kidults-autonomous-met-sample.yml",
  truth_boundary: "This legacy runner performs zero Met provider calls and cannot emit empirical or admission evidence."
};
await fs.writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.error(JSON.stringify(artifact, null, 2));
process.exitCode = 3;
