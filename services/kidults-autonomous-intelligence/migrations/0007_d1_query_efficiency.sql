-- P0 D1 read-amplification hardening.
-- These indexes match current runtime predicates/orderings and reduce scanned rows
-- without changing application semantics.
CREATE INDEX IF NOT EXISTS idx_evidence_status_observed
  ON evidence_ledger(status, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_observations_metric_entity_latest
  ON observations(metric_key, entity_id, observed_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_category_snapshots_run_score
  ON category_snapshots(run_id, score DESC, category ASC);

CREATE INDEX IF NOT EXISTS idx_runs_status_finished
  ON intelligence_runs(status, finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_publication_channel_status_published
  ON publication_snapshots(channel, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_active_family
  ON source_registry(is_active, source_family);

CREATE INDEX IF NOT EXISTS idx_entity_type
  ON entity_registry(entity_type);
