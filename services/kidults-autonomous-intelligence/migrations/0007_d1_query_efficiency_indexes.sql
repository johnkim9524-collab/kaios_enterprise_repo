PRAGMA foreign_keys = ON;

-- D1 free-tier hardening: align indexes with actual runtime filters/orderings so
-- bounded reads use index search instead of scanning growing tables.

-- Accepted-evidence count/cutoff and evidence joins.
CREATE INDEX IF NOT EXISTS idx_evidence_status_observed
  ON evidence_ledger(status, observed_at DESC, id);

-- Latest observation per entity/metric; created_at is the deterministic tie-break.
CREATE INDEX IF NOT EXISTS idx_observations_entity_metric_latest
  ON observations(entity_id, metric_key, observed_at DESC, created_at DESC, evidence_id);

-- Metric-specific latest aggregations (for example active_listings).
CREATE INDEX IF NOT EXISTS idx_observations_metric_latest
  ON observations(metric_key, entity_id, observed_at DESC, created_at DESC);

-- Latest successful intelligence run / previous-run lookup.
CREATE INDEX IF NOT EXISTS idx_intelligence_runs_status_finished
  ON intelligence_runs(status, finished_at DESC, id);

-- Portal category projection by run and score.
CREATE INDEX IF NOT EXISTS idx_category_snapshots_run_score
  ON category_snapshots(run_id, score DESC, category);

-- Latest published payload lookup.
CREATE INDEX IF NOT EXISTS idx_publication_snapshots_channel_status_published
  ON publication_snapshots(channel, status, published_at DESC, id);

-- Active source family/region aggregation and brand coverage count.
CREATE INDEX IF NOT EXISTS idx_source_registry_active_family_region
  ON source_registry(is_active, source_family, region);
CREATE INDEX IF NOT EXISTS idx_entity_registry_type
  ON entity_registry(entity_type, id);
