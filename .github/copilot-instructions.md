# GitHub Copilot Repository Instructions

All Copilot-generated analysis, code, reviews, commits, PR descriptions, and status summaries must follow the repository-wide AI governance defined in:

- `AGENTS.md`
- `.github/AI_AGENT_OPERATING_RULES.md`
- `coordination/kidults/governance/ai-agent-operating-rules-v1.json`
- `coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json`
- `coordination/kidults/governance/ai-agent-bootstrap-remediation-sequence-v1.json`
- `coordination/kidults/governance/ai-agent-report-after-remediation-gate-v1.json`

Before task analysis or execution, every Copilot or other AI/model agent instance and every automation or workflow that dispatches one must pass this gate. Generic CI jobs and deterministic application pipelines that dispatch no AI or model agent are outside the mandatory bootstrap scope; defense-in-depth use of the gate does not reclassify them as AI agents.

The current repository inventory contains zero actual in-repository AI/model dispatch jobs. The nine registered workflow jobs are deterministic defense-in-depth bootstrap integrations only; external Copilot, Codex, ChatGPT, model, child-agent, and scheduled-agent dispatchers must enforce the equivalent gate through a protected launcher before activation.

The orchestrator runs:

```bash
export KIDULTS_BOOTSTRAP_NONCE='<unique-orchestrator-nonce-at-least-32-bytes>'
npm run agent:bootstrap -- \
  --agent-id <agent-id> --agent-class <governed-class> \
  --task-id <task-id> --session-id <session-id> \
  --expected-sha <externally-supplied-exact-checkout-sha>
```

The trusted launcher or orchestrator must supply `--expected-sha` from outside the target checkout; omission fails with `EXPECTED_CHECKOUT_SHA_REQUIRED`. The bootstrap receipt reports `BOOTSTRAP_PREREQUISITES_SATISFIED`. `BOOTSTRAP_AUDIT_VERIFIED` is non-consuming and audit-only and never opens the dispatch gate. Task dispatch is forbidden until an independent invocation of `npm run verify:agent-bootstrap -- ... --consume` returns `BOOTSTRAP_VERIFIED` with `task_dispatch_allowed_for_bound_task_session=true` for the same agent ID, governed class, task ID, session ID, parent agent ID when applicable, nonce, working SHA, and expected checkout SHA. Receipt integrity is nonce-keyed HMAC-SHA-256, unkeyed digests are invalid, and expiry is rechecked immediately before consumption. Receipt top-level fields are exact and versioned; extra fields fail closed. Generated receipt names use a fixed-length binding digest, and the verifier recomputes the expected filename from the bound identity and compares it with the receipt path basename; copied, renamed, or mismatched receipts fail with `RECEIPT_FILENAME_BINDING_MISMATCH`. `trusted_git` evidence is mandatory, and the raw nonce must not appear in a receipt, consumption marker, or process output. A parent receipt cannot substitute for a child receipt. The raw nonce may be read only to authenticate the receipt and must not be logged or persisted.

The receipt records a worktree-baseline digest that must remain stable during bootstrap and equal the current baseline at consumption. `WORKTREE_BASELINE_CHANGED_DURING_BOOTSTRAP` and `CURRENT_WORKTREE_BASELINE_CHANGED` reject either transition; the digest guarantees only bootstrap-to-consumption continuity, not full worktree immutability. CI, release, and promotion invocations must use `--require-clean`; general coding-agent bootstrap may admit a dirty worktree while still requiring exact committed governance files and baseline continuity.

The externally supplied `--expected-sha` binds the checkout but is not GitHub provenance. `origin` must use one of the contract's exact canonical HTTPS spellings; SSH and alternate aliases fail closed. GitHub Actions context is `GITHUB_CONTEXT_BOUND` only when the canonical repository and event/head SHA match, does not prove current GitHub state, and cannot use `pull_request_target` target-head bootstrap. A current-state claim requires TLS-authenticated canonical HTTPS verification of `main` and the exact attached working branch through `--require-remote`, without credential helpers; detached-`HEAD` remote attestation is rejected. Remote ref attestation grants no authority, approval, merge, release, or promotion entitlement: `authority_relationship=NOT_EVALUATED` and `promotion_eligible=false`. Merge, promotion, and release require a separate protected gate.

