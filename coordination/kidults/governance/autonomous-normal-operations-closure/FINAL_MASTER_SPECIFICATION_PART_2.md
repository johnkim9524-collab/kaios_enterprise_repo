KIDULTS / KAIOS
AUTONOMOUS NORMAL OPERATIONS CLOSURE MISSION
FINAL MASTER SPECIFICATION — PART 2 OF 4

SECTIONS §18–§34

RECOVERY AUTHORITY / POLICY DENIAL / BOOTSTRAP PARADOX /
TRIGGER COMPLETENESS / STALE-BASE CONVERGENCE /
GENERATED ARTIFACTS / GITHUB API PERMISSIONS /
REQUIRED CHECKS / TERMINAL STATES / RETRY


======================================================================
GLOBAL EXECUTION CONTRACT
======================================================================

THIS IS PART 2 OF 4 OF ONE SINGLE AUTHORITATIVE MISSION.

DO NOT EXECUTE THE MISSION UNTIL PARTS 3 AND 4 HAVE ALSO BEEN RECEIVED.

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

Nothing in PART 2 weakens the Owner/security boundaries defined in
PART 1.


======================================================================
§18. RECOVERY AUTHORITY PRINCIPLE
======================================================================

A routine operational failure must NOT automatically escalate to Owner.

However:

RECOVERY MUST NEVER CREATE AUTHORITY THAT DID NOT ALREADY EXIST.

Recovery may restore or continue an already-authorized bounded normal
operation.

Recovery must NOT:

- invent approval;
- invent quorum;
- invent reservation authority;
- manufacture missing durable authority;
- bypass a required durable authority primitive;
- bypass semantic capability classification;
- bypass Independent Verifier;
- bypass exact-head validation;
- bypass required checks;
- bypass security policy;
- expand trust;
- expand credentials;
- expand permissions;
- enable Production/Public/G5;
- activate Provider.

If a required authority component is unavailable and there is no
pre-authorized equivalent recovery authority:

TERMINAL FAIL-CLOSED.

Do NOT silently substitute a weaker authority model.

Do NOT use Owner as a fallback merely because implementation is broken.


======================================================================
§19. OPERATIONAL FAILURE vs POLICY DENIAL
======================================================================

Explicitly distinguish:

OPERATIONAL_FAILURE

from:

POLICY_DENIAL


Potentially recoverable OPERATIONAL_FAILURE examples:

- transient GitHub API failure;
- transient AWS failure;
- temporary deployment failure;
- bounded infrastructure race;
- stale operational state;
- delayed event;
- duplicate event;
- already-converged state;
- temporary service unavailability.

Examples that are NOT autonomously recoverable:

- invalid authority;
- invalid exact head;
- invalid repository;
- invalid quorum;
- invalid signature;
- invalid nonce;
- invalid generation;
- semantic authority expansion;
- security policy denial;
- Production request;
- Public request;
- G5 request;
- Provider activation request;
- ruleset/security-boundary weakening.

Never turn POLICY_DENIAL into operational recovery.

Machine-readable failure classification must distinguish these cases.


======================================================================
§20. BOUNDED AUTONOMOUS RECOVERY
======================================================================

Implement bounded autonomous recovery only where equivalent recovery
authority is already explicitly delegated.

Recovery must require, as applicable:

- exact-head evidence;
- valid repository/PR identity;
- valid generation;
- valid nonce;
- valid three-role quorum;
- Independent Verifier;
- semantic capability PASS;
- existing delegated recovery authority;
- bounded retry count;
- bounded timeout;
- deterministic terminal state;
- durable recovery receipt.

If recovery itself requires authority expansion:

OWNER_BOUNDARY.


Recovery may repair normal operational continuity.

Recovery may NOT authorize a capability that the primary path was not
already authorized to perform.


======================================================================
§21. RECOVERY MUST NOT BECOME A SHADOW BYPASS
======================================================================

Red-team every recovery path.

Prove recovery cannot:

