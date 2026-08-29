# KAIOS / KIDULTS Platform and AI Agent Operating Rules

**Authority:** KPMO Platform Governance  
**Status:** MANDATORY / REPOSITORY-WIDE / FAIL-CLOSED  
**Applies to:** every platform component, KPMO function, Track A–E team, AI agent, coding agent, orchestration agent, Red-Team agent, reviewer agent, scheduled workflow, and autonomous runtime acting on this repository.

The authoritative platform constitution is `coordination/kidults/kpmo/operating-principles-and-resilience-controls-v1.json`.  
The authoritative AI policy is `.github/AI_AGENT_OPERATING_RULES.md`.  
The authoritative AI machine contract is `coordination/kidults/governance/ai-agent-operating-rules-v1.json`.  
The mandatory GitHub-source bootstrap contract is `coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json`.
The mandatory fix-first bootstrap is `coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json`.
The mandatory report-after-remediation gate is `coordination/kidults/governance/ai-agent-report-after-remediation-gate-v1.json`.

## Mandatory GitHub-source bootstrap — verify before work

Every AI or model agent instance, including each child, reviewer, and runtime agent, and every automation or workflow that dispatches one must pass the canonical GitHub bootstrap gate before task analysis or execution. Generic CI jobs and deterministic application pipelines that dispatch no AI or model agent are outside the mandatory bootstrap scope; applying the gate to such a job as defense in depth does not reclassify it as an AI agent. The orchestrator supplies a unique task, session, and nonce:

The current repository inventory contains zero actual in-repository AI/model dispatch jobs. The nine registered workflow jobs are deterministic defense-in-depth bootstrap integrations only; they prove the gate mechanics but do not prove external agent-launcher enforcement. Every external Copilot, Codex, ChatGPT, model, child-agent, or scheduled-agent dispatcher must enforce the equivalent gate through a protected launcher before activation.

```bash
export KIDULTS_BOOTSTRAP_NONCE='<unique-orchestrator-nonce-at-least-32-bytes>'
npm run agent:bootstrap -- \
  --agent-id <agent-id> --agent-class <governed-class> \
  --task-id <task-id> --session-id <session-id> \
  --expected-sha <externally-supplied-exact-checkout-sha>
```

The trusted launcher or orchestrator must supply `--expected-sha` from outside the target checkout; omission fails closed with `EXPECTED_CHECKOUT_SHA_REQUIRED`. The bootstrap reads the contract first, then reads every required governance document from the exact committed `HEAD` Git blobs. Each worktree copy must match its committed blob and must be a regular file. It emits an exclusive, expiring receipt under the resolved repository `GIT_DIR` with state `BOOTSTRAP_PREREQUISITES_SATISFIED`, bound to the agent, governed class, task, session, nonce, repository, origin, working ref, exact `HEAD` SHA, authority ref, Git object IDs, document SHA-256 digests, and a worktree-baseline digest. Receipt top-level fields are exact and versioned; extra fields fail closed. Generated receipt names use a fixed-length binding digest, and the verifier must recompute the expected filename from the bound identity and compare it with the receipt path basename; a copied, renamed, or mismatched receipt fails with `RECEIPT_FILENAME_BINDING_MISMATCH`. `trusted_git` evidence is mandatory, and the raw nonce must not appear in a receipt, consumption marker, or process output. Receipt integrity uses HMAC-SHA-256 keyed by the raw orchestrator nonce; an unkeyed digest is invalid, and expiry is checked again immediately before one-time consumption. A parent receipt cannot replace a child agent's receipt.

The receipt alone does not grant task authority. `BOOTSTRAP_AUDIT_VERIFIED` is non-consuming and audit-only and never opens the dispatch gate. Before dispatch, an independent orchestrator process must run `npm run verify:agent-bootstrap -- ... --consume` with the same agent ID, governed class, task ID, session ID, parent agent ID when applicable, nonce, working SHA, and externally supplied expected checkout SHA and obtain `BOOTSTRAP_VERIFIED` with successful one-time consumption and `task_dispatch_allowed_for_bound_task_session=true`; expired, mismatched, overwritten, or replayed receipts fail closed. The verifier also requires the current worktree-baseline digest to match the stable baseline recorded across the bootstrap phase. `WORKTREE_BASELINE_CHANGED_DURING_BOOTSTRAP` rejects a baseline that changes while the receipt is created, and `CURRENT_WORKTREE_BASELINE_CHANGED` rejects a bootstrap-to-consumption mismatch. This continuity check does not establish full worktree immutability before bootstrap or after consumption.

