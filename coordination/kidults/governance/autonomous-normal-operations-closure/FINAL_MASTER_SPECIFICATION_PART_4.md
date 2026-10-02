KIDULTS / KAIOS
AUTONOMOUS NORMAL OPERATIONS CLOSURE MISSION
FINAL MASTER SPECIFICATION — PART 4 OF 4

SECTIONS §52–§68

OWNER-BOUNDARY NEGATIVE E2E / ACCEPTANCE MATRIX /
SAFETY NON-REGRESSION / TESTS / GOVERNED LANDING /
EXACT-MAIN / AUTOMATIC STAGING / COMPLETE_VERIFIED /
CONTINUE-UNTIL-CLOSURE / PERMANENT ANTI-REGRESSION /
FINAL EVIDENCE / ZERO-BASE RE-AUDIT / TERMINATION


======================================================================
GLOBAL EXECUTION CONTRACT
======================================================================

THIS IS PART 4 OF 4.

ALL FOUR PARTS HAVE NOW BEEN PROVIDED.

The complete authoritative specification is:

PART 1/4 = §0–§17
PART 2/4 = §18–§34
PART 3/4 = §35–§51
PART 4/4 = §52–§68

Sections §0–§68 constitute ONE continuous authoritative execution order.

They supersede all earlier:

partial
truncated
experimental
intermediate
superseded

versions of this closure mission.

NOW BEGIN EXECUTION.

Before ANY new mutation:

1. reread current external GitHub/AWS/STAGING state;
2. inspect all existing branches/commits/PRs/workflows/runs/artifacts/
   receipts/deployments/reservations/generations;
3. determine which stages already completed;
4. consume valid existing artifacts;
5. do not repeat completed stages;
6. do not create duplicate work;
7. resume from the LAST VERIFIED INCOMPLETE STAGE.

Historical values in the specification are discovery anchors only.

CURRENT EXTERNAL STATE ALWAYS WINS.


======================================================================
§52. OWNER-BOUNDARY NEGATIVE E2E
======================================================================

Test representative genuine Owner-boundary mutations WITHOUT actually
performing the forbidden authority expansion.

At minimum test representative cases for:

Production enablement

Public enablement

G5 enablement

OIDC trust expansion

workload-identity expansion

delegated-authority expansion

IAM privilege expansion

GitHub App installation privilege expansion

secret/credential authority expansion

ruleset weakening

branch-protection weakening

security-boundary weakening

Provider activation

new material external infrastructure/cost authority


Expected classification:

OWNER_BOUNDARY


Expected mutation result:

ZERO UNAUTHORIZED MUTATION.


These cases must NOT enter autonomous landing or bounded recovery merely
to satisfy the normal-operation Owner-interaction=0 target.

The Owner-interaction=0 requirement applies to NORMAL OPERATIONS.

It does NOT authorize bypassing genuine Owner boundaries.


======================================================================
§53. NORMAL-OPERATIONS ACCEPTANCE MATRIX
======================================================================

Prove autonomous behavior for representative NORMAL operations.

At minimum cover:

routine governance implementation hardening

routine workflow bug fix

routine STAGING deployer fix

routine retry hardening

routine bounded recovery improvement

stale-base PR convergence

generated manifest/inventory regeneration

generated-only conflict convergence

post-merge STAGING convergence

already-converged no-op

transient GitHub failure recovery

transient AWS failure recovery

duplicate Dispatcher handling

duplicate finalizer handling

single-winner/follower behavior

late stale-event handling

session/network interruption continuation


For every NORMAL operation verify:

Owner comments = 0

Owner exact-SHA approval comments = 0

Owner merge clicks = 0

Owner Ready clicks = 0

Owner Run workflow clicks = 0

Owner routine approvals = 0

Owner STAGING deploy actions = 0

Owner routine recovery actions = 0

Owner change-set inputs = 0

Owner authorization-ID inputs = 0


If any representative NORMAL operation violates this budget:

DEFECT.

Do not waive the criterion.

Root-cause and remediate it.


======================================================================
§54. SAFETY-BOUNDARY NON-REGRESSION
======================================================================

Explicitly prove after all autonomy changes:

Production = HOLD

Public = HOLD

G5 = HOLD


