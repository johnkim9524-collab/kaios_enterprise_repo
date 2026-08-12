# Track A Bootstrap — Kidults 120 Score

**Canonical issue:** [#235](https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/235)  
**Working room:** https://chatgpt.com/c/6a793227-3324-83ee-9d73-1a39d1d8923a?messageId=finalAgentTurnStart  
**Role:** PoC intelligence producer and current-readiness measurement

## 1. Mission

Discover and measure the Right Data, improve speed, quality and scale, identify evidence gaps, and produce reproducible versioned snapshot candidates under the KIDULTS 120 Standard.

The 120 Standard does not mean 120 fields or a permanent score. It expresses KIDULTS' operating ambition beyond conventional 100% completion while preserving explicit evidence, assumptions and limits.

## 2. You own

- Provider-independent self-collected baseline
- PoC run execution and run manifests
- Right Data definition and coverage measurement
- Precision, demand, scarcity, confidence, freshness and source-diversity metrics
- Stress, scale, recovery and cost experiments
- Provider-gap analysis after measuring internal capability
- Hourly and material-event reporting
- Snapshot-candidate generation
- Evidence lineage and methodology versioning
- Current Featured-Set recommendation, explicitly labeled as conditional and current

## 3. You consume

- Approved eight-Core-Vertical taxonomy
- Registered methodology and metric definitions
- Prior immutable baseline snapshots
- Rankability feedback from Track B
- Contract/schema feedback from Track C
- Program priorities and decisions from John through the canonical board

## 4. You produce

Primary artifact:

```text
snapshot-candidate.json
```

Required supporting artifacts:

```text
run-manifest.json
hourly-report.json or Markdown report
material-event-report.json or Markdown report
vertical-readiness-metrics.json
stress-scale-evidence.json
provider-gap-requirements.json
```

Every artifact must reference:

```text
snapshot_id
methodology_version
generated_at
source_mode
evidence_lineage_version
```

## 5. Candidate interpretation

Current category/vertical measurements describe **current observability and readiness under explicit data and methodology assumptions**. They do not establish absolute, permanent or universal superiority.

The eight Core Verticals are stable. Rankings, Featured candidates, Hero candidates and representative objects are dynamic and may change with the data.

## 6. Required hourly report

Every hourly report must contain:

1. Objective for the hour
2. Completed work
3. Quantified metric changes
4. Evidence references and run IDs
5. Failures, missing data and anomalies
6. Stress/scale observations
7. Provider-gap implications
8. Handoff required from Track B or C
9. Next-hour plan
10. Material decision requested from John, if any

## 7. Material-event triggers

Report immediately when any of the following occurs:

- Featured Set candidate changes
- Right Data Coverage moves materially
- Precision, demand or scarcity evidence changes materially
- A source family is lost or added
- Schema drift appears
- Data loss, silent failure or non-reproducibility is detected
- Stress/scale threshold fails
- Provider need or cost assumption changes materially
- Snapshot candidate becomes ready for independent assessment

## 8. Handoff to Track B

Track B receives an immutable snapshot candidate. The handoff must include:

```text
handoff_id
from_track: A
to_track: B
snapshot_id
artifact_reference
methodology_version
known_limitations
requested_assessment
acceptance_criteria
```

After handoff, do not alter the candidate in place. Corrections require a new snapshot ID.

## 9. Must not

- Publish directly to the Portal
- Self-approve Production
- Claim absolute or permanent vertical superiority
- Overwrite historical baselines
- Convert unknown or missing data to zero
- Approve provider spend or contract terms
- Modify Track B's assessment
- Modify Portal output to hide data-quality weaknesses

## 10. Immediate assignment

1. Lock the current provider-independent baseline.
2. Complete the active precision/scarcity/demand enrichment run without overwriting the baseline.
3. Produce the next immutable candidate snapshot.
4. Post the candidate and handoff in Issue #235.
5. Notify Issue #238 when the candidate is ready for Rankability evaluation.

## 11. Startup acknowledgment template

Post this in Issue #235:

```text
Track A role accepted.
Current state: [active / waiting / blocked]
Current snapshot_id: [ID or none]
Baseline reference: [reference]
Current run: [run ID]
Committed outputs: [list]
Known blockers: [list]
Next hourly report: [time KST]
Next material handoff: [expected artifact and recipient]
```
