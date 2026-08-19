-- A task processor may issue more than one D1 write batch while it owns a
-- lease.  The runtime prepends a row to this transient guard table to every
-- processor write batch.  The BEFORE trigger is evaluated inside the same D1
-- transaction as the processor writes and aborts that transaction if either
-- the opaque owner token or the monotonically increasing lease epoch drifted.
-- The AFTER trigger removes successful checks so this is not an evidence log.
CREATE TABLE IF NOT EXISTS asi_task_lease_write_fences (
  fence_check_id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL,
  task_event_id TEXT NOT NULL,
  lease_owner TEXT NOT NULL,
  lease_epoch INTEGER NOT NULL CHECK(lease_epoch > 0),
  checked_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_asi_task_lease_write_fence_active
BEFORE INSERT ON asi_task_lease_write_fences
WHEN NOT EXISTS (
  SELECT 1
  FROM asi_task_leases l
  WHERE l.outbox_id=NEW.outbox_id
    AND l.task_event_id=NEW.task_event_id
    AND l.lease_owner=NEW.lease_owner
    AND l.attempt_count=NEW.lease_epoch
    AND l.released_at IS NULL
    AND datetime(l.expires_at)>datetime('now')
)
BEGIN
  SELECT RAISE(ABORT,'ASI_TASK_LEASE_FENCE_LOST');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_task_lease_write_fence_ephemeral
AFTER INSERT ON asi_task_lease_write_fences
BEGIN
  DELETE FROM asi_task_lease_write_fences WHERE fence_check_id=NEW.fence_check_id;
END;
