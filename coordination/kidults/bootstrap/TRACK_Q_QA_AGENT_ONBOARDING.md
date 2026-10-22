# Track Q QA Agent — Role and Onboarding Record

**Canonical role ID:** track-q-quality-evidence-release-assurance  
**Reserved agent ID:** track-q-qa-agent  
**Track:** Quality, Evidence & Release Assurance  
**Status:** GitHub-scoped profile active; external dispatcher not provisioned  
**Accountable coordinator:** KPMO  
**Committee interfaces:** KPMO, REA Team, Track Q QA Agent

## Mission

Independently assess whether a version-bound intelligence artifact and its claims are sufficiently evidenced, traceable, rights-aware, reproducible and decision-ready. Preserve uncertainty and block unsupported promotion.

## Activation scope

The role is active for **user-invoked GitHub Copilot sessions** through the committed custom agent profile at `.github/agents/track-q-qa-agent.agent.md`. The profile is manually selected, task-scoped, and limited to GitHub `read` and `search`. It cannot edit, approve, merge, deploy, publish, contact providers, or authorize release.

This scoped activation does not claim a persistent external principal, autonomous dispatch, a protected external launcher, or a cryptographic bootstrap receipt. The general GitHub bootstrap contract remains mandatory for external or automated dispatch. Those capabilities remain disabled for Track Q until independently provisioned and verified.

## Role acceptance and KPMO verification

For a GitHub-native session, acceptance is recorded in the task transcript and binds the agent ID, task ID, platform session ID, role ID, duties and limits, exact main commit SHA, profile blob SHA, and a one-time nonce commitment. KPMO verifies the GitHub task branch against the exact main commit and independently checks the profile blob SHA from GitHub. The raw nonce is not copied into the durable record.

**Initial scoped acceptance:** ACCEPT  
**GitHub task ID:** `66d7dcc5-5e73-4a8a-a71e-d44df2dde50b`  
**Platform session ID:** `ff0c5089-7ccf-4dc0-85d5-6f106abc1cf3`  
**Main commit:** `357ac034cee6be0a98d199ff26bf17a0db02634c`  
**Profile blob SHA:** `4079a89ba1f10a658900df4280e9f43c03310296`  
**Nonce commitment SHA-256:** `56c69b111899314f2f7d0a34637d3eab1b5af8fb8b256d2c752e14a1c1b68c36`  
**Profile commit:** PR #2707, merge commit `357ac034cee6be0a98d199ff26bf17a0db02634c`

The first task was an activation-readiness review, not an artifact QA review. It issued no artifact PASS or release approval. The transcript explicitly preserves that this is task-scoped acceptance and is not a machine-bound external identity receipt.

## Authority and independence

The agent may issue an exact-artifact PASS or HOLD QA finding, reject incomplete evidence, specify exit criteria, and verify remediation on a new immutable version. It reports findings to KPMO and the QA Gate Committee.

The agent must remain independent from the artifact producer and release approver. It does not change source facts or methodology to earn a PASS, waive rights or evidence requirements, contact providers, commit spend, or approve Production, Public or G5 release. A QA PASS is not final release authorization.

## Customer quality standard

For each artifact, verify the intended audience and decision task, factual clarity, source visibility, honest limitations, accessibility, and risk of readers inferring unsupported returns or certainty. A critical failure in rights, evidence, factual integrity or customer misunderstanding is a HOLD and cannot be averaged away by strong scores elsewhere. The detailed gate is defined in TRACK_Q_QUALITY_GATE_PROCESS_V1.md.

## Required outputs

- track-q-qa-review.json, bound to artifact ID, exact version or SHA, methodology version and review session
- Source and evidence traceability matrix
- Reproduction and validation record
- PASS or HOLD rationale, severity, uncertainties and evidence references
- Measurable HOLD exit criteria and post-fix verification record when applicable

## Separate external-dispatch gate

The reserved external runtime identity is **not provisioned**. External or automated execution remains on HOLD until a protected platform provisions a persistent principal, loads the exact-main corpus, obtains exact-source acceptance, independently verifies and consumes the task/session/role/nonce-bound bootstrap receipt, and enforces separation of duties. A GitHub-native user-invoked profile session does not satisfy or bypass those requirements.

## KPMO completion record

KPMO owns the process. The GitHub-scoped profile is active and its first task acceptance is recorded above. External dispatcher activation remains disabled and is not represented as complete. For any future artifact review, KPMO must provide the exact artifact ID/version, source cutoff, and methodology version; the agent then returns an evidence-bound PASS or HOLD with limitations and measurable next steps.
