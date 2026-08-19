PRAGMA foreign_keys = ON;

-- A runtime outbox must carry the same canonical partition grain as its
-- immutable source event.  Existing rows are backfilled before the columns
-- become inputs to the fair relay.  D1 applies each migration exactly once.
ALTER TABLE asi_outbox ADD COLUMN partition_key TEXT;
ALTER TABLE asi_outbox ADD COLUMN fairness_key TEXT;
ALTER TABLE asi_outbox ADD COLUMN control_hold_count INTEGER NOT NULL DEFAULT 0;

UPDATE asi_outbox
SET partition_key=(SELECT e.partition_key FROM asi_event_log e WHERE e.event_id=asi_outbox.event_id),
    fairness_key=(
      SELECT 'fairness:v1:' || json_array(
        asi_outbox.engine_fleet,
        json_extract(substr(e.partition_key,14),'$[0]'),
        json_extract(substr(e.partition_key,14),'$[1]'),
        json_extract(substr(e.partition_key,14),'$[2]'),
        json_extract(substr(e.partition_key,14),'$[3]'),
        json_extract(substr(e.partition_key,14),'$[4]')
      ) FROM asi_event_log e WHERE e.event_id=asi_outbox.event_id
    )
WHERE partition_key IS NULL OR fairness_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_asi_outbox_fair_relay
  ON asi_outbox(status, next_attempt_at, fairness_key, created_at, id);

-- Persistent selection history prevents a hot partition from winning every
-- bounded relay cycle.  `fairness_key` is fairness:v1 and therefore includes
-- fleet, channel, region, language, scope and source role. Canonical-host work remains
-- isolated by `partition_key`; excluding it here prevents a large source from
-- starving peer market cells within bounded relay cycles.
CREATE TABLE IF NOT EXISTS asi_relay_fairness (
  fairness_key TEXT PRIMARY KEY,
  last_partition_key TEXT NOT NULL,
  selection_count INTEGER NOT NULL DEFAULT 0 CHECK(selection_count >= 0),
  dispatch_count INTEGER NOT NULL DEFAULT 0 CHECK(dispatch_count >= 0),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count >= 0),
  dead_letter_count INTEGER NOT NULL DEFAULT 0 CHECK(dead_letter_count >= 0),
  hold_count INTEGER NOT NULL DEFAULT 0 CHECK(hold_count >= 0),
  last_outbox_id TEXT REFERENCES asi_outbox(id),
  last_selected_at TEXT,
  updated_at TEXT NOT NULL
);

-- The original A3 tables intentionally reserved recovery controls.  A5 adds
-- bounded leases and append-only attempt evidence without replacing them.
ALTER TABLE asi_task_leases ADD COLUMN outbox_id TEXT REFERENCES asi_outbox(id);
ALTER TABLE asi_task_leases ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asi_task_leases ADD COLUMN last_error TEXT;

ALTER TABLE asi_replay_requests ADD COLUMN lease_owner TEXT;
ALTER TABLE asi_replay_requests ADD COLUMN lease_expires_at TEXT;
ALTER TABLE asi_replay_requests ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asi_replay_requests ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 2;
ALTER TABLE asi_replay_requests ADD COLUMN next_attempt_at TEXT;
ALTER TABLE asi_replay_requests ADD COLUMN last_error TEXT;
ALTER TABLE asi_replay_requests ADD COLUMN terminal_reason TEXT;
ALTER TABLE asi_replay_requests ADD COLUMN outbox_id TEXT REFERENCES asi_outbox(id);

CREATE INDEX IF NOT EXISTS idx_asi_replay_claim
  ON asi_replay_requests(status, next_attempt_at, lease_expires_at, requested_at);

CREATE TRIGGER IF NOT EXISTS trg_asi_replay_bounds_insert
BEFORE INSERT ON asi_replay_requests
WHEN NEW.max_attempts < 1 OR NEW.max_attempts > 2 OR NEW.attempt_count < 0
  OR NEW.attempt_count > NEW.max_attempts
  OR NEW.status NOT IN ('PENDING','RUNNING','RETRY','AWAITING_CONSUMER','COMPLETED','HOLD')
