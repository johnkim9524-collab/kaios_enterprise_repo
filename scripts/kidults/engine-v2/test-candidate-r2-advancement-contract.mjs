import assert from "node:assert/strict";
import { validateCandidateR2Advancement } from "./validate-candidate-r2-advancement.mjs";

function fixture({ families = ["A", "B", "C", "D"], quarantined = 0, admittedPerFamily = 12 } = {}) {
  const authorityCandidates = families.flatMap((family) =>
    Array.from({ length: admittedPerFamily }, (_, index) => ({
      source_record_id: `${family}:${index + 1}`,
      source_family: family
    }))
  );
  const admitted = authorityCandidates.length;
  const authorityInputs = admitted + quarantined;
  return {
    run: {
      authority_source_family_count: 4,
      authority_input_record_count: authorityInputs,
      admitted_authority_record_count: admitted,
      quarantined_record_count: quarantined
    },
    quarantine: { quarantined_record_count: quarantined },
    universe: {
      authority_admission_candidate_count: admitted,
      quarantined_record_count: quarantined,
      authority_admission_candidates: authorityCandidates
    }
  };
}

const positive = validateCandidateR2Advancement(fixture());
assert.deepEqual(positive.errors, [], "four current families with zero quarantine must be advancement-eligible");

const twoLiveTwoQuarantined = validateCandidateR2Advancement(
  fixture({ families: ["SMITHSONIAN", "ART_INSTITUTE_CHICAGO"], quarantined: 24 })
);
assert(twoLiveTwoQuarantined.errors.some((error) => error.includes("all four current authority families")),
  "two-family coverage must fail closed");
assert(twoLiveTwoQuarantined.errors.some((error) => error.includes("not advancement-eligible")),
  "nonzero quarantine must fail closed");

const threeFamilies = validateCandidateR2Advancement(fixture({ families: ["A", "B", "C"], admittedPerFamily: 16 }));
assert(threeFamilies.errors.some((error) => error.includes("all four current authority families")),
  "three-of-four current families must fail closed even when all inputs are admitted");

const quarantineOnly = validateCandidateR2Advancement(fixture({ quarantined: 1 }));
assert(quarantineOnly.errors.some((error) => error.includes("every bounded authority input")),
  "admitted/input mismatch caused by quarantine must fail closed");
assert(quarantineOnly.errors.some((error) => error.includes("not advancement-eligible")),
  "any quarantine must block Golden Dataset advancement");

console.log("Candidate R2 advancement contract regression: PASS");