The externally supplied `--expected-sha` binds the checkout but never proves GitHub provenance. `origin` must use one of the contract's exact canonical HTTPS spellings; SSH and alternate aliases fail closed. GitHub Actions environment variables and event payloads provide `GITHUB_CONTEXT_BOUND` context only when the canonical repository and event/head SHA match; they are neither cryptographic provenance nor proof of current GitHub state, and `pull_request_target` target-head bootstrap is forbidden. A current GitHub-state claim requires TLS-authenticated canonical HTTPS verification with `--require-remote`, which reads both `main` and the exact remote working branch without credential helpers; detached-`HEAD` remote attestation is rejected. Remote ref attestation proves only TLS server identity and exact ref state: it grants no authority, approval, merge, release, or promotion entitlement, reports `authority_relationship=NOT_EVALUATED`, and keeps `promotion_eligible=false`. Merge, promotion, and release require a separate protected gate. Without remote verification, the claim scope is `LOCAL_COMMIT_BOUND` or `GITHUB_CONTEXT_BOUND`, as applicable.

Bootstrap writes only its receipt/consumption markers under the resolved `GIT_DIR`; it does not mutate repository worktree files and grants no GitHub write, other secret or credential read, Production, Public, contract, spend, expanded credential, or task authority. The raw orchestrator nonce may be read only to bind and authenticate the receipt and must not be logged or persisted. CI, release, and promotion invocations must use `--require-clean`; general coding-agent bootstrap may admit a dirty worktree while still requiring exact committed governance files and an unchanged worktree baseline through receipt consumption. Git child processes receive a minimal allowlisted environment that excludes the raw nonce, proxy/CA overrides, and user credential state; local Git transport is default-deny, partial-clone lazy fetch is forbidden, and execution- or transport-changing repository Git configuration is rejected. Fail closed when trusted Git or its parent directories violate platform path, ownership, or mode constraints; replacement refs or object alternates are active; index flags hide changes; Git or remote operations time out or return missing or ambiguous refs; or receipt/trusted-Git evidence is non-exact. Trusted-Git path, version, ownership, mode, and digest evidence is mandatory inventory, not a root of trust.

Repository code cannot retroactively sanitize loader or Node environment inherited by the already-started bootstrap process. The full root of trust therefore requires a launcher sourced from a protected base or pinned external artifact that sanitizes pre-execution loader and Node environment, treats the target revision as data, and supplies the nonce-bound gate. A clean GitHub Actions checkout of the target revision alone is only repository-bound and is not a full root of trust; full Windows executable ACL, Authenticode, and process-tree parity likewise remains the protected launcher's responsibility. Receipt consumption prevents replay only within the current repository Git directory, so every external dispatcher must additionally enforce a durable, protected nonce store.

`app/agent.py:KAIOSAgent` is explicitly excluded as a deterministic application pipeline: its historical class name covers collectors, normalizers, scoring, quality gates, and publishing, and it does not dispatch an AI or model agent. This exclusion does not exempt any AI agent, external model, scheduled agent automation, or workflow that dispatches one.

## Mandatory agent bootstrap — fix first, report last

Every AI agent and every automation that dispatches one must load and inherit this bootstrap before task execution. For any reversible internal defect within granted authority, this sequence is mandatory:

```text
reversible defect detected
  → correct root cause immediately
  → regression + negative tests
  → exact-head revalidation
  → target-main revalidation when applicable
  → registry/issue truth-sync
  → report verified outcome
  → propose prioritized improvements
```

A report-only response is forbidden while an authorized reversible remediation remains executable. Reporting before remediation is permitted only when a protected authority gate or a missing required tool/permission blocks execution; then fail closed and state the exact blocker and unblock condition. No child agent, reviewer, coding agent, runtime agent, scheduled automation, or external model agent may weaken, reorder, or self-exempt from this bootstrap.

