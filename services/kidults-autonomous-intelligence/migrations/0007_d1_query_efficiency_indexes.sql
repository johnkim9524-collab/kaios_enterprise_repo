PRAGMA foreign_keys = ON;

-- D1 free-tier hardening: align indexes with actual runtime filters/orderings so
-- bounded reads use index search instead of scanning growing tables.

CREATE INDEX IF NOT EXISTS idx_evidence_status_observed
  ON evidence_ledger(status, observed_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_observations_entity_metric_latest
  ON observations(entity_id, metric_key, observed_at DESC, created_at DESC, evidence_id);
CREATE INDEX IF NOT EXISTS idx_observations_metric_latest
  ON observations(metric_key, entity_id, observed_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_runs_status_finished
  ON intelligence_runs(status, finished_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_category_snapshots_run_score
  ON category_snapshots(run_id, score DESC, category);
CREATE INDEX IF NOT EXISTS idx_publication_snapshots_channel_status_published
  ON publication_snapshots(channel, status, published_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_source_registry_active_family_region
  ON source_registry(is_active, source_family, region);
CREATE INDEX IF NOT EXISTS idx_entity_registry_type
  ON entity_registry(entity_type, id);

-- Scheduled recovery paths: keep due-work selection bounded as history grows.
CREATE INDEX IF NOT EXISTS idx_asi_outbox_recovery_due
  ON asi_outbox(status, next_attempt_at, lease_expires_at, created_at, id);
CREATE INDEX IF NOT EXISTS idx_asi_replay_recovery_due
  ON asi_replay_requests(status, next_attempt_at, lease_expires_at, requested_at, replay_id);
CREATE INDEX IF NOT EXISTS idx_asi_replay_awaiting_requested
  ON asi_replay_requests(status, requested_at, replay_id);
CREATE INDEX IF NOT EXISTS idx_asi_task_leases_active
  ON asi_task_leases(released_at, expires_at, outbox_id, task_event_id);
CREATE INDEX IF NOT EXISTS idx_asi_control_holds_reason
  ON asi_transport_control_holds(reason_code);
