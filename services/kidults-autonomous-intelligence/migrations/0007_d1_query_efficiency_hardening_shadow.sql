PRAGMA foreign_keys = ON;

-- P0 D1 free-tier/query-efficiency hardening.
-- Index-only change: no business-truth or authorization semantics change.

CREATE INDEX IF NOT EXISTS idx_asi_source_candidate_observations_latest
  ON asi_source_candidate_observations(source_id, observed_at DESC, observation_id DESC);
CREATE INDEX IF NOT EXISTS idx_asi_source_pool_decisions_latest
  ON asi_source_pool_decisions(source_id, purpose, partition_key, decided_at DESC, decision_id DESC);
CREATE INDEX IF NOT EXISTS idx_asi_outbox_hot_selection
  ON asi_outbox(status, next_attempt_at, lease_expires_at, fairness_key, created_at, id);
CREATE INDEX IF NOT EXISTS idx_asi_replay_claim_covering
  ON asi_replay_requests(status, next_attempt_at, lease_expires_at, requested_at, replay_id);

-- Dormant intelligence/publication path hardening before future activation.
CREATE INDEX IF NOT EXISTS idx_evidence_status_observed
  ON evidence_ledger(status, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_latest_covering
  ON observations(entity_id, metric_key, observed_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_registry_active_family
  ON source_registry(is_active, source_family);
CREATE INDEX IF NOT EXISTS idx_source_registry_active_region
  ON source_registry(is_active, region);
CREATE INDEX IF NOT EXISTS idx_entity_registry_type
  ON entity_registry(entity_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_runs_status_finished
  ON intelligence_runs(status, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_snapshots_run_score
  ON category_snapshots(run_id, score DESC, category);
CREATE INDEX IF NOT EXISTS idx_publication_snapshots_channel_status_time
  ON publication_snapshots(channel, status, published_at DESC);