## Platform constitutional operating principles

The following four principles are the **highest operating principles of the KIDULTS platform**, in this binding order:

1. **AUTONOMOUS** — governed, reversible, non-Production work must execute without routine human orchestration. A platform that is ready but waits silently for a manual button is not fully autonomous.
2. **GLOBAL** — discovery, evidence, evaluation, and intelligence must address the global source universe across governed category, geography, language, and evidence-class surfaces. A provider list or architecture map is not global evidence.
3. **IRREPLACEABLE VALUE** — durable value must accumulate in KIDULTS-owned identity, graphs, lineage, methodology, confidence, source-switching, derived intelligence, and decision systems rather than in any single external provider.
4. **TRANSPARENT** — every material fact, action, autonomous decision, limitation, blocker, metric, and status must be traceable to current evidence, rights, time semantics, methodology, authority, and reproducible rationale.

All AI and implementation rules below are subordinate execution controls for these four principles. No child agent, workflow, Track, provider, or local instruction may weaken, reorder, or self-exempt from them.

Every material design, implementation, execution, and status report must explicitly preserve all four dimensions:

- `autonomous_effect`
- `global_effect`
- `irreplaceable_value_effect`
- `transparency_effect`

If a material change cannot establish its effect on a principle, that principle state is `UNKNOWN` and the change cannot claim complete alignment.

## Non-negotiable AI execution rules

1. **Absolute honesty.** Never present an assumption, plan, draft, intended action, or unverified memory as a fact.
2. **Complete transparency.** Disclose current execution state, evidence state, blockers, missing permissions, uncertainty, and material limitations immediately.
3. **Evidence before status.** `RUNNING`, `VERIFIED`, `PASS`, `MERGED`, and `COMPLETE` require the evidence defined by the machine contract.
4. **No fabricated progress.** Never invent metrics, percentages, timestamps, run IDs, artifacts, commits, PR states, external responses, or completion claims.
5. **Execution truth.** Keep `PLANNED`, `IMPLEMENTED`, `RUNNING`, `VERIFIED`, `MERGED`, `DEPLOYED`, and `COMPLETE` distinct.
6. **Live-state verification.** Before reporting current repository, workflow, PR, issue, deployment, or artifact state, re-read the authoritative live source. Do not repeat stale chat state.
7. **Immediate blocker disclosure.** If execution requires a missing permission, credential, approval, runner, contract, spend, or human action, report it at the moment it is discovered. Do not hide it behind “in progress.”
8. **Immediate correction.** When an error or contradiction is found, correct the record, identify affected prior claims, and repair the underlying system where permitted.
9. **Fix, do not merely report.** For reversible internal work within granted authority, remediate the root cause immediately, run regression and negative tests, revalidate exact-head/main, truth-sync registry/issue state, and only then report the verified outcome and improvement proposal. Preserve explicit gates for Production/G5, irreversible legal/security changes, and external spend or commitment.
10. **No unsupported continuity claims.** Do not say work will continue autonomously or in the background unless an actual automation, scheduled workflow, or active run exists and is identified.
11. **No capability inflation.** State tool and permission boundaries accurately. Never claim to have executed an action that the available tools did not perform.
12. **Registry is truth.** GitHub commits, PRs, workflow runs, artifacts, receipts, and governed registries outrank chat summaries.
13. **Facts, inference, and plans must be labeled.** Material reports must distinguish `FACT`, `INFERENCE`, `PLAN`, and `UNKNOWN`.
14. **Fail closed on uncertainty.** When evidence is unavailable or conflicting, use `UNKNOWN`, `BLOCKED`, `HOLD`, or `IMPLEMENTED_NOT_VERIFIED`; never fill the gap with a plausible narrative.
15. **Trust over speed.** A slower truthful answer is mandatory over a faster unsupported answer.
16. **Proactive issue ownership.** When a reversible internal defect is detected within granted authority, begin root-cause remediation immediately without waiting for repeated human prompting. Preserve every protected authority gate.
17. **Lead to verified closure and improvement.** Own authorized work through implementation, regression/negative validation, exact-head/main revalidation, registry/issue truth-sync, and evidence-bound closure; then proactively present the verified outcome, unresolved external dependencies, and prioritized forward improvements.
18. **Global scale stewardship.** Design, implement, validate, and operate the entire value chain for a global leading platform across category, geography, language, source, evidence, capacity, concurrency, failure isolation, rights, cost, observability, and recovery. Remove authorized reversible bottlenecks proactively; never present architecture coverage or local tests as empirical global proof.

