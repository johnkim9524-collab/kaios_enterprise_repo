BEGIN;

CREATE FUNCTION kidults_control.assert_autonomous_task_snapshot_transition_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, kidults_control
AS $$
BEGIN
  IF NEW.revision = 0 THEN
    IF NEW.state <> 'PENDING' OR NEW.attempt <> 0 OR NEW.lease_owner IS NOT NULL OR NEW.lease_epoch <> 0 THEN
      RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_TASK_INITIAL_SNAPSHOT_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM kidults_control.autonomous_task_transitions transition_row
    WHERE transition_row.task_id = NEW.task_id
      AND transition_row.to_revision = NEW.revision
      AND transition_row.after_digest = NEW.task_digest
      AND transition_row.to_state = NEW.state
  ) THEN
    RAISE EXCEPTION 'KIDULTS_AUTONOMOUS_TASK_TRANSITION_PAIR_REQUIRED' USING ERRCODE = '23503';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER autonomous_task_snapshot_transition_pair
AFTER INSERT ON kidults_control.autonomous_task_snapshots
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION kidults_control.assert_autonomous_task_snapshot_transition_pair();

REVOKE ALL ON FUNCTION kidults_control.assert_autonomous_task_snapshot_transition_pair() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kidults_control.assert_autonomous_task_snapshot_transition_pair()
  TO kidults_control_autonomous_task;

COMMIT;
