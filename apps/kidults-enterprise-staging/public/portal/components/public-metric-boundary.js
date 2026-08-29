export const PUBLIC_VERTICAL_METRIC_FIELDS = Object.freeze([
  "current_observation_order",
  "relevant",
  "right_data_coverage_pct",
  "demand_evidence_count",
  "demand_denominator",
  "demand_evidence_pct",
  "scarcity_evidence_count"
]);

const present = value => {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const sentinel = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return !["WAITING", "NONE", "NULL", "NOT_AVAILABLE", "NOT_REGISTERED", "NOT_YET_REGISTERED", "HOLD", "PENDING"].includes(sentinel);
};

export function publicVerticalProjectionReady({ registry, manifest, verticalData }) {
  const candidateId = registry?.snapshot?.candidate_id;
  const assessmentId = registry?.assessment?.current_id;
  const publicProjection = registry?.publication?.public_index_projection;
  return Boolean(
    present(candidateId)
    && registry?.snapshot?.candidate_publication_eligible === true
    && present(assessmentId)
    && registry?.assessment?.overall_rankability === true
    && registry?.assessment?.publication_eligible === true
    && present(publicProjection)
    && manifest?.candidate_snapshot_id === candidateId
    && manifest?.assessment_id === assessmentId
    && verticalData?.source_snapshot_id === candidateId
    && verticalData?.metric_publication_state === "APPROVED_PROJECTION"
  );
}

export function enforcePublicVerticalMetricBoundary({ registry, manifest, verticalData }) {
  if (!verticalData || !Array.isArray(verticalData.verticals)) {
    throw new TypeError("verticalData.verticals is required");
  }
  const projectionReady = publicVerticalProjectionReady({ registry, manifest, verticalData });
  if (projectionReady) {
    return Object.freeze({
      projectionReady: true,
      verticalData,
      withheldFieldCount: 0,
      state: "APPROVED_PROJECTION"
    });
  }

  let withheldFieldCount = 0;
  const sanitized = {
    ...verticalData,
    metric_publication_state: "WITHHELD_PENDING_APPROVED_PROJECTION",
    verticals: verticalData.verticals.map(vertical => {
      const next = { ...vertical };
      for (const field of PUBLIC_VERTICAL_METRIC_FIELDS) {
        if (next[field] !== null) withheldFieldCount += 1;
        next[field] = null;
      }
      return next;
    })
  };
  return Object.freeze({
    projectionReady: false,
    verticalData: sanitized,
    withheldFieldCount,
    state: "WITHHELD_PENDING_APPROVED_PROJECTION"
  });
}