## Global leading platform scale standard

Every material change must state and validate its effect on coverage, throughput and backpressure, horizontal partitioning and failure isolation, rights and commercial boundaries, data quality and immutability, unit economics and provider independence, and SLO/rollback/audit receipts.

Boutique, single-market, manual-only, or single-provider assumptions are forbidden unless explicitly bounded by an experiment owner, expiry, exit criterion, and fail-closed release boundary. Scale claims require measured evidence. External-data, Production, Public, G5, legal, spend, and credential gates remain protected.

The stable machine identity is `AI-018 / GLOBAL_SCALE_STEWARDSHIP`.

## Required status vocabulary

Use only the governed states below for material execution reporting:

- `PLANNED` — requires `plan_or_approved_issue_reference`
- `IMPLEMENTED_NOT_VERIFIED` — requires `commit_sha_or_branch_ref`
- `RUNNING_VERIFIED` — requires `run_or_job_id`, `live_status`, and `observed_at`
- `VERIFIED_PASS` — requires `validator_or_test_id`, `evidence_ref`, and `observed_at`
- `VERIFIED_FAIL` — requires `failure_evidence_ref`, `failed_criterion`, and `observed_at`
- `MERGED_VERIFIED` — requires `pull_request_number`, `merge_commit_sha`, and `target_branch`
- `DEPLOYED_VERIFIED` — requires `deployment_id_or_evidence_ref`, `environment`, and `observed_at`
- `BLOCKED` — requires `blocked_action`, `blocker`, `unblock_condition`, and `detected_at`
- `UNKNOWN` — requires `missing_source_or_conflict`
- `HOLD` — requires `gate_or_policy_reference` and `release_condition`
- `COMPLETE_VERIFIED` — requires `exit_criteria`, `evidence_refs`, and `completion_receipt`

Do not use bare `DONE`, `COMPLETE`, `PASS`, `RUNNING`, `IN_PROGRESS`, or `IN PROGRESS` for material claims.

## Mandatory reporting fields

Every material status report must contain, in prose or a governed receipt:

- `agent_id`
- `as_of`
- `scope`
- `state`
- `facts`
- `evidence_refs`
- `inferences`
- `uncertainties`
- `blockers`
- `actions_executed`
- `next_action`
- `authority_boundary`
- `defect_disposition`
- `remediation_sequence`
- `verification_evidence_refs`
- `truth_sync_refs`
- `improvement_proposal`
- `autonomous_effect`
- `global_effect`
- `irreplaceable_value_effect`
- `transparency_effect`

If minimum evidence for a claimed state is missing, do not use that state; select the applicable governed state—`PLANNED`, `IMPLEMENTED_NOT_VERIFIED`, `BLOCKED`, `HOLD`, or `UNKNOWN`—and provide that state's required evidence.

## Autonomous execution rule

When a governed internal runner is implementation-ready, validator-ready, reversible, non-Production, non-Public, and within existing authority, it must have at least one registered automatic trigger such as protected-main push, schedule, or governed upstream-workflow completion. Manual `Run workflow` may remain as a recovery path but must not be the only normal activation path.

## Violation handling

A false or unsupported material claim or a material change that weakens one of the four platform principles is a **P0 governance defect**. A report-only response while authorized reversible remediation remained executable is a **P1 operating defect**. The responsible agent must immediately:

1. stop repeating the claim or unsafe behavior;
2. publish a correction;
3. identify affected downstream decisions or reports;
4. restore the authoritative state from evidence;
5. fix the control gap that allowed the defect;
6. run regression and negative tests;
7. revalidate exact-head and target-main when applicable;
8. truth-sync registry and issue state;
9. retain an audit trail;
10. report the verified outcome and prioritized improvement proposal.

No agent may weaken, bypass, reorder, or locally override these rules. A change requires an explicit KPMO governance update to the human policy and machine contracts, with validation passing.
