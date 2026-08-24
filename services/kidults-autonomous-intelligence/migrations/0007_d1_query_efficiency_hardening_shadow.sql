PRAGMA foreign_keys = ON;

-- P0 D1 free-tier/query-efficiency hardening.
-- These covering indexes target the append-only latest-state anti-joins used by
-- current-observation/current-decision views. They do not change business truth,
-- rights state, or Production/G5 authorization.

CREATE INDEX IF NOT EXISTS idx_asi_source_candidate_observations_latest
  ON asi_source_candidate_observations(source_id, observed_at DESC, observation_id DESC);

CREATE INDEX IF NOT EXISTS idx_asi_source_pool_decisions_latest
  ON asi_source_pool_decisions(source_id, purpose, partition_key, decided_at DESC, decision_id DESC);

-- Hot relay selection is bounded by state/time/fairness. Keep an explicit
-- covering path for the selection predicate and deterministic tie-breaker.
CREATE INDEX IF NOT EXISTS idx_asi_outbox_hot_selection
  ON asi_outbox(status, next_attempt_at, lease_expires_at, fairness_key, created_at, id);

-- Hot replay claim path. Existing index is retained; this adds the deterministic
-- replay_id tie-breaker so repeated bounded claim scans need not fall back to
-- table ordering as the ledger grows.
CREATE INDEX IF NOT EXISTS idx_asi_replay_claim_covering
  ON asi_replay_requests(status, next_attempt_at, lease_expires_at, requested_at, replay_id);
