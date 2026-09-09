import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function validateCandidateR2Advancement({ run, quarantine, universe }) {
  const errors = [];
  const authorityCandidates = Array.isArray(universe?.authority_admission_candidates)
    ? universe.authority_admission_candidates
    : [];
  const familyCounts = new Map();

  for (const record of authorityCandidates) {
    const family = typeof record?.source_family === "string" ? record.source_family.trim() : "";
    if (!family) {
      errors.push(`${record?.source_record_id ?? "unknown"}: admitted authority record must carry a non-empty source_family.`);
      continue;
    }
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }

  const expectedFamilies = run?.authority_source_family_count;
  const admittedAuthority = run?.admitted_authority_record_count;
  const authorityInputs = run?.authority_input_record_count;
  const runQuarantine = run?.quarantined_record_count;
  const reportQuarantine = quarantine?.quarantined_record_count;
  const universeQuarantine = universe?.quarantined_record_count;

  if (expectedFamilies !== 4) {
    errors.push(`Golden Dataset advancement requires exactly four declared authority source families; declared=${String(expectedFamilies)}.`);
  }
  if (!nonNegativeInteger(admittedAuthority) || admittedAuthority !== authorityInputs) {
    errors.push(`Golden Dataset advancement requires every bounded authority input to be currently admitted; admitted=${String(admittedAuthority)} inputs=${String(authorityInputs)}.`);
  }
  if (runQuarantine !== 0 || reportQuarantine !== 0 || universeQuarantine !== 0) {
    errors.push(`Fail-closed quarantine is structurally valid but not advancement-eligible; run/report/universe quarantine=${String(runQuarantine)}/${String(reportQuarantine)}/${String(universeQuarantine)}.`);
  }
  if (authorityCandidates.length !== admittedAuthority || universe?.authority_admission_candidate_count !== admittedAuthority) {
    errors.push(`Admitted authority population must reconcile before advancement; candidates=${authorityCandidates.length} universe_count=${String(universe?.authority_admission_candidate_count)} run_count=${String(admittedAuthority)}.`);
  }
  if (familyCounts.size !== expectedFamilies) {
    errors.push(`Golden Dataset advancement requires all four current authority families; admitted_families=${[...familyCounts.keys()].sort().join(",") || "NONE"} count=${familyCounts.size}.`);
  }

  return {
    errors,
    familyCounts: Object.fromEntries([...familyCounts.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
}

function readJson(output, name) {
  return JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisPath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath === thisPath) {
  const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/candidate-r2-preflight-r1");
  let run;
  let quarantine;
  let universe;
  try {
    run = readJson(output, "run-manifest.json");
    quarantine = readJson(output, "raw-quarantine-report.json");
    universe = readJson(output, "universe-admission-report.json");
  } catch (error) {
    console.error(`AGCI-OS Candidate R2 Advancement Gate: FAIL (input read): ${error.message}`);
    process.exit(1);
  }

  const result = validateCandidateR2Advancement({ run, quarantine, universe });
  if (result.errors.length) {
    console.error(`AGCI-OS Candidate R2 Advancement Gate: BLOCKED (${result.errors.length})`);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    console.error("Golden Dataset: NOT_BUILT_INCOMPLETE_CURRENT_AUTHORITY_COVERAGE");
    console.error("Production/Public/G5: HOLD");
    process.exit(1);
  }

  console.log("AGCI-OS Candidate R2 Advancement Gate: PASS");
  console.log(`Current authority families: ${Object.keys(result.familyCounts).join(", ")}`);
  console.log("Quarantine: 0");
  console.log("Golden Dataset advancement: ELIGIBLE_FOR_INTERNAL_LABELING_QUEUE_ONLY");
  console.log("Production/Public/G5: HOLD");
}
