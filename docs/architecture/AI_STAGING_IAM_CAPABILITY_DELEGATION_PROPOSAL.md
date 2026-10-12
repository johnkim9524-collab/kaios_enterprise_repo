# AI STAGING IAM Capability Delegation Proposal

**Status:** Proposal only; this document grants no cloud or repository capability.  
**Target:** AI-020 and the STAGING capability broker.  
**Base reviewed:** `176c806d905716806087d3590ca4f204aecf5d77`.

## Objective

Remove routine human involvement for narrowly bounded, reversible IAM data-plane changes in STAGING. Let an accountable AI agent propose the exact smallest grant, have the Track/KPMO machine quorum decide it, and let a separate verifier prove the change and its rollback. Keep the decision auditable and bound to one exact repository tree and one exact infrastructure resource set.

## Delegated lane

A future canonical policy may classify a permission change as `STAGING_CAPABILITY_DELTA` only when every condition below is true:

- The target is an already registered STAGING role and an already registered resource ARN. No role, identity, trust relationship, OIDC subject, workload identity, permission boundary, or policy attachment is created or changed.
- The change is limited to a registry allowlist of data-plane actions, exact resources, and mandatory conditions. Wildcard actions/resources, `iam:*`, role assumption, privilege delegation, and policy administration are rejected.
- The proposal declares exact actions, resources, conditions, purpose, maximum lifetime, positive and negative tests, and a tested rollback before any mutation.
- Separate Track and KPMO workloads bind the exact base SHA, candidate tree, scope digest, test evidence, rollback digest, attempt limit, and expiry. The distinct protected-main verifier checks the rendered policy and proves both allowed and denied cases.
- A broker applies only the validated delta to the registered STAGING role, records immutable before/after digests, and automatically removes the delta at expiry or on drift. The AI workload receives no general IAM write capability.
- A denied or ambiguous case fails closed. A request outside this lane remains a human-reserved action.

This lane is intended for routine service data access such as narrowly scoped DynamoDB operations on a pre-registered STAGING table and key prefix. Each requested action must still be justified by the caller's actual code path.

## Hard exclusions

No autonomous grant may reach Production, Public, G5, credentials or secret values, trust roots, OIDC trust, repository rulesets, permission boundaries, external communication or spend, legal or contractual commitments, destructive data operations, or protected promotion and release.

Changing this proposal into an active canonical policy requires synchronized edits to the AI-020 source, routing envelope, capability guard, executor boundaries, validators, negative tests, policy inventory, and alignment evidence. These consumers must agree before the lane can be enabled. The policy-change PR itself must not activate a grant.

## Acceptance evidence

The implementing change should demonstrate:

1. A positive STAGING data-plane grant to an exact registered resource.
2. Rejection of wildcard resources, unregistered roles, trust-policy changes, secret access, role assumption, and every hard exclusion.
3. A real expiry and rollback test, including drift and partial-failure cases.
4. Green repository checks and a regenerated policy inventory whose digests match the exact source tree.
5. No mutation or deployment while the implementation remains a Draft.

## Intended outcome

AI may autonomously request and apply the widest **pre-authorized, reversible STAGING data-plane delta**. It does not receive open-ended IAM administration. The pre-registered envelope defines its ceiling; the AI can exercise that ceiling without asking a human for each conforming permission delta.
