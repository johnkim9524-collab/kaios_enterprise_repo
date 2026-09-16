# KIDULTS Platform Constitution

**Version:** 1.0.0

**Owner:** Program Owner

**Authority:** KIDULTS Executive Directive — Master Execution Order — FINAL

**Effective Date:** 2026-09-16

**Revision Policy:** Changes require explicit Program Owner approval, a version increment, repository review, constitutional validation, and append-only retention of prior versions and evidence. No subordinate policy, workflow, runtime, repository instruction, or agent instruction may silently amend, weaken, or override this Constitution.

**Constitution Status:** ACTIVE / PERMANENT / REPOSITORY-WIDE / FAIL-CLOSED

This Constitution is the single human-readable governing authority for KIDULTS architecture, operation, engineering, governance, validation, and AI execution. Machine contracts and detailed policies implement this Constitution and remain subordinate to it.

## Mission

Build, operate and continuously evolve KIDULTS into a platform that remains correct, deterministic, recoverable and maintainable for the next decade.

The platform shall never depend upon:

- a specific engineer;
- a specific AI;
- a specific repository;
- a temporary workflow; or
- undocumented knowledge.

Every action shall improve long-term operation.

Never optimize for today's completion.

Always optimize for permanent correctness.

## Primary Objective

The platform shall continuously become:

- simpler;
- stronger;
- more deterministic;
- more recoverable;
- more observable; and
- more maintainable.

Every accepted change must improve at least one of these properties without degrading the others.

## Execution Principles

Development exists to improve operation.

Operation has higher priority than development.

Correctness has higher priority than speed.

Evidence has higher priority than opinion.

Architecture has higher priority than implementation.

## Single Source of Truth

Every operational domain SHALL expose exactly one:

- Truth;
- Registry;
- Runtime;
- Leader;
- State;
- Receipt; and
- Authority.

Multiple truths are forbidden.

Hidden state is forbidden.

Duplicate authority is forbidden.

## Architecture

Every change SHALL:

- reduce complexity;
- reduce coupling;
- reduce duplication;
- reduce operational entropy;
- increase determinism;
- increase observability;
- increase recoverability; and
- increase maintainability.

If it cannot satisfy these conditions, the change SHALL NOT be accepted.

## Runtime

Every runtime SHALL:

- produce deterministic output;
- support restart;
- support replay;
- support recovery;
- support independent validation; and
- support replacement.

No runtime SHALL become a permanent dependency.

## Failure

Unknown SHALL NEVER become PASS.

Unknown SHALL become HOLD.

Every HOLD SHALL contain:

- Root Cause;
- Classification;
- Receipt;
- Recovery Path;
- Owner; and
- Exit Condition.

No hidden failure.

No silent success.

## Recovery

Every failure SHALL automatically progress through:

```text
Detect
↓
Classify
↓
Contain
↓
Recover
↓
Verify
↓
Resume
```

Recovery SHALL strengthen the platform.

Recovery SHALL NEVER weaken validation.

Recovery SHALL NEVER weaken governance.

## Validation

Every important change SHALL pass:

- Static Validation;
- Runtime Validation;
- Regression Validation;
- Natural Validation; and
- Operational Validation.

CI alone is NEVER sufficient.

Merge alone is NEVER sufficient.

Protected Main natural execution is the authoritative proof.

## Governance

Governance exists to protect operation.

Governance SHALL NEVER become permanent operational debt.

Every governance gate SHALL define:

- Purpose;
- Owner;
- Recovery Path;
- Timeout;
- Escalation;
- Audit Receipt; and
- Exit Condition.

Governance SHALL remain deterministic.

## Evidence

Evidence, Receipts, Artifacts, Digests, Ledgers, and Canonical Truth SHALL be append-only.

Historical evidence SHALL NEVER be rewritten.

## Data

Unknown remains Unknown.

Derived data preserves Provenance.

Evidence SHALL NEVER become Market Truth without explicit validation.

## Security

- Least Privilege.
- Explicit Authority.
- Immutable Audit.
- No Hidden Execution.
- No Silent Override.
- No Implicit Promotion.

## Regression

Every repaired defect SHALL permanently become:

- Architecture;
- Policy;
- Validation;
- Automated Regression;
- Automated Recovery; and
- Documentation.

The same defect SHALL NEVER require investigation twice.

## AI Directive

AI SHALL:

- reduce operational risk;
- reduce complexity;
- increase maintainability;
- increase observability; and
- increase determinism.

AI SHALL NEVER:

- fabricate success;
- fabricate completion;
- fabricate evidence;
- hide uncertainty;
- weaken validation;
- weaken governance;
- create hidden state; or
- bypass policy.

When uncertain, produce HOLD, never PASS.

## Development

Development SHALL optimize:

- correctness;
- maintainability;
- simplicity; and
- recoverability.

Every change SHALL include:

- Purpose;
- Risk;
- Rollback;
- Recovery;
- Validation; and
- Long-term Impact.

Otherwise, the change SHALL NOT exist.

## Long-Term Operation

The platform SHALL continue operating correctly even if:

- every engineer changes;
- every AI changes;
- every repository changes; and
- every workflow changes.

Correctness SHALL depend only upon architecture.

## Program Owner

Program Owner defines intent.

Architecture enforces correctness.

No person, AI, workflow, repository, vendor, or infrastructure component SHALL become a single point of failure.

## Success

Success is NOT:

- Green CI;
- Green PR;
- Green Merge; or
- Successful Deployment.

Success IS years of uninterrupted, correct, recoverable, auditable, deterministic operation.

## Mandatory Execution Rule

Every accepted change MUST leave the platform:

- simpler;
- stronger;
- more deterministic;
- more recoverable;
- more observable; and
- more maintainable

than before.

Otherwise, the change SHALL NOT be accepted.

## Permanent Rule

A defect that has once been resolved SHALL NEVER become an operational problem again.

Every resolved defect SHALL permanently become:

- Architecture;
- Governance;
- Validation;
- Regression;
- Documentation;
- Automated Recovery; and
- Operational Knowledge.

## Final Execution Order

Every AI, Engineer, Workflow, Repository, Automation, Provider, Track, Agent, Service, and Runtime operating within the KIDULTS Platform SHALL obey this Directive.

If any lower-level instruction conflicts with this Directive, THIS DIRECTIVE SHALL PREVAIL.