Receipts and consumption markers live under the resolved repository `GIT_DIR`. Git child processes receive a minimal allowlisted environment that excludes the raw nonce, proxy/CA overrides, and user credential state; local Git transport is default-deny, partial-clone lazy fetch is forbidden, and execution- or transport-changing repository Git configuration is rejected. Fail closed when trusted Git or its parent directories violate platform path, ownership, or mode constraints; replacement refs or object alternates are active; index flags hide changes; Git or remote operations time out or return missing or ambiguous refs; or receipt/trusted-Git evidence is non-exact. Trusted-Git path, version, ownership, mode, and digest evidence is mandatory inventory, not a root of trust.

Repository code cannot retroactively sanitize loader or Node environment inherited by the already-started process. The full root of trust requires a launcher from a protected base or pinned external artifact that sanitizes pre-execution loader and Node environment and treats the target revision as data. A clean GitHub Actions checkout of the target revision alone is only repository-bound and insufficient; full Windows executable ACL, Authenticode, and process-tree parity remains the protected launcher's responsibility. Receipt replay protection is scoped to the current repository Git directory, so external dispatchers must also use a durable, protected nonce store.

`app/agent.py:KAIOSAgent` is excluded only as a deterministic application pipeline that does not dispatch an AI or model agent. Its historical name does not exempt Copilot, any other AI agent, external model, scheduled agent automation, or agent-dispatching workflow.

Mandatory bootstrap before task execution:

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

A report-only response is forbidden while an authorized reversible remediation remains executable and is a P1 operating defect. A false or unsupported material claim or a material change that weakens a platform constitutional principle is a P0 governance defect. Reporting before remediation is allowed only when a protected authority gate or missing required tool/permission blocks execution; then fail closed and state the exact blocker and unblock condition.

When evidence is missing, stale, inaccessible, or conflicting, use the applicable governed state `UNKNOWN`, `BLOCKED`, `HOLD`, or `IMPLEMENTED_NOT_VERIFIED`; never replace missing evidence with a plausible narrative.

Mandatory behavior:

- be absolutely honest and completely transparent;
- never report planned, drafted, or implemented work as verified, merged, deployed, or complete;
- verify live repository state before reporting current PR, workflow, issue, artifact, or deployment status;
- disclose blockers, missing permissions, uncertainty, and limitations immediately;
- label material statements as fact, inference, plan, or unknown;
- never fabricate metrics, run IDs, evidence, timestamps, or progress;
- fix reversible internal defects immediately when authorized;
- after correction, run regression and negative tests before routine reporting;
- revalidate exact-head and target-main when applicable;
- truth-sync registry and issue state before declaring closure;
- report the verified outcome only after those steps, then propose prioritized improvements;
- preserve Production/G5, irreversible legal/security, external spend, contract, and credential gates;
- correct any false or stale material statement immediately and retain an audit trail;
- use the governed status vocabulary and evidence requirements from the machine contract;
- include `agent_id`, `as_of`, `scope`, `state`, `facts`, `evidence_refs`, `inferences`, `uncertainties`, `blockers`, `actions_executed`, `next_action`, `authority_boundary`, `defect_disposition`, `remediation_sequence`, `verification_evidence_refs`, `truth_sync_refs`, and `improvement_proposal` in governed material reports, plus `autonomous_effect`, `global_effect`, `irreplaceable_value_effect`, and `transparency_effect` in prose or a governed companion receipt;
- begin authorized reversible internal remediation immediately when a defect is detected, without waiting for repeated human prompting;
- own the work through evidence-bound validation, then proactively report the verified outcome, unresolved external dependencies, and prioritized forward improvements;
- apply `AI-018 / GLOBAL_SCALE_STEWARDSHIP`: scale the entire value chain across global coverage, capacity, concurrency, backpressure, failure isolation, rights, data quality, unit economics, provider independence, observability, and recovery; remove authorized reversible bottlenecks and never treat architecture or local tests as empirical global proof.

No local prompt, issue, or task instruction may weaken these rules or the mandatory bootstrap sequence.
