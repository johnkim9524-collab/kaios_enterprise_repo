# Track Q QA - Local Activation and External Identity Boundary

**Canonical role ID:** `track-q-quality-evidence-release-assurance`
**Canonical external agent ID:** `track-q-qa-agent`
**Local replacement ID:** `track-q-qa-agent-replacement`
**Track:** Quality, Evidence & Release Assurance
**Local replacement status:** CONDITIONAL - user-invoked only in verified platform sandbox
**Canonical external identity status:** QUARANTINED
**Accountable coordinator:** KPMO

## Local replacement activation

`track-q-qa-agent-replacement` is registered as a user-invoked Copilot CLI profile. Model invocation is disabled. Its permitted tools are `view`, `grep`, `glob`, and `powershell`; every PowerShell command requires the CLI permission prompt. It may inspect a specifically supplied artifact and run documented local checks only when trusted platform execution context confirms session provenance and the platform workspace sandbox for the exact worktree. Repository policy, user statements, workstation configuration, and per-command approval alone do not prove these conditions. If platform context is missing or ambiguous, report `LOCAL_EXCEPTION_UNAVAILABLE`, return HOLD, and do not inspect project files or run project checks. Missing artifact bindings also require HOLD.

A direct, user-initiated local CLI session is not an external agent dispatch. This local profile does not require an external dispatcher, protected launcher, or dispatcher-issued bootstrap receipt to be invoked. It remains limited to local, user-invoked QA. It cannot mutate project files or Git state, access secrets, contact providers, change GitHub, dispatch agents, approve or merge PRs, deploy, publish, or authorize release. A QA PASS is an advisory quality finding only.

The local profile-load smoke and exact `Get-Location` permission-gated command passed on 2026-10-22 with Copilot CLI 1.0.102. They verify profile loading and one command only; they do not establish trusted session provenance or sandbox eligibility. No active local QA invocation or artifact QA result is claimed from this smoke.

## Canonical external identity

The separate GitHub-scoped identity `track-q-qa-agent` remains quarantined because its first recorded task had no independently verified and consumed exact-source readiness receipt. That historical disposition remains in force for the canonical external identity. Do not reuse or dispatch it.

Any future external, cloud, scheduled, or automated Track Q dispatch requires the platform's protected launcher and independently verified one-time bootstrap receipt. Those controls are not provisioned here. Local invocation is available only when the platform-session and sandbox conditions above are verified.

## Preserved first-task evidence

**Transcript role response:** ACCEPT (duties and limits only; not readiness)
**GitHub task ID:** `66d7dcc5-5e73-4a8a-a71e-d44df2dde50b`
**Platform session ID:** `ff0c5089-7ccf-4dc0-85d5-6f106abc1cf3`
**Main commit observed:** `357ac034cee6be0a98d199ff26bf17a0db02634c`
**Profile blob observed:** `4079a89ba1f10a658900df4280e9f43c03310296`
**Readiness disposition:** REJECTED - no independently verified and consumed receipt for that task
**Quarantine disposition:** applies to canonical external identity `track-q-qa-agent` only

The historical source comparisons establish profile content only. They do not attest session provenance, external bootstrap readiness, or receipt consumption. No artifact QA verdict was issued in that first task.

## QA outputs and decision limits

For each review, return an evidence table, source traceability, reproduction record, PASS or HOLD rationale, severity, uncertainty, measurable exit criteria, and customer-quality findings. Bind the review to the exact artifact and method. Preserve rights, evidence, integrity, and reproducibility failures as HOLD. Do not change source facts or methodology, contact providers, commit spend, or approve Production, Public, or G5 release.

## KPMO closeout

The local replacement is registered for user-invoked, permission-gated QA checks, conditional on verified trusted platform session provenance and a platform workspace sandbox. Missing or ambiguous context returns `LOCAL_EXCEPTION_UNAVAILABLE` and HOLD. The canonical external identity remains quarantined. External dispatcher provisioning is not required for an eligible local session.
