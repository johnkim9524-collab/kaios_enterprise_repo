# Holistic Red Team review: landing readiness isolation

Reviewer: RedTeam-Holistic. Baseline: `afc7895e454539a6599db148bedfb240a01916cf`. Scope: complete baseline-to-candidate change, observer/status artifacts, lifecycle consumption, autonomous finalizer, required ruleset gates, postmerge receipts and trusted-base version transition. Evidence is LOCAL_COMMIT_BOUND; independent GitHub final-head machine verification remains pending.

Verdict: identified blocking defects were corrected in the reviewed local change. No additional blocking defect was found within this review scope. This is not a guarantee that every possible defect is absent, and is not landing authority.

| Finding | Review result | Correction/evidence |
| --- | --- | --- |
| Observer overwrites required landing authorization | FIXED | Observer writes only KIDULTS Landing Readiness V1. Actual inline workflow publisher regressions retain finalizer success for delayed Ready, Draft, failure and non-governed outcomes. |
| Old Ready-cycle success reused on unchanged head | FIXED | Finalizer rereads exhaustive authenticated timeline; consumes trusted readiness only with positive status ID and timestamp strictly after latest Ready and no later than evaluation. |
| Ready boundary changes after required success | FIXED | First valid Ready event is frozen; premerge polling rejects boundary changes with AUTONOMOUS_READY_GENERATION_DRIFT. |
| Same-second status/Ready ambiguity | FIXED | Helper, receipt-only and bound native consumers, and convergence reject timestamp equality; negative regression passes. |
| Draft/closed/reopened invalidation | VERIFIED_REJECTED | Latest Draft or close/reopen invalidates the lifecycle boundary. |
| Old base/main and legacy success reused after upgrade | VERIFIED_REJECTED | Exact generation rejects main drift; legacy required landing success cannot replace isolated readiness. New trusted-base readiness must converge. |

Reviewer independently ran 98 local policy and approval-generation tests with zero failures, plus direct Ready-boundary and atomic lifecycle regressions. KPMO subsequently added a regression executing the actual finalizer live-candidate function against authenticated-source fixtures, including stale/equal/untimed/untrusted signals, lifecycle invalidation and generation changes. These local checks do not substitute for isolated GitHub machine verification.

No ruleset bypass, credential expansion or Production/Public/G5 release was found. Same-second legitimate signals are ambiguous and fail closed with bounded timeout/reconciliation. No distributed atomicity or cross-system exactly-once guarantee is claimed.

Remaining gates: final committed exact-head/tree independent machine verification; actual trusted-base producer transition; exact landed main/tree/parents and push suite; Producer Health Sentinel and final completion receipt. Do not merge before resolving any new blocking findings from those gates.

HTTP 405 tracking remains separate: observer overwrote required success at 2026-10-10T11:31:35Z in finalizer run 38048642143, which then returned AUTONOMOUS_GITHUB_API_405. This is a reproduced race and likely contributor; the sole HTTP cause is not established by available response-body evidence. PR 2642 Owner merge and STAGING success do not retroactively convert that terminal failure into success.

PR 1677 latest natural dispatcher run 38055732282 retains HOLD_RECONCILE / FAMILY_PHASE_INVOCATION_DRAIN_WINDOW with mutation_attempted=false. Existing UNKNOWN is not released or relabeled by this review.

## CI-driven review addendum

The initial local review did not find every downstream compatibility defect. GitHub CI Validation run `38057785754` at head `7647e2bae052cfa5c7f81b384501eba78ea7a10b` failed because the Dispatcher regression still required the old readiness receipt state. Follow-up repository search also found that the registered readiness-consumption validator accepted only the legacy governed state. The earlier verdict is therefore superseded for this expanded consumer compatibility scope.

Correction: producer receipts identify their isolated status context; the consumer accepts the new governed/non-governed readiness states only with that context, exact run/base/head, bounded time, explicit no-promotion/no-landing-authority, correct atomic requirement and HOLD flags. Legacy bounded receipts remain compatible but explicit contradictory promotion or landing-authority claims are rejected. Tests execute the actual workflow publisher and feed its receipts into the consumer. Legacy authority escalation and isolated context/state/authority mismatches fail closed.

Local follow-up: 115 producer/consumer/policy/scope tests passed; the actual Dispatcher regression suite passed 283/283. A pre-existing scope test claimed governance validators were atomic-effect scope although authoritative main already routed internal governance strengthening through AI-020. The test now checks the existing AI-020 and unknown fail-closed route while retaining AWS effect-scope checks; no scope policy was changed for this correction.

The old immutable Draft proposal intent remains historical. Subsequent substantive consumer correction invalidates the derived-metadata-only precondition for using it to create/reissue a proposal. An existing Draft was observed; this session made no Draft create request and no Ready/approval/merge/dispatch/deploy action. Do not certify that old intent as authorization for the updated candidate.

Protected main primary capability classification returns CAPABILITY_GUARD_WEAKENED for the readiness workflow; the independent classifier returns INDEPENDENT_SECURITY_CAPABILITY_CHANGED. These holds are not removed by local review or candidate policy. Exact protected-action authority/reconciliation remains necessary before landing. New exact-head independent CI and exact-main/Sentinel evidence remain separate gates.

Reviewer follow-up: RedTeam-Holistic independently reran the latest producer/consumer/policy/AWS tests: 115/115 passed. The reviewer found no additional blocking code defect within this expanded scope; updated committed-head GitHub CI and protected source-policy gates remain pending. Dispatcher 283/283 is KPMO verification, not reviewer independent re-execution.
