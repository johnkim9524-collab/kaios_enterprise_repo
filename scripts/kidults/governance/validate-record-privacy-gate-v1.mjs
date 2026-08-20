import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TERMINAL_STATES = new Set([
  "NO_PERSONAL_DATA",
  "PERSONAL_DATA_INTERNAL_ONLY",
  "APPROVED_NONPERSONAL_FIELDSET"
]);

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

export function validateRecordPrivacyDecision(decision) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new Error("PRIVACY_GATE_DECISION_REQUIRED");
  }
  const state = decision.classification_state;
  if (!TERMINAL_STATES.has(state)) throw new Error("PRIVACY_GATE_UNCLASSIFIED_HOLD");
  if (typeof decision.record_id !== "string" || !decision.record_id.trim()) throw new Error("PRIVACY_GATE_RECORD_ID_REQUIRED");
  if (typeof decision.review_ref !== "string" || decision.review_ref.trim().length < 8) throw new Error("PRIVACY_GATE_REVIEW_REF_REQUIRED");

  const personalFields = decision.personal_fields ?? [];
  const approvedPublicFields = decision.approved_public_fields ?? [];
  if (!nonEmptyStrings(personalFields) || !nonEmptyStrings(approvedPublicFields)) throw new Error("PRIVACY_GATE_INVALID_FIELD_LIST");

  if (state === "NO_PERSONAL_DATA" && personalFields.length > 0) throw new Error("PRIVACY_GATE_STATE_FIELD_CONTRADICTION");
  if (state === "PERSONAL_DATA_INTERNAL_ONLY" && personalFields.length === 0) throw new Error("PRIVACY_GATE_PERSONAL_FIELDS_REQUIRED");
  if (state === "PERSONAL_DATA_INTERNAL_ONLY" && decision.public_projection === true) throw new Error("PRIVACY_GATE_PERSONAL_PUBLIC_PROJECTION_FORBIDDEN");

  if (decision.public_projection === true) {
    if (state === "PERSONAL_DATA_INTERNAL_ONLY") throw new Error("PRIVACY_GATE_PERSONAL_PUBLIC_PROJECTION_FORBIDDEN");
    if (approvedPublicFields.length === 0) throw new Error("PRIVACY_GATE_PUBLIC_FIELDSET_REQUIRED");
    if (personalFields.some((field) => approvedPublicFields.includes(field))) throw new Error("PRIVACY_GATE_PERSONAL_FIELD_LEAK");
  }

  return {
    record_id: decision.record_id,
    classification_state: state,
    public_projection: decision.public_projection === true,
    personal_field_count: personalFields.length,
    approved_public_field_count: approvedPublicFields.length,
    disposition: decision.public_projection === true ? "PROJECTION_ELIGIBLE_BOUNDED_FIELDS" : "INTERNAL_ONLY_OR_HOLD_PUBLIC",
    production_authorized: false
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error("privacy decision JSON path is required");
  const decision = JSON.parse(readFileSync(resolve(path), "utf8"));
  process.stdout.write(`${JSON.stringify(validateRecordPrivacyDecision(decision), null, 2)}\n`);
}