- skip semantic classification;
- skip independent capability verification;
- skip Track authorization;
- skip KPMO authorization;
- skip Independent Verifier;
- skip required quorum;
- skip exact-head validation;
- skip required checks;
- weaken rulesets;
- weaken branch protection;
- use PAT bypass;
- change trust;
- change credentials;
- expand GitHub App authority;
- change Production/Public/G5 state;
- activate Providers;
- manufacture missing durable authority.

Recovery eligibility itself must be machine-verifiable.

Add negative regression tests.

A recovery implementation that can be abused to bypass policy is a
security defect.


======================================================================
§22. BOOTSTRAP PARADOX ELIMINATION
======================================================================

Audit every autonomous subsystem for circular dependency:

"The automation required to deploy or repair the automation must already
be deployed before it can deploy or repair itself."

Explicitly inspect:

- Autonomous Landing STAGING deploy;
- Autonomous Event Broker deploy;
- Natural Clock deploy;
- ledger writer;
- finalizer;
- Dispatcher recovery;
- STAGING infrastructure convergence;
- policy/classifier rollout;
- anti-regression gate rollout.

Separate:

BOOTSTRAP_PATH

from:

STEADY_STATE_PATH.


Bootstrap must:

- remain protected-main governed;
- preserve required checks;
- preserve exact-head binding;
- preserve semantic capability verification;
- preserve security boundaries;
- not use PAT bypass;
- not use ruleset bypass;
- not require recurring Owner intervention;
- be bounded;
- be auditable;
- emit terminal evidence.

Bootstrap must converge into the same steady-state architecture.

It must NOT remain as a permanent privileged backdoor.

After bootstrap:

normal operation must no longer depend on the bootstrap mechanism.


======================================================================
§23. TRIGGER COMPLETENESS
======================================================================

Audit every relevant trigger:

push

pull_request

pull_request_target

workflow_run

repository_dispatch

schedule

issue_comment

workflow_dispatch

workflow_call

environment triggers

paths

paths-ignore


Detect at minimum:

- implementation changed but required workflow did not fire;
- workflow changed but deploy did not fire;
- deployer changed but self-convergence did not fire;
- post-merge continuation missing;
- wrong repository binding;
- wrong head binding;
- wrong base binding;
- stale event binding;
- workflow_run chain gap;
- repository_dispatch emitted but not consumed;
- expected repository_dispatch never emitted;
- schedule configured but disabled;
- path filter excluding a workflow/template required for its own
  convergence.

Every required NORMAL-OPERATIONS transition must have a NATURAL trigger.

workflow_dispatch may remain for:

- diagnostics;
- forensics;
- explicit emergency tooling;
- Owner-boundary actions;
- optional manual testing.

workflow_dispatch MUST NOT be required for normal-operation correctness.

For every workflow_dispatch surface answer:

"What natural event performs the same required normal-operation
transition?"

If no natural event exists and the operation is normal:

DEFECT.

Fix it.


======================================================================
§24. SELF-BOOTSTRAP TRIGGER COMPLETENESS
======================================================================

Changing an autonomous workflow may itself require live convergence.

Audit whether changes to:

- deployment workflow;
- deployment template;
- bounded validator;
- recovery implementation;
- broker implementation;
- ledger writer implementation;
- finalizer implementation;
- Natural Clock implementation;
- normal-operations governance implementation

naturally trigger the required convergence.

Prevent this state:

"The new autonomous implementation exists on protected main but live
STAGING continues running the old implementation because only the old
deployer could deploy the new deployer."

The bootstrap trigger must:

- be naturally reachable;
- remain bounded;
- preserve security;
- preserve protected-main governance;
- converge to steady state;
- be idempotent.

Changing the deployment workflow itself must be included in trigger
coverage when necessary for desired-state convergence.


======================================================================
§25. STALE-BASE CONVERGENCE
======================================================================

Normal internal reversible PRs must autonomously converge when protected
main advances.

Audit:

- GitHub update-branch API;
- merge-update path;
- GitHub App endpoint permission requirements;
- head repository binding;
- base repository binding;
- expected head SHA;
- expected base SHA;
- stale generation;
- conflict classification;
- branch-update races;
- new-main-arrived-during-convergence races.

Do not require Owner intervention merely because main advanced.

Convergence must preserve:

the PR's intended source delta

while adopting:

current protected main.


Every convergence creates a new exact head.

Old exact-head authority must NOT automatically bind to the new head.

Regenerate/revalidate all head-bound evidence required by policy.


======================================================================
§26. REAL SOURCE CONFLICT vs GENERATED CONFLICT
======================================================================

Do NOT classify all merge conflicts identically.

Distinguish:

REAL_SEMANTIC_SOURCE_CONFLICT

from:

DERIVED_GENERATED_ARTIFACT_CONFLICT.


Generated governance artifacts may include, among others:

approval-policy-file-manifest-v1.json

approval-policy-inventory-v1.json

and any deterministic derived artifacts discovered during audit.


For generated-only conflicts:

1. adopt current protected-main source state;
2. preserve the PR's real source changes;
3. form the converged source tree;
4. rerun the authoritative generator;
5. regenerate derived artifacts;
6. validate hashes/blob bindings;
7. commit/rebind deterministically;
8. run fresh exact-head validation;
9. continue the governed chain.

Do NOT ask Owner to resolve deterministic generated conflicts.

REAL_SEMANTIC_SOURCE_CONFLICT:

FAIL CLOSED

with explicit evidence.


======================================================================
§27. GENERATED ARTIFACT MANAGEMENT
======================================================================

Inventory every generated governance/operations artifact.

For each artifact identify:

- source-of-truth inputs;
- authoritative generator;
- deterministic output contract;
- hash/blob binding;
- regeneration trigger;
- stale-base behavior;
- merge-conflict behavior;
- post-merge behavior;
- validation tests.

Generated metadata must never become a recurring human bottleneck.

Never manually edit generated hashes when an authoritative generator
exists.

Generator output must be reproducible.

Identical authoritative inputs must produce identical authoritative
output.

Non-deterministic generation:

DEFECT.


======================================================================
§28. GITHUB APP / API PERMISSION CONTRACTS
======================================================================

Do NOT interpret least privilege as:

"remove permissions until normal operation breaks."

For every GitHub API endpoint used by autonomous normal operations,
document and test the ACTUAL required permission contract.

Audit at minimum:

- update pull request branch;
- merge pull request;
- update pull request;
- Draft/Ready transition;
- repository_dispatch;
- commit status;
- checks/check-runs;
- contents/ref reads;
- contents/ref writes where genuinely required;
- workflow-run reads;
- issue/PR comments where operationally required;
- branch/ref operations used by convergence.

Prove BOTH:

NO_OVER_PRIVILEGE

and:

NO_UNDER_PRIVILEGE_THAT_BREAKS_NORMAL_OPERATION.


If an endpoint requires a permission already available within the
approved GitHub App installation:

use the minimum sufficient bounded token/profile.

If it genuinely requires NEW installation authority:

OWNER_BOUNDARY.

Do not silently expand GitHub App installation authority.


======================================================================
§29. API CONTRACT REGRESSION TESTS
======================================================================

Encode critical API assumptions into tests.

Do not rely only on remembered/documented behavior.

Where applicable validate:

HTTP method

endpoint

required permission

repository identity

head repository

base repository

exact SHA preconditions

success response

conflict response

authorization denial

rate-limit behavior

stale-state behavior


Distinguish:

AUTHORITY_DENIED

TRANSIENT_API_FAILURE

STALE_STATE

SOURCE_CONFLICT

ALREADY_CONVERGED.


An upstream API behavior/permission change must fail visibly.

It must not silently convert normal operation into recurring Owner work.


======================================================================
§30. REQUIRED-SET / REQUIRED-CHECK CONSISTENCY
======================================================================

Audit:

required contexts

required checks

approval-policy envelope

required-set fingerprint

live required set

