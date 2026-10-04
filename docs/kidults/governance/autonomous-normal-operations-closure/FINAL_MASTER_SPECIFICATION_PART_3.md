KIDULTS / KAIOS
AUTONOMOUS NORMAL OPERATIONS CLOSURE MISSION
FINAL MASTER SPECIFICATION — PART 3 OF 4

SECTIONS §35–§51

FAILURE CODES / SECURITY HYGIENE / DESIRED-STATE DEPLOYMENT /
STAGING AUTHORITY / READ-BACK / ENVIRONMENTS / CANONICAL TRUTH /
EVENT PROVENANCE / ESTATE HYGIENE / POLICY ALIGNMENT /
RED-TEAM / CHAOS / CANARIES / NATURAL E2E


======================================================================
GLOBAL EXECUTION CONTRACT
======================================================================

THIS IS PART 3 OF 4 OF ONE SINGLE AUTHORITATIVE MISSION.

DO NOT EXECUTE THE MISSION UNTIL PART 4 HAS ALSO BEEN RECEIVED.

The complete specification is fixed as:

PART 1/4 = §0–§17
PART 2/4 = §18–§34
PART 3/4 = §35–§51
PART 4/4 = §52–§68

After all four parts are received:

1. treat §0–§68 as ONE continuous execution order;
2. supersede all earlier partial/truncated/intermediate versions;
3. reread actual external state before mutation;
4. consume existing valid artifacts;
5. do not repeat completed stages;
6. do not create duplicate branches/PRs/pushes/approvals/runs;
7. resume from the last verified incomplete stage;
8. terminate only when §68 permits termination.

Nothing in PART 3 weakens the Owner/security boundaries established in
PART 1.


======================================================================
§35. FAILURE-CODE QUALITY AND OBSERVABILITY
======================================================================

Every fail-closed path should return a bounded machine-readable failure
classification where safely possible.

Avoid generic errors when actionable classification is available.

Failure codes must:

- not leak secrets;
- not expose credentials;
- not accept arbitrary attacker-controlled diagnostic strings;
- use bounded allowlists where appropriate;
- distinguish operational failure from policy denial;
- distinguish Owner boundary from implementation defect;
- support deterministic retry/recovery decisions;
- support durable terminal accounting.

Representative classes may include:

POLICY_DENIED

OWNER_BOUNDARY

EXACT_HEAD_MISMATCH

EXACT_BASE_MISMATCH

TREE_MISMATCH

QUORUM_INCOMPLETE

GENERATION_MISMATCH

STALE_GENERATION

INVALID_NONCE

INVALID_SIGNATURE

TRANSIENT_GITHUB_FAILURE

TRANSIENT_AWS_FAILURE

ALREADY_RESERVED

FOLLOWER_SUCCESS

GENERATED_CONFLICT

SOURCE_CONFLICT

TRIGGER_MISSING

DEPLOYMENT_READBACK_MISMATCH

RECOVERY_EXHAUSTED

NO_OP_ALREADY_CONVERGED


Do not expose raw exception text as trusted policy input.

Diagnostic detail may be preserved separately from bounded policy
classification.


======================================================================
§36. SECURITY-SCANNER / TEST-FIXTURE HYGIENE
======================================================================

Audit test fixtures for strings resembling:

AWS access keys

private keys

GitHub tokens

API tokens

credentials

secrets

session tokens

authorization headers


Security scanners must remain strict.

If a synthetic fixture accidentally matches a real credential pattern:

FIX THE FIXTURE.

Do NOT weaken the scanner merely to make CI pass.

Do NOT introduce broad scanner exclusions for governance/workflow tests.

Do NOT permit arbitrary external reason strings through a security
allowlist.

Negative fixtures must preserve the intended attack/failure semantics
without looking like usable credentials.


======================================================================
§37. DEPLOYMENT DESIRED-STATE MODEL
======================================================================

Normal STAGING deployment must be desired-state based.

For each deployer:

1. calculate expected desired state from exact protected main;
2. identify the exact source/template/code digest;
3. read current live state;
4. calculate bounded live↔desired delta;
5. semantically classify that delta;
6. reject authority/resource expansion outside existing authority;
7. apply only the authorized bounded delta;
8. observe completion using bounded/event-driven logic;
9. read back live state;
10. compare actual state with exact desired state;
11. emit a terminal deployment receipt.

If live state already matches desired state:

NO_OP_ALREADY_CONVERGED

is a successful terminal result.

Repeated execution must be idempotent.

Deployment success must not be inferred merely because the deployment
command returned exit code 0.


======================================================================
§38. AUTOMATIC STAGING CONVERGENCE
======================================================================

Audit normal-operation STAGING convergence for all relevant systems.

At minimum inspect where applicable:

Autonomous Event Broker

Autonomous Landing

ledger writer

finalizer

Natural Clock

DigitalOcean STAGING

Portal STAGING

PostgreSQL normal STAGING operations

Cloudflare STAGING where already authorized

other STAGING components discovered by the full-estate audit


Do not deploy unrelated systems merely because they exist.

Deployment must be change-scoped.

Normal internal reversible STAGING convergence must not require:

Owner Run workflow

Owner change-set name

Owner authorization ID

Owner deployment click

Owner routine environment approval

Owner recovery action


A missing natural STAGING convergence path is a defect.


======================================================================
§39. AWS / STAGING AUTHORITY AUDIT
======================================================================

Audit existing authorized AWS/STAGING resources involved in autonomous
normal operations.

Where applicable inspect:

CloudFormation

Lambda

DynamoDB

KMS

IAM

OIDC

EventBridge

CloudTrail

artifact/evidence persistence

deployment roles

read-back roles


Verify:

exact resource binding

least sufficient permissions

no wildcard authority expansion

no unintended trust expansion

read/write separation where appropriate

conditional writes

idempotency

durable receipts

live read-back

rollback behavior

bounded deployment scope


Do not create new cost-bearing infrastructure outside existing delegated
authority.

If new resource/cost authority is genuinely required:

OWNER_BOUNDARY.


======================================================================
§40. DEPLOYMENT READ-BACK AND ROLLBACK
======================================================================

Deployment command success is NOT authoritative proof.

After every relevant normal-operation deployment:

read back the live deployed state.

Verify, as applicable:

code digest

template digest

configuration

resource identity

environment

version

trigger state

schedule state

permission boundary

expected endpoint/resource binding


If read-back does not match desired exact-main state:

do NOT report deployment success.

Classify the mismatch.

If safely recoverable within existing authority:

recover automatically.

If deployment partially mutated live state and then failed:

use the defined bounded rollback/convergence mechanism.

Persist both failure and recovery evidence.

No silent partial-success state.


======================================================================
§41. ENVIRONMENT APPROVAL AUDIT
======================================================================

Audit GitHub Environments and equivalent deployment gates.

Determine whether any environment creates a hidden routine human
approval dependency.

Normal STAGING must not require manual approval unless the operation
crosses a genuine Owner boundary.

Do NOT weaken protections for:

Production

Public

G5

or another genuine high-authority environment.


Document each relevant environment as:

AUTO_NORMAL_OPS

MANUAL_DIAGNOSTIC_RECOVERY

OWNER_BOUNDARY


An unclassified environment approval requirement is a defect.


======================================================================
§42. CANONICAL TRUTH / REPOSITORY-SCOPED READS
======================================================================

Audit canonical governance-state generation and reading.

Prefer repository-scoped APIs where they satisfy the contract.

Avoid unnecessary global APIs requiring broader permission.

Prove:

pagination completeness

deterministic ordering

cardinality checks

no silent truncation

no cross-repository contamination

minimal sufficient read authority

stable canonical selection

exact repository binding


Canonical write authority remains appropriately protected.

Canonical read failure must not become routine Owner escalation.

If canonical read scope is too broad:

reduce it safely.

If canonical read scope is too narrow for the required contract:

correct the bounded read contract without expanding unrelated authority.


======================================================================
§43. EVENT PROVENANCE / CAUSALITY
======================================================================

Every downstream event must prove its authoritative upstream cause.

Audit event chains such as:

Coverage
→ KIR
→ Pooling
→ Reserve
→ Sentinel
→ Assurance
→ terminal


and:

PR
→ Dispatcher
→ authorization generation
→ finalizer
→ merge
→ push
→ STAGING convergence
→ terminal receipt


Reject:

duplicate causal roots

cross-generation consumption

late stale event resurrection

wrong-repository workflow_run

wrong-head workflow_run

unbound downstream event

event whose causal parent cannot be proven


Every terminal receipt must be traceable back to its authoritative
causal root.


======================================================================
§44. OPEN PR / BRANCH / ISSUE ESTATE HYGIENE
======================================================================

Reread the actual repository state.

The repository historically contained many old OPEN/Draft PRs.

Do not assume historical PRs remain open.

Classify relevant old work as:

ACTIVE

SUPERSEDED

OBSOLETE

HOLD

OWNER_BOUNDARY

SEPARATE_PROGRAM


Do NOT blindly close:

Provider work

security work

governance work

separate-program work

evidence-bearing historical work


But obsolete/superseded work must not pollute:

Dispatcher candidates

canonical truth

stale-base scanning

required-set calculation

recovery generations

duplicate dispatch

terminal accounting

natural E2E candidate selection


Document disposition evidence.

Preserve useful historical evidence.


======================================================================
§45. POLICY / IMPLEMENTATION / TEST / DOCUMENTATION ALIGNMENT
======================================================================

Perform a consistency audit across:

policy

implementation

tests

workflow behavior

documentation/comments

live operational evidence


Find and fix cases where:

policy says autonomous but implementation asks Owner

implementation is autonomous but policy says Owner

tests encode obsolete manual behavior

documentation encodes obsolete Owner steps

comments encode obsolete manual procedures

manifest binds obsolete semantics

workflow name says autonomous but execution is manual-only

recovery policy claims capability not actually implemented

implementation has authority not authorized by policy

Owner-boundary documentation disagrees with semantic classifier


Do not modify policy merely to rationalize broken implementation.

Do not modify tests merely to accept broken implementation.

Establish one coherent constitutional and operational contract.


======================================================================
§46. FULL RED-TEAM ZERO-TRUST REVIEW
======================================================================

After remediation, perform an adversarial review independent from the
implementation reasoning.

Assume the implementation may be wrong.

Attempt to break:

semantic capability classification

independent capability verification

Owner-boundary detection

normal-operations classification

Dispatcher eligibility

generation binding

authorization quorum

single-winner election

reservation semantics

recovery eligibility

stale-base convergence

generated-artifact handling

trigger completeness

GitHub App permission profiles

deployment authority

terminal-state logic


Specifically attempt to construct changes that appear harmless but
actually:

expand IAM

expand OIDC trust

expand workload identity

expand GitHub App authority

expand credential authority

expand write authority

expand deployment authority

weaken rulesets

weaken branch protection

enable Production

enable Public

enable G5

activate Provider

bypass quorum

bypass Independent Verifier

bypass exact-head binding

abuse recovery as a shadow bypass


All such attempts must be rejected.

Implementation authorship is not independent evidence.


======================================================================
§47. FAILURE-INJECTION / CHAOS MATRIX
======================================================================

Execute automated adversarial tests for at least:

broker 5xx

broker explicit denial

Lambda Unhandled

Lambda timeout

Dynamo ConditionalCheckFailed

duplicate finalizer

duplicate Dispatcher

duplicate repository_dispatch

duplicate workflow_run

stale SHA

stale base

stale generation

replayed generation

delayed workflow_run

out-of-order workflow_run

GitHub 403

GitHub 409

GitHub 422

GitHub 429

GitHub 5xx

GitHub secondary rate limit

missing artifact

invalid artifact

invalid receipt

expired nonce

invalid signature

manifest mismatch

required-set mismatch

generated-file conflict

real source conflict

AWS throttling

AWS deployment rollback

STAGING drift

read-back mismatch

positive-canary failure

negative-canary failure

primary finalizer unavailable

reservation already owned

review service delayed

review result bound to stale head

network/session interruption

post-merge late stale workflow