unless separately authorized by Owner outside this mission.


Also prove:

PAT bypass = NOT USED

ruleset bypass = NOT USED

branch-protection bypass = NOT USED

required-check bypass = NOT USED

Independent-Verifier bypass = NOT USED

quorum bypass = NOT USED

secret authority expansion = NOT PERFORMED

credential authority expansion = NOT PERFORMED

trust expansion = NOT PERFORMED

GitHub App installation authority expansion = NOT PERFORMED

Provider activation = NOT PERFORMED

unapproved cost expansion = NOT PERFORMED

unapproved external infrastructure expansion = NOT PERFORMED


Autonomy improvements must not weaken security boundaries.


======================================================================
§55. TEST REQUIREMENTS
======================================================================

Run all applicable:

focused unit tests

governance tests

semantic capability tests

independent capability-verifier tests

manual-surface inventory tests

anti-regression autonomy tests

Dispatcher tests

authorization tests

generation-binding tests

quorum tests

finalizer tests

reservation tests

recovery tests

stale-base tests

generated-artifact tests

trigger-completeness tests

GitHub API permission-contract tests

AWS boundary tests

deployment tests

read-back tests

terminal-state tests

security tests

Red-Team tests

failure-injection tests

chaos tests

full relevant CI


Do not suppress real failures.


A platform-specific cleanup error may be classified separately only if
authoritative evidence proves:

all intended assertions completed successfully,

the error occurred solely during non-authoritative cleanup,

and the cleanup failure cannot invalidate the tested safety property.


Authoritative Linux CI must still be green.


======================================================================
§56. GOVERNED LANDING
======================================================================

All protected-main changes must use the legitimate governed landing path.

STRICTLY FORBIDDEN:

ruleset bypass

branch-protection bypass

PAT bypass

fabricated required status

manually forcing required status green

deleting required checks merely to unblock merge

weakening security policy merely to make CI pass

bypassing Independent Verifier

bypassing quorum

bypassing semantic capability classification

bypassing independent capability verification

bypassing exact-head binding

rebinding approval to another head

self-approving authority expansion

force-merging a genuine OWNER_BOUNDARY mutation


Normal internal reversible operations must become mergeable by FIXING
THE GOVERNED PATH, not by bypassing it.


If Governed Landing remains PENDING, classify the cause as one of:

LEGITIMATE_INCOMPLETE_EVIDENCE

TRANSIENT_OPERATIONAL_FAILURE

STALE_GENERATION

STALE_STATUS

STALE_BASE

GENERATED_ARTIFACT_CONFLICT

SOURCE_CONFLICT

TRIGGER_OMISSION

FINALIZER_RACE

CONTROL_PLANE_FAILURE

POLICY_DENIAL

OWNER_BOUNDARY

IMPLEMENTATION_DEFECT

UNKNOWN_FAIL_CLOSED


For normal operational defects within existing authority:

repair/recover autonomously where the already-delegated authority
permits it.


For POLICY_DENIAL:

FAIL CLOSED.


For OWNER_BOUNDARY:

emit OWNER_BOUNDARY without unauthorized mutation.


For UNKNOWN:

FAIL CLOSED and investigate.

Do not convert UNKNOWN into automatic authority.


======================================================================
§57. PR / COMMIT / BRANCH DISCIPLINE
======================================================================

Prefer consuming and extending existing coherent work.

Do not create PR proliferation.

Before creating a new PR:

prove that no existing active coherent PR can safely carry the
remediation.


Every PR must have:

exact base

exact head

tree

bounded purpose

semantic authority classification

tests

no unrelated changes


Do not force-push merely for convenience.

Do not rewrite history to hide evidence.

Preserve useful failed-run evidence for root-cause analysis.

Do not create a replacement PR merely because an existing PR has stale
generated artifacts.

Converge the existing PR when safe.


======================================================================
§58. POST-MERGE EXACT-MAIN VERIFICATION
======================================================================

GitHub PR state=merged is NOT completion.

Immediately after every governed landing reread external GitHub state.

Verify:

repository

PR number

authorized exact base SHA

authorized exact head SHA

expected head tree

actual merge SHA

actual merge tree

ordered parents

merge actor where actor binding is required

merge timestamp

protected-main SHA

protected-main tree


Prove that the landed object is exactly the authorized object.

Reject:

unexpected tree

wrong parents

wrong head

wrong base

wrong repository

stale generation

superseded generation

unproven merge provenance


Persist a post-merge exact-main receipt.


If protected main advances again before downstream continuation:

preserve the causal merge receipt,

bind downstream work to the correct exact-main generation,

reread current external state,

and do not replay completed stages.


Late obsolete PR-target workflows must be classified against their
actual generation/head and must not automatically invalidate a verified
exact-main landing.


======================================================================
§59. AUTOMATIC STAGING CONVERGENCE PROOF
======================================================================

After exact-main verification, all affected eligible NORMAL-operation
STAGING changes must converge automatically.

For each affected subsystem:

1. determine exact desired state from protected main;
2. read current live state;
3. calculate bounded live↔desired delta;
4. semantically classify the delta;
5. independently verify the capability delta;
6. reject authority/resource expansion outside existing authority;
7. apply only the bounded authorized delta;
8. observe completion using bounded/event-driven logic;
9. read back live state;
10. compare actual state to exact desired state;
11. emit deployment terminal receipt.


No Owner:

Run workflow

change-set input

authorization-ID input

deployment click

routine environment approval

routine recovery action


may be required.


If live state already matches desired state:

NO_OP_ALREADY_CONVERGED.


Deployment command success without live read-back is insufficient.


======================================================================
§60. DEFINITION OF AUTONOMOUS_NORMAL_OPERATIONS_COMPLETE_VERIFIED
======================================================================

Do NOT define completion as:

code written

local tests passed

PR opened

review completed

CI green

PR merged

workflow started

deployment started

CloudFormation succeeded

one canary passed

one natural run passed


The required final state is:

AUTONOMOUS_NORMAL_OPERATIONS_COMPLETE_VERIFIED


It requires ALL applicable conditions below:

1. final implementation exists on protected main;
2. exact-main identity is verified;
3. policy and implementation agree;
4. tests agree with the constitutional contract;
5. documentation/comments do not encode obsolete manual normal paths;
6. generated manifests/inventories are correctly bound;
7. relevant CI is green;
8. Security Assurance is green;
9. Red-Team/adversarial verification is green;
10. semantic capability classification is proven;
11. independent capability verification is proven;
12. authorization generation binding is proven;
13. required-set consistency is proven;
14. three-role quorum is proven;
15. single-winner finalizer is proven;
16. follower behavior is proven;
17. reservation semantics are proven;
18. bounded recovery is proven where pre-authorized;
19. recovery cannot manufacture authority;
20. policy denial remains fail-closed;
21. bootstrap paradoxes are eliminated;
22. trigger completeness is proven;
23. stale-base convergence is proven;
24. generated-only conflict convergence is proven;
25. GitHub API permission contracts are proven;
26. no under-privilege remains that breaks normal operation;
27. no over-privilege was introduced;
28. required-check convergence is proven;
29. terminal-state completeness is proven;
30. automatic STAGING convergence is proven;
31. live deployment read-back is proven;
32. positive canary passes;
33. negative canary passes;
34. natural E2E passes;
35. repeat/idempotency proof passes;
36. interruption/resumption proof passes;
37. normal-operation Owner interaction budget = 0;
38. Production remains HOLD;
39. Public remains HOLD;
40. G5 remains HOLD;
41. no PAT/ruleset/branch-protection bypass occurred;
42. no unapproved trust expansion occurred;
43. no unapproved credential/secret authority expansion occurred;
44. no Provider activation occurred;
45. no unapproved cost/infrastructure expansion occurred;
46. old stale work no longer pollutes autonomous operation;
47. permanent anti-regression gate is active;
48. immutable final evidence package exists;
49. final terminal receipt is bound to exact protected main;
50. final zero-base audit finds no remaining known normal-operation
    manual bottleneck.


If ANY applicable item is missing:

STATUS IS NOT COMPLETE_VERIFIED.


======================================================================
§61. CONTINUE-UNTIL-CLOSURE RULE
======================================================================

When one remediation exposes another defect:

DO NOT STOP.

The newly exposed defect becomes part of THIS SAME MISSION.


Required loop:

DISCOVER
→ CLASSIFY
→ ROOT-CAUSE
→ REMEDIATE
→ TEST
→ REREAD EXTERNAL STATE
→ CONSUME EXISTING ARTIFACTS
→ GOVERNED LANDING
→ EXACT-MAIN VERIFY
→ STAGING CONVERGE
→ LIVE READ-BACK
→ E2E VERIFY
→ SEARCH FOR NEXT DEFECT


Unacceptable stopping behavior for NORMAL operations:

"Found another issue; waiting for Owner."

"PR is ready; please merge."

"Run workflow manually."

"Please enter the change-set."

"Please provide authorization ID."

"Please approve STAGING."

"CI is green, complete."

"Deployment succeeded, complete."


These are not completion states.

If the newly discovered problem is internal/reversible and within
existing authority:

solve it within this mission.


======================================================================
§62. REPORTING / NO-STOP RULE
======================================================================

Do not interrupt execution with routine progress reports that become
synchronization barriers.

Do not stop merely to report:

root cause found

code changed

PR created

CI running

CI passed

review passed

merge completed

deployment started

deployment completed


Continue automatically within existing authority.


Intermediate reporting may be emitted when useful, but execution must
continue.


Do not ask Owner how to solve implementation details.


If a TRUE OWNER_BOUNDARY is discovered:

record:

exact requested capability

why existing delegated authority is insufficient

exact base/head/tree

affected external boundary

minimum Owner decision required


Do not weaken the boundary.

Do not manufacture approval.

Continue other independent safe work where possible.


======================================================================
§63. PERMANENT ANTI-REGRESSION AUTONOMY GATE
======================================================================

The final system must contain a permanent CI/governance gate preventing
reintroduction of false manual dependencies.

Fail future CI when a change introduces, for NORMAL operations:

workflow_dispatch-only execution

routine Owner comment

routine Owner exact-SHA comment

routine Owner merge

routine Owner Ready

routine STAGING approval

manual change-set input

manual authorization-ID input

manual stale-base recovery

manual generated-artifact reconciliation

manual post-merge continuation

manual routine retry/recovery

new indefinite pending state


unless the surface is explicitly and validly classified:

MANUAL_DIAGNOSTIC_RECOVERY

or:

OWNER_BOUNDARY.


For OWNER_BOUNDARY:

the actual semantic authority expansion must be machine-identifiable or
explicitly evidenced.

Path name alone is insufficient.


Also fail future CI if a change:

silently converts AUTO_NORMAL_OPS to manual

expands Owner-boundary set without semantic evidence

removes a required natural trigger without replacement

weakens exact-head binding

weakens generation binding

weakens independent capability verification

weakens Independent Verifier

weakens quorum

weakens terminal-state guarantees

weakens security boundaries

introduces an unclassified manual surface


This gate becomes permanent KIDULTS/KAIOS governance baseline.


======================================================================
§64. FINAL EVIDENCE PACKAGE
======================================================================

Before declaring completion produce a machine-verifiable final evidence
package.


A. FINAL SOURCE STATE

repository

protected-main SHA

protected-main tree

relevant merge SHAs

ordered parents

merge actors


B. GOVERNANCE

semantic capability policy

independent capability verification policy

Owner-boundary policy

manual-surface inventory

normal-operations recovery policy

Independent Verifier policy

quorum policy

anti-regression policy


C. CI / SECURITY

final CI run IDs

Security Assurance run IDs

Red-Team/adversarial run IDs

relevant required-check conclusions


D. AUTONOMOUS CHAIN

natural trigger evidence

Dispatcher run

generation ID

Track authorization run

KPMO authorization run

Independent Verifier run

finalizer winner

follower runs

reservation evidence

merge evidence


E. STAGING

automatic deployment run IDs

deployment/change-set evidence where applicable

live read-back

desired/live comparison

NO_OP evidence where applicable


F. CANARIES

positive-canary receipt

negative-canary receipt


G. RECOVERY

bounded operational recovery evidence where applicable

proof recovery authority was pre-authorized

proof policy denial cannot enter recovery

single-winner/follower evidence


H. CHAOS / ADVERSARIAL

failure-injection matrix

result for each required scenario

terminal classification


I. OWNER INTERACTION ACCOUNTING

For the final natural NORMAL-operation E2E:

Owner comments = 0

Owner exact-SHA approval comments = 0

Owner merge clicks = 0

Owner Ready clicks = 0

Owner Run workflow clicks = 0

Owner routine approvals = 0

Owner STAGING deploy actions = 0

Owner recovery actions = 0
Owner change-set inputs = 0

Owner authorization-ID inputs = 0


J. SAFETY BOUNDARIES

Production = HOLD

Public = HOLD

G5 = HOLD

PAT bypass = NOT USED

ruleset bypass = NOT USED

branch-protection bypass = NOT USED

Provider activation = NOT PERFORMED

unapproved trust expansion = NOT PERFORMED

unapproved credential expansion = NOT PERFORMED

unapproved cost expansion = NOT PERFORMED


K. ESTATE HYGIENE

active PRs

superseded PRs

obsolete PRs

held PRs

Owner-boundary PRs

separate-program PRs


Include evidence that stale work no longer pollutes normal autonomous
candidate selection.


L. TERMINAL EVIDENCE

final exact-main receipt

final STAGING read-back receipt

natural E2E receipt

positive/negative canary receipts

idempotency evidence

zero-base audit result


======================================================================
§65. IMMUTABLE FINAL TERMINAL RECEIPT
======================================================================

Create/persist an immutable final terminal receipt representing:

AUTONOMOUS_NORMAL_OPERATIONS_COMPLETE_VERIFIED


The receipt must bind at minimum:

repository

exact protected-main SHA

exact protected-main tree

evidence-package identity/digest

final natural E2E identity

final STAGING desired-state identity

final STAGING read-back identity

positive-canary identity

negative-canary identity

Red-Team result

chaos-matrix result

Owner-interaction accounting

safety-boundary state

creation timestamp


The receipt must not be emitted before all required evidence exists.

Do not emit a success receipt merely because a PR merged.

If receipt generation itself fails:

mission remains incomplete.


======================================================================
§66. FINAL ZERO-BASE RE-AUDIT
======================================================================

After all remediation, governed landing, exact-main verification,
STAGING convergence, canaries, chaos tests and natural E2E have
completed:

PERFORM ONE FINAL ZERO-BASE AUDIT.

This is mandatory.

Do NOT limit this audit to files changed during this mission.

Do NOT ask:

"Did we fix the defects we already knew about?"

Instead ask:

"If the final protected-main system were presented today as a new
system, what remaining defect could still cause a NORMAL internal
reversible operation to require Owner/human intervention, fail to
terminate, fail to recover, or bypass a legitimate safety boundary?"

Reread the resulting protected main from scratch.

Re-audit the complete relevant estate, including:

