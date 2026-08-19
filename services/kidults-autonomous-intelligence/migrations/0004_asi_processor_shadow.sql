PRAGMA foreign_keys = ON;

-- Durable SHADOW source binding. canonical_site_id is the stable host identity;
-- source_id is the purpose/partition-scoped binding. One site may therefore
-- participate in many independent scope/role/purpose partitions. Discovery is
-- never an authorization signal.
CREATE TABLE IF NOT EXISTS asi_source_candidates (
  source_id TEXT PRIMARY KEY,
  canonical_site_id TEXT NOT NULL,
  canonical_host TEXT NOT NULL,
  canonical_host_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  region TEXT NOT NULL,
  language TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  source_role TEXT NOT NULL,
  discovery_engine_fleet TEXT NOT NULL,
  discovery_event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  input_snapshot_ref TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(substr(payload_hash,1,7)='sha256:' AND length(payload_hash)=71 AND substr(payload_hash,8) NOT GLOB '*[^0-9a-f]*'),
  rights_state TEXT NOT NULL CHECK(rights_state IN ('ALLOW','DENY','UNKNOWN','NOT_APPLICABLE')),
  freshness_state TEXT NOT NULL CHECK(freshness_state IN ('CURRENT','STALE','EXPIRED','UNKNOWN')),
  candidate_state TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK(candidate_state IN ('DISCOVERED','HOLD','REJECTED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(canonical_site_id,purpose,partition_key),
  UNIQUE(canonical_host_hash,purpose,partition_key)
);

CREATE INDEX IF NOT EXISTS idx_asi_source_candidates_partition
  ON asi_source_candidates(scope_id,region,language,source_role,candidate_state,last_seen_at);
CREATE INDEX IF NOT EXISTS idx_asi_source_candidates_host
  ON asi_source_candidates(canonical_site_id,canonical_host_hash,purpose,last_seen_at);

CREATE TABLE IF NOT EXISTS asi_source_candidate_observations (
  observation_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES asi_source_candidates(source_id),
  discovery_event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  discovery_engine_fleet TEXT NOT NULL,
  discovery_channel TEXT NOT NULL,
  input_snapshot_ref TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(substr(payload_hash,1,7)='sha256:' AND length(payload_hash)=71 AND substr(payload_hash,8) NOT GLOB '*[^0-9a-f]*'),
  rights_state TEXT NOT NULL CHECK(rights_state IN ('ALLOW','DENY','UNKNOWN','NOT_APPLICABLE')),
  freshness_state TEXT NOT NULL CHECK(freshness_state IN ('CURRENT','STALE','EXPIRED','UNKNOWN')),
  provenance_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance_json) AND json_type(provenance_json)='object'),
  idempotency_key TEXT NOT NULL UNIQUE,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE(source_id,discovery_event_id,discovery_engine_fleet)
);

CREATE INDEX IF NOT EXISTS idx_asi_candidate_observations_source
  ON asi_source_candidate_observations(source_id,observed_at);

-- Current discovery readiness is derived from append-only observations. The
-- immutable candidate row is the first binding, not a forever-frozen rights or
-- freshness decision.
CREATE VIEW IF NOT EXISTS asi_source_candidate_current_observation AS
SELECT
  o.*,
  e.decision AS discovery_decision
FROM asi_source_candidate_observations o
JOIN asi_event_log e ON e.event_id=o.discovery_event_id
WHERE NOT EXISTS (
  SELECT 1 FROM asi_source_candidate_observations newer
  WHERE newer.source_id=o.source_id
    AND (newer.observed_at>o.observed_at OR (newer.observed_at=o.observed_at AND newer.observation_id>o.observation_id))
);

-- Assertions are immutable processor outputs. Re-evaluation or correction is a
-- new row linked with supersedes_assertion_id; Queue/outbox provenance is kept.
CREATE TABLE IF NOT EXISTS asi_processor_assertions (
  assertion_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES asi_source_candidates(source_id),
  purpose TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('CLASSIFICATION','QUALIFICATION')),
  engine_fleet TEXT NOT NULL,
  assertion_type TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('PASS','HOLD','REJECT','NOT_APPLICABLE')),
  rights_state TEXT NOT NULL CHECK(rights_state IN ('ALLOW','DENY','UNKNOWN','NOT_APPLICABLE')),
  freshness_state TEXT NOT NULL CHECK(freshness_state IN ('CURRENT','STALE','EXPIRED','UNKNOWN')),
  event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  causation_event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  source_outbox_id TEXT NOT NULL REFERENCES asi_outbox(id),
  source_message_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  input_snapshot_ref TEXT NOT NULL,
  assertion_payload_hash TEXT NOT NULL CHECK(substr(assertion_payload_hash,1,7)='sha256:' AND length(assertion_payload_hash)=71 AND substr(assertion_payload_hash,8) NOT GLOB '*[^0-9a-f]*'),
  payload_hash TEXT NOT NULL CHECK(substr(payload_hash,1,7)='sha256:' AND length(payload_hash)=71 AND substr(payload_hash,8) NOT GLOB '*[^0-9a-f]*'),
  result_json TEXT NOT NULL CHECK(json_valid(result_json) AND json_type(result_json)='object'),
  reason_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(reason_codes_json) AND json_type(reason_codes_json)='array'),
  engine_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  supersedes_assertion_id TEXT REFERENCES asi_processor_assertions(assertion_id),
  UNIQUE(source_id,purpose,partition_key,engine_fleet,assertion_type,assertion_payload_hash,engine_version)
);

CREATE INDEX IF NOT EXISTS idx_asi_processor_assertions_fan_in
  ON asi_processor_assertions(source_id,purpose,partition_key,stage,engine_fleet,observed_at);
CREATE INDEX IF NOT EXISTS idx_asi_processor_assertions_correlation
  ON asi_processor_assertions(correlation_id,event_id);

-- A fan-in is scoped to one source, purpose, partition and immutable input
-- snapshot. There is deliberately no worldwide/global completion barrier.
CREATE TABLE IF NOT EXISTS asi_processor_fan_in_groups (
  group_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES asi_source_candidates(source_id),
  purpose TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('CLASSIFICATION','QUALIFICATION')),
  correlation_id TEXT NOT NULL,
  input_snapshot_ref TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(source_id,purpose,partition_key,stage,input_snapshot_ref)
);

CREATE TABLE IF NOT EXISTS asi_processor_fan_in_requirements (
  group_id TEXT NOT NULL REFERENCES asi_processor_fan_in_groups(group_id) ON DELETE CASCADE,
  engine_fleet TEXT NOT NULL,
  PRIMARY KEY(group_id,engine_fleet)
);

CREATE TABLE IF NOT EXISTS asi_processor_fan_in_members (
  group_id TEXT NOT NULL,
  engine_fleet TEXT NOT NULL,
  assertion_id TEXT NOT NULL UNIQUE REFERENCES asi_processor_assertions(assertion_id),
  linked_at TEXT NOT NULL,
  PRIMARY KEY(group_id,engine_fleet),
  FOREIGN KEY(group_id,engine_fleet)
    REFERENCES asi_processor_fan_in_requirements(group_id,engine_fleet) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asi_processor_fan_in_member_assertion
  ON asi_processor_fan_in_members(assertion_id,group_id);

-- Canonical fan-in membership is database-seeded so a caller cannot reduce the
-- required fleet set and manufacture readiness.
CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_seed_requirements
AFTER INSERT ON asi_processor_fan_in_groups
BEGIN
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_SITE_IDENTITY_OWNER_LINEAGE' WHERE NEW.stage='CLASSIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_SCOPE_ROLE_CLASSIFICATION' WHERE NEW.stage='CLASSIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_REGION_LANGUAGE_CLASSIFICATION' WHERE NEW.stage='CLASSIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_MARKET_SEMANTICS_CLASSIFICATION' WHERE NEW.stage='CLASSIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_UTILITY_VALUE_ANALYSIS' WHERE NEW.stage='QUALIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS' WHERE NEW.stage='QUALIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS' WHERE NEW.stage='QUALIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_COVERAGE_BIAS_ANALYSIS' WHERE NEW.stage='QUALIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS' WHERE NEW.stage='QUALIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_FRESHNESS_STABILITY_ANALYSIS' WHERE NEW.stage='QUALIFICATION';
  INSERT INTO asi_processor_fan_in_requirements(group_id,engine_fleet)
    SELECT NEW.group_id,'SOURCE_COST_ROI_ANALYSIS' WHERE NEW.stage='QUALIFICATION';
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_candidate_grain_guard
BEFORE INSERT ON asi_processor_fan_in_groups
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM asi_source_candidates c
    WHERE c.source_id=NEW.source_id
      AND c.purpose=NEW.purpose
      AND c.partition_key=NEW.partition_key
  ) THEN RAISE(ABORT,'ASI_FAN_IN_SOURCE_CANDIDATE_GRAIN_MISMATCH') END;
END;

