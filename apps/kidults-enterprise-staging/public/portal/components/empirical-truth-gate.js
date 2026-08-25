export const EMPIRICAL_GATE_STATES = Object.freeze([
  "CURRENT",
  "SOURCE_MISMATCH",
  "WAITING_FOR_CANDIDATE",
  "WAITING_FOR_EVIDENCE",
  "WAITING_FOR_ASSESSMENT",
  "PREVIEW_ONLY",
  "NOT_AVAILABLE"
]);

export function empiricalTruthContext(data = {}) {
  const registry = data.registry ?? {};
  const manifest = data.manifest ?? {};
  const registryConnected = data.meta?.registryProjectionConnected ?? Boolean(data.registry);

  return Object.freeze({
    registryConnected: Boolean(registryConnected),
    baselineSnapshotId: registry.snapshot?.baseline_id ?? null,
    sourceSnapshotId: data.verticals?.source_snapshot_id ?? manifest.snapshot_id ?? null,
    candidateId: registry.snapshot?.candidate_id ?? null,
    candidate: registry.snapshot?.candidate_id ?? registry.snapshot?.candidate_status ?? "WAITING",
    evidencePackageId: registry.evidence?.current_package_id ?? null,
    evidence: registry.evidence?.current_package_id ?? registry.evidence?.status ?? "WAITING",
    assessmentId: registry.assessment?.current_id ?? null,
    assessment: registry.assessment?.current_id ?? registry.assessment?.status ?? "WAITING",
    production: registry.release?.status ?? "NOT AVAILABLE",
    manifestProduction: manifest.production === true
  });
}

export function resolveEmpiricalGateState(data = {}) {
  const context = empiricalTruthContext(data);
  if (!context.registryConnected) return "NOT_AVAILABLE";
  if (
    context.baselineSnapshotId &&
    context.sourceSnapshotId &&
    context.baselineSnapshotId !== context.sourceSnapshotId
  ) return "SOURCE_MISMATCH";
  if (!context.candidateId) return "WAITING_FOR_CANDIDATE";
  if (!context.evidencePackageId) return "WAITING_FOR_EVIDENCE";
  if (!context.assessmentId) return "WAITING_FOR_ASSESSMENT";
  if (context.production !== "PRODUCTION" || !context.manifestProduction) return "PREVIEW_ONLY";
  return "CURRENT";
}

export function empiricalGuidanceAvailable(data = {}) {
  return resolveEmpiricalGateState(data) === "CURRENT";
}