.github/workflows/**

scripts/**

coordination/**

infrastructure/**

tests/**

governance policies

authorization policies

recovery policies

deployment policies

manual-surface inventory

GitHub Environment configuration where observable

GitHub App/API permission profiles

required contexts

generated-artifact contracts

current STAGING convergence paths

terminal-state definitions

existing OPEN/Draft PR estate

current natural trigger graph


Re-evaluate from zero:

1. every Owner gate;
2. every manual trigger;
3. every workflow_dispatch;
4. every Ready transition;
5. every merge path;
6. every approval path;
7. every STAGING deployment path;
8. every bootstrap path;
9. every recovery path;
10. every stale-base path;
11. every generated-artifact conflict path;
12. every Dispatcher candidate path;
13. every authorization path;
14. every quorum path;
15. every finalizer path;
16. every reservation path;
17. every post-merge path;
18. every natural trigger;
19. every required check;
20. every non-terminal state;
21. every retry path;
22. every API permission profile;
23. every environment approval;
24. every live read-back path;
25. every evidence/receipt path.


The final zero-base audit must establish:

NORMAL_OPERATION_MANUAL_BOTTLENECKS = 0

UNCLASSIFIED_MANUAL_SURFACES = 0

FALSE_OWNER_ESCALATION_PATHS = 0

KNOWN_NON_TERMINATING_NORMAL_STATES = 0

KNOWN_BOOTSTRAP_CIRCULAR_DEPENDENCIES = 0

KNOWN_GENERATED_ARTIFACT_MANUAL_CONFLICT_PATHS = 0

KNOWN_NORMAL_OPERATION_SINGLE_POINTS_OF_HUMAN_FAILURE = 0

KNOWN_NORMAL_OPERATION_WORKFLOW_DISPATCH_DEPENDENCIES = 0

KNOWN_NORMAL_OPERATION_MANUAL_MERGE_DEPENDENCIES = 0

KNOWN_NORMAL_OPERATION_MANUAL_READY_DEPENDENCIES = 0

KNOWN_NORMAL_OPERATION_MANUAL_STAGING_DEPLOY_DEPENDENCIES = 0

KNOWN_STALE_BASE_MANUAL_RECOVERY_PATHS = 0

KNOWN_FALSE_POLICY_DENIALS = 0

KNOWN_RECOVERY_SHADOW_BYPASSES = 0

KNOWN_TRIGGER_GAPS = 0

KNOWN_REQUIRED_CHECK_DEADLOCKS = 0

KNOWN_FINALIZER_RACES_WITHOUT_SAFE_TERMINATION = 0

KNOWN_ORPHAN_GENERATIONS = 0

KNOWN_ORPHAN_RESERVATIONS = 0

KNOWN_ORPHAN_REQUIRED_STATUSES = 0

KNOWN_UNVERIFIED_STAGING_DRIFT = 0

KNOWN_OVER_PRIVILEGED_NORMAL_OPERATION_PROFILES = 0

KNOWN_UNDER_PRIVILEGED_NORMAL_OPERATION_PROFILES = 0


Do NOT satisfy these assertions by hiding or excluding known defects.

If the zero-base audit discovers ANY additional defect:

THE MISSION AUTOMATICALLY REOPENS.

That defect becomes part of this SAME mission.

Required response:

ROOT-CAUSE
→ REMEDIATE
→ REGRESSION TEST
→ GOVERNED LANDING
→ EXACT-MAIN VERIFY
→ STAGING CONVERGE IF APPLICABLE
→ LIVE READ-BACK
→ RERUN AFFECTED ADVERSARIAL TESTS
→ RERUN AFFECTED NATURAL E2E
→ REPEAT ZERO-BASE AUDIT

Continue until the zero-base audit is clean.


======================================================================
§67. FINAL ACCEPTANCE GATE
======================================================================

Before termination evaluate every item below against LIVE EXTERNAL
EVIDENCE.

Do not mark an item complete from intention, source code alone, local
state alone, or historical evidence that no longer binds to the final
protected main.


ARCHITECTURE

[ ] Full repository-wide manual-bottleneck audit completed

[ ] Every relevant manual surface classified

[ ] Unclassified manual surfaces = 0

[ ] Semantic capability classification replaces false path-based
    Owner gating

[ ] Independent capability verification is active

[ ] Genuine Owner boundaries remain fail-closed

[ ] Self-approval of authority expansion remains prohibited


NORMAL-OPERATIONS AUTONOMY

[ ] Owner comments required = 0

[ ] Owner exact-SHA approval comments required = 0

[ ] Owner merge clicks required = 0

[ ] Owner Ready clicks required = 0

[ ] Owner Run workflow clicks required = 0

[ ] Owner routine approvals required = 0

[ ] Owner STAGING deployment actions required = 0

[ ] Owner routine recovery actions required = 0

[ ] Owner change-set inputs required = 0

[ ] Owner authorization-ID inputs required = 0


PR / GOVERNANCE

[ ] Normal PR lifecycle is autonomous

[ ] Stale-base convergence is autonomous

[ ] Generated-only conflict convergence is autonomous

[ ] Generated artifacts are deterministic

[ ] Required-set consistency is proven

[ ] Required checks converge terminally

[ ] Late stale workflows cannot poison verified generations


AUTHORIZATION / FINALIZATION

[ ] Exact repository/PR/head binding is proven

[ ] Exact base/head/tree provenance is proven

[ ] Generation/nonce binding is proven

[ ] Track authorization is proven

[ ] KPMO authorization is proven

[ ] Independent Verifier is proven

[ ] Three-role quorum is proven

[ ] Single-winner finalizer is proven

[ ] Followers terminate successfully

[ ] Duplicate merge is impossible under tested conditions

[ ] Reservation semantics are proven

[ ] Reservation conflicts distinguish legitimate follower from invalid
    conflict


RECOVERY

[ ] Operational failure is distinguished from policy denial

[ ] Bounded recovery works where pre-authorized

[ ] Recovery cannot manufacture authority

[ ] Recovery cannot bypass policy denial

[ ] Recovery cannot bypass Independent Verifier

[ ] Recovery cannot bypass quorum

[ ] Recovery cannot bypass exact-head binding

[ ] Recovery cannot weaken security boundaries

[ ] Retry exhaustion terminates deterministically


BOOTSTRAP / TRIGGERS

[ ] Bootstrap paradoxes are eliminated

[ ] Bootstrap converges into steady state

[ ] Natural trigger completeness is proven

[ ] Workflow changes trigger required convergence where necessary

[ ] Normal operation does not depend on workflow_dispatch

[ ] No normal operation waits on a human merge window


PERMISSIONS / SECURITY

[ ] GitHub App endpoint permission contracts are proven

[ ] No under-privilege remains that breaks normal operation

[ ] No over-privilege was introduced

[ ] Security scanners remain strict

[ ] Test fixtures do not require scanner weakening

[ ] Unknown/ambiguous authority remains fail-closed


STAGING

[ ] Automatic STAGING convergence is proven

[ ] Desired-state calculation is exact-main bound

[ ] Live read-back is proven

[ ] Already-converged state terminates safely

[ ] Partial deployment failure has deterministic recovery/rollback

[ ] Environment approvals do not create false normal-operation human
    dependencies


ADVERSARIAL PROOF

[ ] Full Red-Team review passes

[ ] Failure-injection/chaos matrix passes

[ ] Positive canary passes

[ ] Negative canary passes

[ ] Genuine Owner-boundary negative E2E passes

[ ] Natural normal-operation E2E passes

[ ] Natural E2E Owner interaction count = 0

[ ] Repeat/idempotency proof passes

[ ] Network/session interruption recovery proof passes


ESTATE HYGIENE

[ ] Obsolete/superseded PRs do not pollute Dispatcher candidates

[ ] Old work does not corrupt canonical truth

[ ] Old work does not create duplicate generations

[ ] Old work does not create required-set ambiguity

[ ] Separate-program/HOLD/Owner-boundary work remains appropriately
    isolated


SAFETY BOUNDARIES

[ ] Production = HOLD

[ ] Public = HOLD

[ ] G5 = HOLD

[ ] PAT bypass = NOT USED

[ ] ruleset bypass = NOT USED

[ ] branch-protection bypass = NOT USED

[ ] required-check bypass = NOT USED

[ ] Provider activation = NOT PERFORMED

[ ] unapproved trust expansion = NOT PERFORMED

[ ] unapproved credential/secret expansion = NOT PERFORMED

[ ] unapproved GitHub App installation authority expansion =
    NOT PERFORMED

[ ] unapproved cost/infrastructure expansion = NOT PERFORMED


LONG-TERM REGRESSION PREVENTION

[ ] Permanent manual-surface inventory is active

[ ] Permanent autonomy anti-regression gate is active

[ ] Future unclassified manual normal-operation path fails CI

[ ] Future false Owner escalation fails CI

[ ] Future natural-trigger removal fails CI

[ ] Future indefinite normal-operation pending state fails CI


FINAL EVIDENCE

[ ] Final evidence package exists

[ ] Final exact-main receipt exists

[ ] Final STAGING read-back receipt exists

[ ] Positive/negative canary receipts exist

[ ] Natural E2E receipt exists

[ ] Idempotency evidence exists

[ ] Zero-base audit result exists

[ ] Immutable final terminal receipt exists

[ ] Final terminal receipt binds to current exact protected main


If ANY applicable checkbox cannot be proven from live evidence:

DO NOT TERMINATE.

The mission remains open.


======================================================================
§68. FINAL TERMINATION CONTRACT
======================================================================

This section is the ONLY mission exit.

Before termination:

1. reread protected main one final time;
2. verify final protected-main SHA/tree;
3. verify no newer relevant commit invalidated the evidence package;
4. verify all final required checks are terminal and green where success
   is required;
5. verify STAGING still matches the desired exact-main state;
6. verify final evidence-package identity/digest;
7. verify immutable terminal receipt;
8. verify the final zero-base audit is clean;
9. verify the §67 acceptance gate;
10. verify the normal-operation Owner interaction budget is zero.


DO NOT REPORT COMPLETE merely because:

a PR merged,

CI is green,

STAGING deployed,

a canary passed,

or the currently known defect was fixed.


If ANY acceptance criterion fails:

DO NOT STOP.

DO NOT ASK OWNER TO FIX AN INTERNAL IMPLEMENTATION PROBLEM.

DO NOT CREATE A MANUAL NORMAL-OPERATIONS WORKAROUND.

DO NOT WEAKEN A SECURITY BOUNDARY.

DO NOT BYPASS PROTECTED MAIN.

DO NOT FABRICATE OR FORCE A REQUIRED STATUS.

DO NOT MANUFACTURE MISSING AUTHORITY.

DO NOT REPEAT ALREADY COMPLETED STAGES.


Instead:

1. classify the newly discovered failure;
2. determine root cause;
3. determine whether it is:
   - NORMAL_OPERATION_DEFECT,
   - POLICY_DENIAL,
   - or OWNER_BOUNDARY;
4. for NORMAL_OPERATION_DEFECT:
   remediate it within existing authority;
5. add or strengthen regression coverage;
6. reread external state;
7. consume existing valid artifacts;
8. rerun only the affected incomplete chain;
9. governed-land the correction;
10. verify exact main;
11. converge STAGING if applicable;
12. read back live state;
13. rerun affected adversarial/canary/E2E proof;
14. repeat the zero-base audit;
15. reevaluate §67.


If a TRUE OWNER_BOUNDARY is discovered:

do not bypass it.

Record the minimum exact Owner decision required.

Continue all other independent safe work where possible.

A genuine Owner boundary does not justify weakening the autonomous
normal-operations architecture.


FINAL SUCCESS CONDITIONS:

NORMAL INTERNAL REVERSIBLE OPERATIONS ARE STRUCTURALLY AUTONOMOUS.

NORMAL INTERNAL REVERSIBLE OPERATIONS REQUIRE ZERO ROUTINE OWNER
INTERACTION.

NORMAL OPERATIONS ARE RECOVERABLE WITHIN PRE-AUTHORIZED BOUNDS.

RECOVERY CANNOT CREATE OR EXPAND AUTHORITY.

THE SYSTEM IS IDEMPOTENT.

THE SYSTEM IS RESUMABLE AFTER SESSION/NETWORK INTERRUPTION.

THE SYSTEM FAILS CLOSED ON UNKNOWN OR UNAUTHORIZED STATE.

GENUINE OWNER BOUNDARIES REMAIN PROTECTED.

PRODUCTION / PUBLIC / G5 REMAIN HOLD.

LIVE STAGING STATE MATCHES FINAL EXACT-MAIN DESIRED STATE.

POSITIVE AND NEGATIVE CANARIES PASS.

NATURAL E2E PASSES WITHOUT MANUAL SHORTCUT.

FINAL ZERO-BASE RE-AUDIT IS CLEAN.

PERMANENT ANTI-REGRESSION CONTROLS ARE ACTIVE.

IMMUTABLE TERMINAL EVIDENCE EXISTS.


ONLY THEN emit the exact final success token:

AUTONOMOUS_NORMAL_OPERATIONS_COMPLETE_VERIFIED


After emitting that token, provide the final evidence summary.

Do not claim success before that point.


======================================================================
END OF FINAL MASTER SPECIFICATION — PART 4 OF 4
======================================================================

PART 4 ENDS HERE.

LAST SECTION:

§68. FINAL TERMINATION CONTRACT

THE COMPLETE SPECIFICATION IS NOW:

§0–§68

PART 1/4 = §0–§17
PART 2/4 = §18–§34
PART 3/4 = §35–§51
PART 4/4 = §52–§68

ALL FOUR PARTS HAVE BEEN RECEIVED.

BEGIN BY REREADING CURRENT EXTERNAL STATE.

RESUME FROM THE LAST VERIFIED INCOMPLETE STAGE.

DO NOT DUPLICATE EXISTING WORK.

CONTINUE UNTIL THE §68 TERMINATION CONTRACT IS SATISFIED.