CREATE VIEW IF NOT EXISTS asi_processor_fan_in_readiness AS
SELECT
  g.group_id,
  g.source_id,
  g.purpose,
  g.partition_key,
  g.stage,
  g.correlation_id,
  g.input_snapshot_ref,
  COUNT(r.engine_fleet) AS required_fleet_count,
  SUM(CASE WHEN m.assertion_id IS NOT NULL THEN 1 ELSE 0 END) AS satisfied_fleet_count,
  SUM(CASE WHEN m.assertion_id IS NULL THEN 1 ELSE 0 END) AS missing_fleet_count,
  SUM(CASE WHEN a.decision='PASS' THEN 1 ELSE 0 END) AS pass_count,
  SUM(CASE WHEN a.decision='HOLD' OR a.decision='NOT_APPLICABLE' THEN 1 ELSE 0 END) AS hold_count,
  SUM(CASE WHEN a.decision='REJECT' THEN 1 ELSE 0 END) AS reject_count,
  SUM(CASE WHEN a.rights_state='UNKNOWN' THEN 1 ELSE 0 END) AS unknown_rights_count,
  SUM(CASE WHEN a.rights_state='DENY' THEN 1 ELSE 0 END) AS denied_rights_count,
  SUM(CASE WHEN a.freshness_state<>'CURRENT' THEN 1 ELSE 0 END) AS noncurrent_freshness_count,
  CASE
    WHEN SUM(CASE WHEN a.decision='REJECT' OR a.rights_state='DENY' THEN 1 ELSE 0 END)>0 THEN 'REJECT'
    WHEN SUM(CASE WHEN m.assertion_id IS NULL THEN 1 ELSE 0 END)>0 THEN 'HOLD_MISSING_ASSERTION'
    WHEN SUM(CASE WHEN a.decision<>'PASS' OR a.rights_state='UNKNOWN' OR a.freshness_state<>'CURRENT' THEN 1 ELSE 0 END)>0 THEN 'HOLD'
    ELSE 'READY'
  END AS readiness_state
FROM asi_processor_fan_in_groups g
JOIN asi_processor_fan_in_requirements r ON r.group_id=g.group_id
LEFT JOIN asi_processor_fan_in_members m
  ON m.group_id=r.group_id AND m.engine_fleet=r.engine_fleet
LEFT JOIN asi_processor_assertions a ON a.assertion_id=m.assertion_id
GROUP BY g.group_id,g.source_id,g.purpose,g.partition_key,g.stage,g.correlation_id,g.input_snapshot_ref;

-- Pool decisions are immutable and SHADOW-only. Even a fully qualified source
-- cannot authorize collection, a market claim, projection, or production here.
CREATE TABLE IF NOT EXISTS asi_source_pool_decisions (
  decision_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES asi_source_candidates(source_id),
  purpose TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  pool_state TEXT NOT NULL CHECK(pool_state IN ('CANDIDATE','HOLD','QUALIFIED_INTERNAL_SHADOW','REJECTED','REVOKED')),
  rights_state TEXT NOT NULL CHECK(rights_state IN ('ALLOW','DENY','UNKNOWN','NOT_APPLICABLE')),
  classification_group_id TEXT REFERENCES asi_processor_fan_in_groups(group_id),
  qualification_group_id TEXT REFERENCES asi_processor_fan_in_groups(group_id),
  admission_id TEXT REFERENCES asi_purpose_admissions(admission_id),
  decision_engine_fleet TEXT NOT NULL CHECK(decision_engine_fleet='SOURCE_POOL_EVOLUTION'),
  decision_event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  causation_event_id TEXT NOT NULL REFERENCES asi_event_log(event_id),
  source_outbox_id TEXT NOT NULL REFERENCES asi_outbox(id),
  source_message_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  input_snapshot_ref TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(reason_codes_json) AND json_type(reason_codes_json)='array'),
  acquisition_mode TEXT NOT NULL DEFAULT 'NONE' CHECK(acquisition_mode IN ('NONE','PLAN_ONLY')),
  content_collection_authorized INTEGER NOT NULL DEFAULT 0 CHECK(content_collection_authorized=0),
  market_claim_authorized INTEGER NOT NULL DEFAULT 0 CHECK(market_claim_authorized=0),
  commercial_projection_authorized INTEGER NOT NULL DEFAULT 0 CHECK(commercial_projection_authorized=0),
  production_eligible INTEGER NOT NULL DEFAULT 0 CHECK(production_eligible=0),
  production_state TEXT NOT NULL DEFAULT 'HOLD' CHECK(production_state='HOLD'),
  idempotency_key TEXT NOT NULL UNIQUE,
  decided_at TEXT NOT NULL,
  review_due_at TEXT NOT NULL,
  supersedes_decision_id TEXT REFERENCES asi_source_pool_decisions(decision_id),
  UNIQUE(source_id,purpose,partition_key,decided_at)
);

CREATE INDEX IF NOT EXISTS idx_asi_source_pool_decisions_current
  ON asi_source_pool_decisions(source_id,purpose,partition_key,decided_at);
CREATE INDEX IF NOT EXISTS idx_asi_source_pool_decisions_state
  ON asi_source_pool_decisions(pool_state,rights_state,review_due_at);

-- Production resolves this to SQLite's transaction clock. Tests may replace
-- only this view in their isolated database to inject a deterministic instant;
-- eligibility logic never accepts a caller-supplied timestamp.
CREATE VIEW IF NOT EXISTS asi_source_pool_evaluation_clock AS
SELECT julianday('now') AS now_julianday;

CREATE VIEW IF NOT EXISTS asi_source_pool_latest_decision_audit AS
SELECT d.*
FROM asi_source_pool_decisions d
WHERE NOT EXISTS (
  SELECT 1 FROM asi_source_pool_decisions newer
  WHERE newer.source_id=d.source_id
    AND newer.purpose=d.purpose
    AND newer.partition_key=d.partition_key
    AND (newer.decided_at>d.decided_at OR (newer.decided_at=d.decided_at AND newer.decision_id>d.decision_id))
);

-- Present-tense eligibility is derived fail-closed from the immutable latest
-- decision plus append-only observations, admission lifecycle/expiry, decision
-- expiry and both local fan-ins. `pool_state` is the resolved state; the stored
-- decision remains available only as the explicitly named `recorded_pool_state`.
CREATE VIEW IF NOT EXISTS asi_source_pool_effective AS
WITH evaluation_clock AS (
  SELECT now_julianday FROM asi_source_pool_evaluation_clock
), effective_signals AS (
  SELECT
    d.*,
    o.observation_id AS latest_observation_id,
    o.discovery_event_id AS latest_discovery_event_id,
    o.discovery_decision AS latest_discovery_decision,
    o.rights_state AS latest_discovery_rights_state,
    o.freshness_state AS latest_discovery_freshness_state,
    o.input_snapshot_ref AS latest_discovery_snapshot_ref,
    o.observed_at AS latest_discovery_observed_at,
    a.decision AS current_admission_decision,
    a.rights_state AS current_admission_rights_state,
    a.required_assertion_count AS current_admission_required_assertion_count,
    a.satisfied_assertion_count AS current_admission_satisfied_assertion_count,
    a.input_snapshot_ref AS current_admission_snapshot_ref,
    a.review_due_at AS current_admission_review_due_at,
    a.superseded_at AS current_admission_superseded_at,
    a.revoked_at AS current_admission_revoked_at,
    c.readiness_state AS current_classification_readiness_state,
    q.readiness_state AS current_qualification_readiness_state,
    CASE
      WHEN d.pool_state<>'QUALIFIED_INTERNAL_SHADOW' THEN 'RECORDED_POOL_STATE_' || d.pool_state
      WHEN o.observation_id IS NULL THEN 'LATEST_DISCOVERY_OBSERVATION_MISSING'
      WHEN o.rights_state='DENY' OR o.discovery_decision='REJECT' THEN 'LATEST_DISCOVERY_DENIED_OR_REJECTED'
      WHEN o.discovery_decision IS NULL OR o.discovery_decision<>'PASS' THEN 'LATEST_DISCOVERY_NOT_PASS'
      WHEN o.rights_state<>'ALLOW' THEN 'LATEST_DISCOVERY_RIGHTS_NOT_ALLOW'
      WHEN o.freshness_state<>'CURRENT' THEN 'LATEST_DISCOVERY_NOT_CURRENT'
      WHEN o.input_snapshot_ref<>d.input_snapshot_ref THEN 'LATEST_DISCOVERY_SNAPSHOT_CHANGED'
      WHEN a.admission_id IS NULL THEN 'LINKED_ADMISSION_MISSING'
      WHEN a.revoked_at IS NOT NULL THEN 'LINKED_ADMISSION_REVOKED'
      WHEN a.superseded_at IS NOT NULL THEN 'LINKED_ADMISSION_SUPERSEDED'
      WHEN a.decision<>'PASS' THEN 'LINKED_ADMISSION_NOT_PASS'
      WHEN a.rights_state<>'ALLOW' THEN 'LINKED_ADMISSION_RIGHTS_NOT_ALLOW'
      WHEN a.required_assertion_count<>a.satisfied_assertion_count THEN 'LINKED_ADMISSION_ASSERTIONS_INCOMPLETE'
      WHEN a.input_snapshot_ref<>d.input_snapshot_ref THEN 'LINKED_ADMISSION_SNAPSHOT_MISMATCH'
      WHEN julianday(a.decided_at) IS NULL OR julianday(a.decided_at)>(SELECT now_julianday FROM evaluation_clock) THEN 'LINKED_ADMISSION_NOT_YET_EFFECTIVE'
      WHEN julianday(a.review_due_at) IS NULL OR julianday(a.review_due_at)<=(SELECT now_julianday FROM evaluation_clock) THEN 'LINKED_ADMISSION_EXPIRED'
      WHEN julianday(d.decided_at) IS NULL OR julianday(d.decided_at)>(SELECT now_julianday FROM evaluation_clock) THEN 'POOL_DECISION_NOT_YET_EFFECTIVE'
      WHEN julianday(d.review_due_at) IS NULL OR julianday(d.review_due_at)<=(SELECT now_julianday FROM evaluation_clock) THEN 'POOL_DECISION_EXPIRED'
      WHEN c.group_id IS NULL OR c.readiness_state<>'READY' THEN 'CLASSIFICATION_FAN_IN_NOT_EFFECTIVE'
      WHEN q.group_id IS NULL OR q.readiness_state<>'READY' THEN 'QUALIFICATION_FAN_IN_NOT_EFFECTIVE'
      ELSE 'EFFECTIVE_QUALIFIED_INTERNAL_SHADOW'
    END AS effective_reason_code
  FROM asi_source_pool_latest_decision_audit d
  LEFT JOIN asi_source_candidate_current_observation o ON o.source_id=d.source_id
  LEFT JOIN asi_purpose_admissions a ON a.admission_id=d.admission_id
  LEFT JOIN asi_processor_fan_in_readiness c
    ON c.group_id=d.classification_group_id
    AND c.source_id=d.source_id
    AND c.purpose=d.purpose
    AND c.partition_key=d.partition_key
    AND c.stage='CLASSIFICATION'
    AND c.input_snapshot_ref=d.input_snapshot_ref
  LEFT JOIN asi_processor_fan_in_readiness q
    ON q.group_id=d.qualification_group_id
    AND q.source_id=d.source_id
    AND q.purpose=d.purpose
    AND q.partition_key=d.partition_key
    AND q.stage='QUALIFICATION'
    AND q.input_snapshot_ref=d.input_snapshot_ref
), resolved AS (
  SELECT
    s.*,
    CASE
      WHEN s.pool_state<>'QUALIFIED_INTERNAL_SHADOW' THEN s.pool_state
      WHEN s.effective_reason_code='EFFECTIVE_QUALIFIED_INTERNAL_SHADOW' THEN 'QUALIFIED_INTERNAL_SHADOW'
      WHEN s.effective_reason_code='LATEST_DISCOVERY_DENIED_OR_REJECTED' THEN 'REJECTED'
      WHEN s.effective_reason_code IN ('LINKED_ADMISSION_REVOKED','LINKED_ADMISSION_SUPERSEDED') THEN 'REVOKED'
      ELSE 'HOLD'
    END AS resolved_pool_state,
    CASE
      WHEN s.pool_state='QUALIFIED_INTERNAL_SHADOW'
        AND s.effective_reason_code='EFFECTIVE_QUALIFIED_INTERNAL_SHADOW' THEN 1
      ELSE 0
    END AS resolved_usable
  FROM effective_signals s
)
SELECT
  s.decision_id,
  s.source_id,
  s.purpose,
  s.partition_key,
  s.resolved_pool_state AS pool_state,
  s.pool_state AS recorded_pool_state,
  s.rights_state,
  s.classification_group_id,
  s.qualification_group_id,
  s.admission_id,
  s.decision_engine_fleet,
  s.decision_event_id,
  s.causation_event_id,
  s.source_outbox_id,
  s.source_message_id,
  s.correlation_id,
  s.policy_version,
  s.input_snapshot_ref,
  s.reason_codes_json,
  s.acquisition_mode,
  s.content_collection_authorized,
  s.market_claim_authorized,
  s.commercial_projection_authorized,
  s.production_eligible,
  s.production_state,
  s.idempotency_key,
  s.decided_at,
  s.review_due_at,
  s.supersedes_decision_id,
  s.latest_observation_id,
  s.latest_discovery_event_id,
  s.latest_discovery_decision,
  s.latest_discovery_rights_state,
  s.latest_discovery_freshness_state,
  s.latest_discovery_snapshot_ref,
  s.latest_discovery_observed_at,
  s.current_admission_decision,
  s.current_admission_rights_state,
  s.current_admission_required_assertion_count,
  s.current_admission_satisfied_assertion_count,
  s.current_admission_snapshot_ref,
  s.current_admission_review_due_at,
  s.current_admission_superseded_at,
  s.current_admission_revoked_at,
  s.current_classification_readiness_state,
  s.current_qualification_readiness_state,
  s.effective_reason_code,
  s.resolved_pool_state AS effective_pool_state,
  s.resolved_usable AS effective_usable
