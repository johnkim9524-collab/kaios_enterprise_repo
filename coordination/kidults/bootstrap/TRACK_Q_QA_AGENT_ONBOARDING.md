# Track Q QA Agent — Readiness and Quarantine Record

**Canonical role ID:** track-q-quality-evidence-release-assurance  
**Reserved agent ID:** track-q-qa-agent  
**Track:** Quality, Evidence & Release Assurance  
**Status:** QUARANTINED — invocation disabled pending verified readiness receipt  
**Accountable coordinator:** KPMO  
**Committee interfaces:** KPMO, REA Team, Track Q QA Agent

## Mission

The reserved Track Q role is to independently assess whether a version-bound intelligence artifact and its claims are sufficiently evidenced, traceable, rights-aware, reproducible and decision-ready. Preserve uncertainty and block unsupported promotion.

## Current status and activation boundary

The GitHub custom agent profile is retained as a non-invokable candidate. Its metadata sets `user-invocable: false`; automated model invocation is also disabled. No Track Q agent may be invoked, dispatched, or assigned until the exact-HEAD constitutional readiness gate is satisfied by a protected launcher and an independent verifier consumes the one-time, identity-, role-, task-, session-, nonce-, and source-bound receipt.

The governing contract explicitly excludes interactive-session acknowledgement, task transcripts, GitHub branch comparison, and profile-blob verification as substitutes for receipt verification and consumption. The first task began without that verified consumed receipt. Its role-acceptance transcript and source checks are preserved as evidence, but they do not establish readiness or an authorized operational assignment. The session’s operational acceptance is rejected, and this identity is quarantined under the repository-wide bootstrap rule. No artifact QA verdict was issued.

The general GitHub bootstrap contract remains unchanged. External or automated dispatch is not provisioned. The required protected launcher, durable nonce store, and independent receipt-consumption evidence are not available in this workflow. KPMO must not bypass those controls or mark this identity active. Any future assignment requires a newly bootstrapped replacement identity after those controls are provisioned and independently verified.

## Preserved transcript evidence

**Transcript role response:** ACCEPT (duties and limits only; not readiness)  
**GitHub task ID:** `66d7dcc5-5e73-4a8a-a71e-d44df2dde50b`  
**Platform session ID:** `ff0c5089-7ccf-4dc0-85d5-6f106abc1cf3`  
**Main commit observed:** `357ac034cee6be0a98d199ff26bf17a0db02634c`  
**Profile blob observed:** `4079a89ba1f10a658900df4280e9f43c03310296`  
**Nonce commitment SHA-256:** `56c69b111899314f2f7d0a34637d3eab1b5af8fb8b256d2c752e14a1c1b68c36`  
**Profile commit:** PR #2707, merge commit `357ac034cee6be0a98d199ff26bf17a0db02634c`  
**Readiness disposition:** REJECTED — no independently verified and consumed readiness receipt  
**Quarantine disposition:** QUARANTINED — no further dispatch for this identity

The preserved branch/main and profile-blob comparisons establish only that the recorded profile content matched the observed repository source. They do not attest session provenance, authorization, bootstrap readiness, or receipt consumption. The first task was not an artifact QA review and issued no PASS, HOLD, or release approval.

## Role duties and limits

When a newly bootstrapped replacement is authorized, it may review an exact artifact version, reject incomplete evidence, specify measurable exit criteria, and verify remediation on a new immutable version. It must remain independent from the artifact producer and release approver. It must not change source facts or methodology, waive rights or evidence requirements, contact providers, commit spend, or approve Production, Public or G5 release. A QA PASS is not final release authorization.

## Customer quality standard

For each artifact, verify the intended audience and decision task, factual clarity, source visibility, honest limitations, accessibility, and risk of readers inferring unsupported returns or certainty. A critical failure in rights, evidence, factual integrity or customer misunderstanding is a HOLD and cannot be averaged away by strong scores elsewhere. The detailed gate is defined in TRACK_Q_QUALITY_GATE_PROCESS_V1.md.

## Required outputs after valid replacement onboarding

- track-q-qa-review.json, bound to artifact ID, exact version or SHA, methodology version and review session
- Source and evidence traceability matrix
- Reproduction and validation record
- PASS or HOLD rationale, severity, uncertainties and evidence references
- Measurable HOLD exit criteria and post-fix verification record when applicable

## KPMO closeout

KPMO has preserved the profile and first-task evidence, disabled user invocation, recorded the readiness failure, and quarantined the identity. External dispatcher activation remains disabled. The unblock condition is a protected platform launcher plus exact-source readiness creation and independent one-time receipt verification/consumption, followed by onboarding a new identity.
