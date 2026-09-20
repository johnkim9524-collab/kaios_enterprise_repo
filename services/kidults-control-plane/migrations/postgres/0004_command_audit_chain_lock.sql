BEGIN;

-- SELECT ... FOR UPDATE requires UPDATE privilege even when rows remain append-only.
-- The append-only trigger continues to reject UPDATE and DELETE operations.
GRANT UPDATE ON kidults_control.audit_events TO
  kidults_control_command, kidults_control_supply;

COMMIT;