BEGIN
  SELECT RAISE(ABORT,'ASI_REPLAY_BOUNDS_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_replay_bounds_update
BEFORE UPDATE OF max_attempts,attempt_count,status ON asi_replay_requests
WHEN NEW.max_attempts < 1 OR NEW.max_attempts > 2 OR NEW.attempt_count < 0
  OR NEW.attempt_count > NEW.max_attempts
  OR NEW.status NOT IN ('PENDING','RUNNING','RETRY','AWAITING_CONSUMER','COMPLETED','HOLD')
BEGIN
  SELECT RAISE(ABORT,'ASI_REPLAY_BOUNDS_INVALID');
END;

CREATE TABLE IF NOT EXISTS asi_replay_attempts (
  attempt_id TEXT PRIMARY KEY,
  replay_id TEXT NOT NULL REFERENCES asi_replay_requests(replay_id),
  outbox_id TEXT REFERENCES asi_outbox(id),
  attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
  state TEXT NOT NULL CHECK(state IN (
    'CLAIMED','DISPATCHED','AWAITING_CONSUMER','COMPLETED','RETRY','HOLD'
  )),
  reason_code TEXT NOT NULL,
  lease_owner TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(replay_id, attempt_number)
);

ALTER TABLE asi_circuit_breakers ADD COLUMN consecutive_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asi_circuit_breakers ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asi_circuit_breakers ADD COLUMN opened_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asi_circuit_breakers ADD COLUMN probe_lease_owner TEXT;
ALTER TABLE asi_circuit_breakers ADD COLUMN probe_lease_expires_at TEXT;
ALTER TABLE asi_circuit_breakers ADD COLUMN last_success_at TEXT;
ALTER TABLE asi_circuit_breakers ADD COLUMN last_failure_at TEXT;

CREATE TRIGGER IF NOT EXISTS trg_asi_circuit_state_insert
BEFORE INSERT ON asi_circuit_breakers
WHEN NEW.state NOT IN ('CLOSED','OPEN','HALF_OPEN')
BEGIN
  SELECT RAISE(ABORT,'ASI_CIRCUIT_STATE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_circuit_state_update
BEFORE UPDATE OF state ON asi_circuit_breakers
WHEN NEW.state NOT IN ('CLOSED','OPEN','HALF_OPEN')
BEGIN
  SELECT RAISE(ABORT,'ASI_CIRCUIT_STATE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fleet_budget_guard_insert
BEFORE INSERT ON asi_fleet_budgets
WHEN NEW.request_limit < 1 OR NEW.request_used < 0 OR NEW.request_used > NEW.request_limit
  OR NEW.cost_limit_microunits < 0 OR NEW.cost_used_microunits < 0
  OR NEW.cost_used_microunits > NEW.cost_limit_microunits
BEGIN
  SELECT RAISE(ABORT,'ASI_FLEET_BUDGET_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fleet_budget_guard_update
BEFORE UPDATE OF request_limit,request_used,cost_limit_microunits,cost_used_microunits ON asi_fleet_budgets
WHEN NEW.request_limit < 1 OR NEW.request_used < 0 OR NEW.request_used > NEW.request_limit
  OR NEW.cost_limit_microunits < 0 OR NEW.cost_used_microunits < 0
  OR NEW.cost_used_microunits > NEW.cost_limit_microunits
BEGIN
  SELECT RAISE(ABORT,'ASI_FLEET_BUDGET_INVALID');
END;

-- Only actual Queue send attempts are retained here. Circuit/budget holds do
-- not consume attempt_count and are recorded in the separate control ledger.
CREATE TABLE IF NOT EXISTS asi_transport_attempts (
  attempt_id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL REFERENCES asi_outbox(id),
  engine_fleet TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
  dispatch_kind TEXT NOT NULL CHECK(dispatch_kind IN ('NORMAL','REPLAY')),
  outcome TEXT NOT NULL CHECK(outcome IN ('DISPATCHED','RETRY','DEAD_LETTERED')),
  circuit_state TEXT NOT NULL,
  budget_window TEXT NOT NULL,
  error_code TEXT,
  attempted_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_asi_transport_attempt_outbox
  ON asi_transport_attempts(outbox_id, attempted_at);

CREATE TABLE IF NOT EXISTS asi_transport_control_holds (
  hold_id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL REFERENCES asi_outbox(id),
  engine_fleet TEXT NOT NULL,
  control_hold_number INTEGER NOT NULL CHECK(control_hold_number > 0),
  dispatch_kind TEXT NOT NULL CHECK(dispatch_kind IN ('NORMAL','REPLAY')),
  reason_code TEXT NOT NULL CHECK(reason_code IN ('ASI_CIRCUIT_HOLD','ASI_BUDGET_HOLD')),
  circuit_state TEXT NOT NULL CHECK(circuit_state IN ('CLOSED','OPEN','HALF_OPEN')),
  budget_window TEXT NOT NULL,
  held_at TEXT NOT NULL,
  UNIQUE(outbox_id, control_hold_number)
);

CREATE INDEX IF NOT EXISTS idx_asi_transport_control_hold_outbox
  ON asi_transport_control_holds(outbox_id, held_at);

-- The shared Cloudflare DLQ has finite retries.  The Worker therefore ACKs a
-- terminal message only after this D1 ledger and asi_dead_letters are written
-- in one transaction.  This is an at-least-once persistence boundary, not an
-- end-to-end no-loss guarantee when both Queue delivery and D1 are unavailable.
CREATE TABLE IF NOT EXISTS asi_terminal_dlq_receipts (
  receipt_id TEXT PRIMARY KEY,
  receipt_type TEXT NOT NULL CHECK(receipt_type IN (
    'CLOUDFLARE_QUEUE_DLQ','OUTBOX_DISPATCH_EXHAUSTED','OUTBOX_TERMINAL_HOLD'
  )),
  dlq_queue_name TEXT NOT NULL,
  source_queue_name TEXT,
  message_id TEXT NOT NULL,
  event_id TEXT,
  outbox_id TEXT REFERENCES asi_outbox(id),
  payload_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes >= 0),
  operating_state TEXT NOT NULL DEFAULT 'HOLD' CHECK(operating_state IN ('HOLD','REPLAYED')),
  replay_required INTEGER NOT NULL DEFAULT 1 CHECK(replay_required IN (0,1)),
  ack_policy TEXT NOT NULL CHECK(ack_policy IN (
    'ACK_AFTER_D1_PERSIST','NO_QUEUE_ACK_OUTBOX_TERMINAL'
  )),
  ack_requested INTEGER NOT NULL DEFAULT 0 CHECK(ack_requested IN (0,1)),
  loss_guarantee INTEGER NOT NULL DEFAULT 0 CHECK(loss_guarantee=0),
  health_counted INTEGER NOT NULL DEFAULT 0 CHECK(health_counted IN (0,1)),
  recorded_at TEXT NOT NULL,
  UNIQUE(receipt_type, dlq_queue_name, message_id)
);

ALTER TABLE asi_dead_letters ADD COLUMN terminal_receipt_id TEXT;
ALTER TABLE asi_dead_letters ADD COLUMN operating_state TEXT NOT NULL DEFAULT 'HOLD';
ALTER TABLE asi_dead_letters ADD COLUMN replay_required INTEGER NOT NULL DEFAULT 1;

CREATE VIEW IF NOT EXISTS asi_runtime_recovery_holds AS
SELECT
  'TERMINAL_DLQ' AS hold_class,
  receipt_id AS hold_id,
  event_id,
  source_queue_name AS queue_name,
  recorded_at,
  operating_state,
  'EXPLICIT_REPLAY_REVIEW_REQUIRED' AS reason_code
FROM asi_terminal_dlq_receipts
WHERE replay_required=1
UNION ALL
SELECT
  'REPLAY' AS hold_class,
  replay_id AS hold_id,
  source_event_id AS event_id,
  NULL AS queue_name,
  requested_at AS recorded_at,
  'HOLD' AS operating_state,
  COALESCE(terminal_reason,last_error,'REPLAY_NOT_COMPLETED') AS reason_code
FROM asi_replay_requests
WHERE status IN ('HOLD','RETRY','PENDING','RUNNING','AWAITING_CONSUMER');