For every scenario prove one of:

AUTONOMOUS_RECOVERY

VERIFIED_FAIL_WITHOUT_UNAUTHORIZED_MUTATION

OWNER_BOUNDARY


No ambiguous hanging state is acceptable.


======================================================================
§48. NO TEST / EVIDENCE WEAKENING
======================================================================

Never obtain COMPLETE_VERIFIED by weakening proof.

FORBIDDEN:

deleting a valid failing regression test merely because it fails

skipping/xfailing a valid safety test

removing required checks merely to unblock landing

weakening assertions to accept incorrect behavior

changing expected output to match a defect

suppressing Security Assurance failures

suppressing Red-Team failures

calling a real failure flaky without evidence

discarding inconvenient terminal receipts

hiding failed workflow runs

reducing chaos coverage because remediation is difficult

changing COMPLETE_VERIFIED criteria merely to declare success


When a valid test exposes a defect:

FIX THE IMPLEMENTATION.


A test may be changed only when evidence proves the test itself is:

obsolete

incorrect

over-broad

or inconsistent with the final constitutional contract.


Such a change must preserve or strengthen the intended safety property.


======================================================================
§49. POSITIVE AND NEGATIVE CANARIES
======================================================================

Do not prove only successful behavior.

Run:

POSITIVE_CANARY

and:

NEGATIVE_CANARY.


Positive canary must prove:

a valid internal reversible operation naturally completes.


Negative canary must prove:

an invalid, unauthorized or out-of-bound operation is rejected without
unauthorized mutation.


Preserve authoritative receipts for both.

Negative-canary rejection must not require Owner intervention merely to
restore normal state.


======================================================================
§50. REAL NATURAL E2E — NO MANUAL SHORTCUT
======================================================================

Synthetic/unit/CI evidence is insufficient.

After required fixes are governed-landed and STAGING is converged,
perform at least one REAL NATURAL end-to-end proof.

Prefer an existing safe internal reversible canary if still valid.

Historically PR #2462 existed as:

[CANARY FINAL] Autonomous natural landing

but reread current external state before using it.

Do not recreate an equivalent canary if a valid existing artifact can
be consumed.


The proof must NOT rely on:

workflow_dispatch

manual Owner comment

manual exact-SHA approval tuple

manual Owner approval

manual Ready click

manual Merge click

manual STAGING deploy

manual finalizer trigger

manual change-set input

manual authorization-id input


The natural chain must prove, as applicable:

safe internal reversible candidate
→ natural trigger
→ candidate discovery
→ semantic capability classification
→ independent capability verification
→ Dispatcher
→ exact generation
→ Track authorization
→ KPMO authorization
→ Independent Verifier
→ three-role quorum
→ single-winner finalizer
→ follower success
→ governed protected-main landing
→ exact-main verification
→ natural post-merge trigger
→ automatic STAGING convergence
→ live read-back
→ positive canary
→ negative canary
→ immutable terminal receipt


Owner interaction count for this proof:

ZERO.


If Owner action is required:

THE MISSION IS NOT COMPLETE.

Treat the requirement as another structural defect unless it represents
a genuine Owner boundary.


======================================================================
§51. REPEATABILITY / IDEMPOTENCY PROOF
======================================================================

One successful natural E2E is insufficient.

Repeat or safely replay the normal-operation path.

Prove the second execution produces a safe terminal result such as:

NO_OP_ALREADY_CONVERGED

FOLLOWER_SUCCESS

SUPERSEDED

or another explicitly valid idempotent state.


Prove there is no duplicate:

merge

deployment

reservation

generation consumption

authority consumption

external side effect


Also test interruption/resumption:

1. allow an operation to reach an intermediate durable state;
2. simulate loss of client/session continuity;
3. reread external state;
4. consume the existing durable artifact;
5. resume from the first incomplete stage;
6. prove completed stages are not repeated.


Idempotency and resumability must be demonstrated from durable evidence,
not assumed.


======================================================================
END OF FINAL MASTER SPECIFICATION — PART 3 OF 4
======================================================================

PART 3 ENDS HERE.

LAST SECTION IN THIS PART: