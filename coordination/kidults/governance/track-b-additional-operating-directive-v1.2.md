# Track B Additional Operating Directive v1.2

Status: APPROVED / LOCKED FINAL  
Effective: Immediately

## 1. Assessment Reproducibility Rule
For identical `snapshot_id` and identical Evidence Package inputs, Track B must produce the same Assessment. The required sequence is `Snapshot -> Evidence -> Assessment`. If identical inputs produce a different result, the cause must be recorded.

## 2. Assessment Traceability Rule
Every `rankability-assessment.json` must include:
- `assessment_id`
- `snapshot_id`
- `assessment_version`
- `registry_version`
- `methodology_version`
- `evidence_lineage_version`
- `generated_at`
- `assessment_status`

Assessment artifacts must remain reproducible and traceable.

## 3. Recommendation Justification Rule
Every Recommendation must be supported by quantitative Assessment Evidence. At minimum the justification must identify the metric, observed value, required threshold, comparison result, and evidence reference. Recommendation is an explanation of Evidence, not an opinion.

## 4. Assessment Archive Rule
Assessments are never deleted or modified after issuance. A changed evaluation requires a new `assessment_id` (for example `assessment-r001 -> assessment-r002 -> assessment-r003`). Prior assessments are retained in the Assessment Archive Registry.

## Final Operating Lock
Track B operating-rule expansion ends with v1.2. Future official work is limited to generating `rankability-assessment.json` when the v1.1 trigger conditions are fully satisfied.

Track B remains an Independent Validation Authority. It does not create Evidence, Snapshot Candidates, Registries, Portal Releases, Production Decisions, Provider Contracts, or Business Decisions.

> We do not validate schedules. We validate Evidence.