FROM resolved s;

-- Canonical consumer view. It deliberately exposes only the fail-closed
-- present-tense `pool_state`; raw latest decisions require the audit view above.
CREATE VIEW IF NOT EXISTS asi_source_pool_current AS
SELECT * FROM asi_source_pool_effective;

-- Immutable identity and evidence. last_seen changes are represented by a new
-- observation, while corrections/supersession are append-only records.
CREATE TRIGGER IF NOT EXISTS trg_asi_source_candidate_identity_immutable
BEFORE UPDATE ON asi_source_candidates
BEGIN
  SELECT RAISE(ABORT,'ASI_SOURCE_CANDIDATE_IMMUTABLE_APPEND_OBSERVATION');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_source_candidate_delete_forbidden
BEFORE DELETE ON asi_source_candidates
BEGIN
  SELECT RAISE(ABORT,'ASI_SOURCE_CANDIDATE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_candidate_observation_immutable
BEFORE UPDATE ON asi_source_candidate_observations
BEGIN
  SELECT RAISE(ABORT,'ASI_SOURCE_OBSERVATION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_candidate_observation_delete_forbidden
BEFORE DELETE ON asi_source_candidate_observations
BEGIN
  SELECT RAISE(ABORT,'ASI_SOURCE_OBSERVATION_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_processor_assertion_immutable
BEFORE UPDATE ON asi_processor_assertions
BEGIN
  SELECT RAISE(ABORT,'ASI_PROCESSOR_ASSERTION_IMMUTABLE_USE_SUPERSESSION');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_processor_assertion_delete_forbidden
BEFORE DELETE ON asi_processor_assertions
BEGIN
  SELECT RAISE(ABORT,'ASI_PROCESSOR_ASSERTION_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_group_immutable
BEFORE UPDATE ON asi_processor_fan_in_groups
BEGIN
  SELECT RAISE(ABORT,'ASI_FAN_IN_GROUP_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_requirement_mutation_forbidden
BEFORE UPDATE ON asi_processor_fan_in_requirements
BEGIN
  SELECT RAISE(ABORT,'ASI_FAN_IN_REQUIREMENT_MUTATION_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_requirement_delete_forbidden
BEFORE DELETE ON asi_processor_fan_in_requirements
BEGIN
  SELECT RAISE(ABORT,'ASI_FAN_IN_REQUIREMENT_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_member_mutation_forbidden
BEFORE UPDATE ON asi_processor_fan_in_members
BEGIN
  SELECT RAISE(ABORT,'ASI_FAN_IN_MEMBER_MUTATION_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_member_delete_forbidden
BEFORE DELETE ON asi_processor_fan_in_members
BEGIN
  SELECT RAISE(ABORT,'ASI_FAN_IN_MEMBER_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_source_pool_decision_immutable
BEFORE UPDATE ON asi_source_pool_decisions
BEGIN
  SELECT RAISE(ABORT,'ASI_SOURCE_POOL_DECISION_IMMUTABLE_USE_SUPERSESSION');
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_source_pool_decision_delete_forbidden
BEFORE DELETE ON asi_source_pool_decisions
BEGIN
  SELECT RAISE(ABORT,'ASI_SOURCE_POOL_DECISION_DELETE_FORBIDDEN');
END;

-- Bind every candidate and observation to a genuine SOURCE_DISCOVERED event.
CREATE TRIGGER IF NOT EXISTS trg_asi_source_candidate_event_provenance
BEFORE INSERT ON asi_source_candidates
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM asi_event_log e
    WHERE e.event_id=NEW.discovery_event_id
      AND e.event_type='SOURCE_DISCOVERED'
      AND e.producer_engine=NEW.discovery_engine_fleet
      AND e.partition_key=NEW.partition_key
      AND e.input_snapshot_ref=NEW.input_snapshot_ref
      AND e.payload_hash=NEW.payload_hash
      AND e.rights_state=NEW.rights_state
      AND e.freshness_state=NEW.freshness_state
      AND e.assertion_purpose=NEW.purpose
      AND json_extract(e.payload_json,'$.source_id')=NEW.source_id
      AND json_type(e.payload_json,'$.discovery_seed.canonical_host')='text'
      AND (
        lower(json_extract(e.payload_json,'$.discovery_seed.canonical_host'))=NEW.canonical_host
        OR (
          substr(lower(json_extract(e.payload_json,'$.discovery_seed.canonical_host')),1,4)='www.'
          AND substr(lower(json_extract(e.payload_json,'$.discovery_seed.canonical_host')),5)=NEW.canonical_host
        )
      )
      AND (
        json_type(e.payload_json,'$.discovery_seed.canonical_site_id') IS NULL
        OR json_extract(e.payload_json,'$.discovery_seed.canonical_site_id')=NEW.canonical_site_id
      )
  ) THEN RAISE(ABORT,'ASI_SOURCE_CANDIDATE_EVENT_PROVENANCE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_asi_candidate_observation_event_provenance
BEFORE INSERT ON asi_source_candidate_observations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM asi_event_log e
    JOIN asi_source_candidates c ON c.source_id=NEW.source_id
    WHERE e.event_id=NEW.discovery_event_id
      AND e.event_type='SOURCE_DISCOVERED'
      AND e.producer_engine=NEW.discovery_engine_fleet
      AND e.partition_key=c.partition_key
      AND e.input_snapshot_ref=NEW.input_snapshot_ref
      AND e.payload_hash=NEW.payload_hash
      AND e.rights_state=NEW.rights_state
      AND e.freshness_state=NEW.freshness_state
      AND e.assertion_purpose=c.purpose
      AND json_extract(e.payload_json,'$.source_id')=NEW.source_id
      AND json_type(e.payload_json,'$.discovery_seed.canonical_host')='text'
      AND (
        lower(json_extract(e.payload_json,'$.discovery_seed.canonical_host'))=c.canonical_host
        OR (
          substr(lower(json_extract(e.payload_json,'$.discovery_seed.canonical_host')),1,4)='www.'
          AND substr(lower(json_extract(e.payload_json,'$.discovery_seed.canonical_host')),5)=c.canonical_host
        )
      )
      AND (
        json_type(e.payload_json,'$.discovery_seed.canonical_site_id') IS NULL
        OR json_extract(e.payload_json,'$.discovery_seed.canonical_site_id')=c.canonical_site_id
      )
  ) THEN RAISE(ABORT,'ASI_SOURCE_OBSERVATION_EVENT_PROVENANCE_MISMATCH') END;
END;

-- Bind assertion rows to their immutable event plus the exact Queue outbox task
-- that caused the processor invocation.
CREATE TRIGGER IF NOT EXISTS trg_asi_processor_assertion_event_provenance
BEFORE INSERT ON asi_processor_assertions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM asi_event_log e
    JOIN asi_outbox o ON o.id=NEW.source_outbox_id
    WHERE e.event_id=NEW.event_id
      AND (
        (NEW.stage='CLASSIFICATION' AND e.event_type='SOURCE_CLASSIFICATION_ASSERTED')
        OR (NEW.stage='QUALIFICATION' AND e.event_type='SOURCE_QUALIFICATION_ASSERTED')
      )
      AND e.producer_engine=NEW.engine_fleet
      AND e.correlation_id=NEW.correlation_id
      AND e.partition_key=NEW.partition_key
      AND e.input_snapshot_ref=NEW.input_snapshot_ref
      AND e.payload_hash=NEW.payload_hash
      AND e.freshness_state=NEW.freshness_state
      AND (
        (NEW.assertion_type LIKE 'FLEET_SUMMARY:%' AND e.rights_state=NEW.rights_state AND e.decision=NEW.decision)
        OR
        (NEW.assertion_type NOT LIKE 'FLEET_SUMMARY:%' AND instr(e.payload_json,NEW.assertion_payload_hash)>0)
      )
      AND o.event_id=NEW.causation_event_id
      AND o.engine_fleet=NEW.engine_fleet
  ) THEN RAISE(ABORT,'ASI_PROCESSOR_ASSERTION_EVENT_OR_OUTBOX_PROVENANCE_MISMATCH') END;
END;

-- A membership may only use the assertion produced for the exact group grain,
-- stage, fleet, correlation and input snapshot.
CREATE TRIGGER IF NOT EXISTS trg_asi_fan_in_member_grain_guard
BEFORE INSERT ON asi_processor_fan_in_members
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM asi_processor_fan_in_groups g
    JOIN asi_processor_assertions a ON a.assertion_id=NEW.assertion_id
    WHERE g.group_id=NEW.group_id
      AND a.source_id=g.source_id
      AND a.purpose=g.purpose
      AND a.partition_key=g.partition_key
      AND a.stage=g.stage
      AND a.engine_fleet=NEW.engine_fleet
      AND a.correlation_id=g.correlation_id
      AND a.input_snapshot_ref=g.input_snapshot_ref
  ) THEN RAISE(ABORT,'ASI_FAN_IN_MEMBER_GRAIN_OR_LINEAGE_MISMATCH') END;
END;

-- Promotion is fail-closed at the storage boundary. HOLD/CANDIDATE decisions may
-- record partial evidence, but QUALIFIED_INTERNAL_SHADOW requires both complete
-- local fan-ins plus a current, fully satisfied PASS/ALLOW purpose admission.
CREATE TRIGGER IF NOT EXISTS trg_asi_source_pool_qualified_guard
BEFORE INSERT ON asi_source_pool_decisions
WHEN NEW.pool_state='QUALIFIED_INTERNAL_SHADOW'
BEGIN
  SELECT CASE WHEN NEW.rights_state<>'ALLOW'
    THEN RAISE(ABORT,'ASI_SOURCE_POOL_QUALIFICATION_REQUIRES_ALLOW_RIGHTS') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM asi_source_candidates c
    JOIN asi_source_candidate_current_observation o ON o.source_id=c.source_id
    WHERE c.source_id=NEW.source_id
      AND c.purpose=NEW.purpose
      AND c.partition_key=NEW.partition_key
      AND o.input_snapshot_ref=NEW.input_snapshot_ref
      AND o.discovery_decision='PASS'
      AND o.rights_state='ALLOW'
      AND o.freshness_state='CURRENT'
  ) THEN RAISE(ABORT,'ASI_SOURCE_POOL_DISCOVERY_CANDIDATE_NOT_READY') END;
  SELECT CASE WHEN NEW.classification_group_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM asi_processor_fan_in_readiness r
    WHERE r.group_id=NEW.classification_group_id
      AND r.source_id=NEW.source_id
      AND r.purpose=NEW.purpose
      AND r.partition_key=NEW.partition_key
      AND r.stage='CLASSIFICATION'
      AND r.input_snapshot_ref=NEW.input_snapshot_ref
      AND r.required_fleet_count=4
      AND r.satisfied_fleet_count=4
      AND r.readiness_state='READY'
  ) THEN RAISE(ABORT,'ASI_SOURCE_POOL_CLASSIFICATION_FAN_IN_NOT_READY') END;
  SELECT CASE WHEN NEW.qualification_group_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM asi_processor_fan_in_readiness r
    WHERE r.group_id=NEW.qualification_group_id
      AND r.source_id=NEW.source_id
      AND r.purpose=NEW.purpose
      AND r.partition_key=NEW.partition_key
      AND r.stage='QUALIFICATION'
      AND r.input_snapshot_ref=NEW.input_snapshot_ref
      AND r.required_fleet_count=7
      AND r.satisfied_fleet_count=7
      AND r.readiness_state='READY'
  ) THEN RAISE(ABORT,'ASI_SOURCE_POOL_QUALIFICATION_FAN_IN_NOT_READY') END;
  SELECT CASE WHEN NEW.admission_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM asi_purpose_admissions a
    WHERE a.admission_id=NEW.admission_id
      AND a.source_id=NEW.source_id
      AND a.purpose=NEW.purpose
      AND a.decision='PASS'
      AND a.rights_state='ALLOW'
      AND a.required_assertion_count=a.satisfied_assertion_count
      AND a.superseded_at IS NULL
      AND a.revoked_at IS NULL
      AND julianday(a.decided_at)<=julianday(NEW.decided_at)
      AND julianday(a.review_due_at)>julianday(NEW.decided_at)
  ) THEN RAISE(ABORT,'ASI_SOURCE_POOL_PURPOSE_ADMISSION_NOT_CURRENT_OR_COMPLETE') END;
END;

-- Every pool decision, including HOLD, must be emitted by the pool-evolution
-- processor and retain exact causation/outbox provenance.
CREATE TRIGGER IF NOT EXISTS trg_asi_source_pool_decision_event_provenance
BEFORE INSERT ON asi_source_pool_decisions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM asi_event_log e
    JOIN asi_event_log cause ON cause.event_id=NEW.causation_event_id
    JOIN asi_outbox o ON o.id=NEW.source_outbox_id
    WHERE e.event_id=NEW.decision_event_id
      AND e.event_type='SOURCE_POOL_DECIDED'
      AND e.producer_engine=NEW.decision_engine_fleet
      AND e.causation_id=NEW.causation_event_id
      AND e.correlation_id=NEW.correlation_id
      AND e.partition_key=NEW.partition_key
      AND e.input_snapshot_ref=NEW.input_snapshot_ref
      AND e.rights_state=NEW.rights_state
      AND (
        (NEW.pool_state='QUALIFIED_INTERNAL_SHADOW' AND e.decision='PASS')
        OR (NEW.pool_state='REJECTED' AND e.decision='REJECT')
        OR (NEW.pool_state NOT IN ('QUALIFIED_INTERNAL_SHADOW','REJECTED') AND e.decision='HOLD')
      )
      AND cause.event_type='SOURCE_PURPOSE_ADMISSION_DECIDED'
      AND cause.correlation_id=NEW.correlation_id
      AND cause.partition_key=NEW.partition_key
      AND o.event_id=NEW.causation_event_id
      AND o.engine_fleet=NEW.decision_engine_fleet
  ) THEN RAISE(ABORT,'ASI_SOURCE_POOL_DECISION_EVENT_OR_OUTBOX_PROVENANCE_MISMATCH') END;
END;