generation-bound required set

finalizer-required set


Detect and eliminate:

required-set drift

old required-set + new head

new required-set + old approval

stale status context

duplicate context

missing context

renamed context without migration

required context permanently pending


Required-set identity must be explicit and generation-bound.

Do not allow a required-set mismatch to be "fixed" by simply deleting
the requirement.


======================================================================
§31. STATUS / CHECK CONVERGENCE
======================================================================

Audit:

commit statuses

check runs

PR-target checks

push checks

late checks

post-merge checks

closed-PR checks

stale-generation checks


A late workflow from an obsolete state must not poison a successfully
verified landed generation.

Example:

PR merges successfully.

A pre-merge PR-target run finishes late and fails.

That run must be classified against:

generation

head

PR state

causal provenance.


Do not reinterpret a verified exact-main merge as failed because an
obsolete run completed later.

Required contexts must be:

exact-head bound

generation bound

terminal

non-ambiguous.


======================================================================
§32. TERMINAL STATE COMPLETENESS
======================================================================

Every autonomous operation must terminate into a finite machine-readable
state.

Use a bounded terminal vocabulary such as:

VERIFIED_PASS

VERIFIED_FAIL

OWNER_BOUNDARY

POLICY_DENIED

SUPERSEDED

FOLLOWER_SUCCESS

NO_OP_ALREADY_CONVERGED

SOURCE_CONFLICT

RECOVERY_EXHAUSTED


No operation may remain indefinitely:

PENDING

WAITING

SLEEPING

RESERVED

DISPATCHED

UNKNOWN

IN_PROGRESS


without:

- bounded timeout;
- explicit observer;
- deterministic continuation/recovery;
- terminal receipt.

Audit:

orphan reservations

orphan generations

orphan statuses

abandoned workflow runs

stale receipts

late post-merge runs

unconsumed authorization envelopes

orphan deployment change sets.


Every non-terminal state must have a machine-defined route to a terminal
state.


======================================================================
§33. FIXED-SLEEP / HUMAN-WINDOW ELIMINATION
======================================================================

Audit fixed sleeps and manual windows including patterns such as:

30-second sleep

60-second sleep

90-second sleep

600-second Owner merge window

human approval waiting loops


Replace unnecessary fixed waiting with:

event-driven continuation

condition-based bounded polling

terminal-state observation

natural downstream events


Where bounded waiting remains necessary define:

exact wait condition

maximum duration

timeout terminal state

retry/recovery behavior

receipt/evidence behavior


Normal operations must not consume runners while waiting for a human.

A human merge window is NOT a normal-operation continuation mechanism.


======================================================================
§34. RETRY / RATE-LIMIT / TRANSIENT-FAILURE POLICY
======================================================================

Audit and standardize handling of:

403

404

409

422

429

5xx

timeouts

GitHub secondary rate limits

AWS throttling

Lambda transient failure

CloudFormation transient failure

network interruption

temporary artifact unavailability

temporary downstream-event delay


Use bounded retry with jitter where safe.

Do NOT retry POLICY_DENIAL.

Do NOT retry OWNER_BOUNDARY as if it were transient.

Every retry path must record:

attempt number

failure classification

bounded retry reason

next action

maximum attempts/deadline

terminal classification


Infrastructure failure must not automatically become Owner approval.

After retry exhaustion:

emit a deterministic terminal result or enter an already-authorized
bounded recovery path.

Never leave the operation silently pending.


======================================================================
END OF FINAL MASTER SPECIFICATION — PART 2 OF 4
======================================================================

PART 2 ENDS HERE.

LAST SECTION IN THIS PART:

§34. RETRY / RATE-LIMIT / TRANSIENT-FAILURE POLICY

NEXT PART MUST BEGIN EXACTLY WITH:

§35. FAILURE-CODE QUALITY AND OBSERVABILITY

DO NOT EXECUTE THE MISSION YET.

WAIT UNTIL PARTS 3 AND 4 HAVE ALSO BEEN RECEIVED.