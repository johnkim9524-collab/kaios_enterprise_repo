# Trust Architecture Zero (TAZ) — Software Architecture Specification v1.0

**Status:** IMPLEMENTATION_READY / DRAFT_BRANCH_ONLY  
**Owner:** KPMO (Atlas)  
**Implementer:** Codex  
**Program Owner:** John  
**Base:** protected `main` = `69f9c45c8371c4439649de0f811f4c6a7b2149d6`  
**Release boundary:** Production / Public / G5 = HOLD  
**Purpose:** Reduce trust-path operational complexity without weakening existing receipt, provenance, bootstrap, authorization, audit, or protected-merge controls.

---

## 0. Normative language

`MUST`, `MUST NOT`, `SHALL`, `SHALL NOT`, `SHOULD`, `MAY` are normative.

This specification is an **implementation contract**, not a proposal for bypassing existing controls. If an implementation choice conflicts with current canonical governance on protected `main`, the existing canonical governance wins and the implementation SHALL fail closed until the conflict is explicitly resolved.

---

# 1. Executive implementation decision

TAZ v1 does **not** replace the repository's existing trust root, AI-agent bootstrap contract, receipt authority, provenance rules, or protected merge controls.

TAZ v1 introduces a **thin deterministic orchestration layer** that makes the existing controls operable through one bounded activation state machine.

The central rule is:

```text
TAZ MAY orchestrate existing trust controls.
TAZ MUST NOT become a second trust root.
TAZ MUST NOT manufacture authority.
TAZ MUST NOT reinterpret PASS from lower layers.
TAZ MUST fail closed when proof is missing, stale, inconsistent, replayed, or scope-mismatched.
```

The previous conceptual phrase "Bootstrap moves behind Trust Controller" is refined as follows:

```text
Trust Activation Controller (TAC)
    = orchestration facade only
    != authority root
    != replacement bootstrap
    != independent receipt issuer
```

Existing bootstrap and receipt validators remain authoritative.

---

# 2. Problem statement

Current repository controls contain strong fail-closed semantics, including task-bound bootstrap, expected-SHA binding, receipt verification, provenance distinction, promotion separation, and protected merge constraints. The operational weakness is not absence of controls; it is fragmentation of activation, verification, dispatch, and mutation flow across multiple artifacts and scripts.

TAZ therefore solves only these problems:

1. One canonical entrypoint for trust activation.
2. One canonical state machine describing whether a task is allowed to read, propose, mutate a work branch, or request protected landing.
3. One normalized result envelope for bootstrap/receipt/provenance verification.
4. One provider-ingress preflight contract that allows providers to be connected without weakening rights/evidence boundaries.
5. One audit trail format for every activation attempt, success or failure.
6. Deterministic idempotency and replay rejection.
7. Zero implicit elevation from repository access to mutation authority.

TAZ SHALL NOT solve product logic, entity resolution, current-SOLD ranking, Portal UX, provider commercial terms, or Production release authorization.

---

# 3. Architectural invariants

The following are hard invariants.

## INV-001 — Single authority source
TAZ SHALL consume authority from existing canonical governance/bootstrap artifacts. It SHALL NOT define an alternate authorization vocabulary that can independently permit mutation.

## INV-002 — Expected SHA is binding, not provenance
An externally supplied expected SHA MAY bind checkout identity but SHALL NOT be treated as GitHub provenance. Existing provenance validators remain authoritative.

## INV-003 — Receipt preservation
Existing signed/verified receipt semantics SHALL remain intact. TAZ SHALL store or reference receipt results but SHALL NOT rewrite a failing receipt into PASS.

## INV-004 — Promotion separation
Remote branch existence, successful bootstrap, successful tests, or successful provider preflight SHALL NOT imply merge, release, Public, Production, or G5 authorization.

## INV-005 — Provider data quarantine
New provider data SHALL enter only through the provider-ingress boundary and SHALL remain non-product/non-evidence until rights, schema, provenance, and downstream admission gates pass.

## INV-006 — Fail closed
UNKNOWN, STALE, MISMATCH, REPLAY, UNSIGNED, INVALID, EXPIRED, WRONG_SCOPE, DIRTY_WORKTREE, ORIGIN_MISMATCH, or GOVERNANCE_CONFLICT SHALL block the requested protected operation.

## INV-007 — No synthetic promotion
Synthetic/control data SHALL NOT become empirical evidence or launch proof.

## INV-008 — No direct protected-main mutation
TAZ v1 SHALL support only bounded work-branch mutation. Protected `main` landing remains a separate governed action.

## INV-009 — Audit every decision
Every activation attempt SHALL produce a deterministic audit result, including failures.

## INV-010 — Core-four preservation
Receipt, Provenance, Trusted Merge, and Audit Trail are protected concepts and SHALL not be removed by TAZ v1.

---

# 4. Trust zones

```text
+-------------------------------------------------------------+
| TRUSTED AUTHORITY ZONE                                      |
| Program Owner approvals / canonical governance / trust root |
+----------------------------+--------------------------------+
                             |
                             v
+-------------------------------------------------------------+
| CONTROLLED ACTIVATION ZONE                                  |
| TAZ TAC -> existing bootstrap -> existing receipt verifier  |
| -> provenance validation -> normalized Activation Decision  |
+----------------------------+--------------------------------+
                             |
                             v
+-------------------------------------------------------------+
| OPERATIONAL READ ZONE                                       |
| repo read / dependency inventory / analysis / planning      |
+----------------------------+--------------------------------+
                             |
                  explicit bounded mutation grant
                             v
+-------------------------------------------------------------+
| WORK-BRANCH MUTATION ZONE                                   |
| patch / tests / commit / draft PR                           |
+----------------------------+--------------------------------+
                             |
                    separate protected landing gate
                             v
+-------------------------------------------------------------+
| PROTECTED LANDING / RELEASE ZONE                            |
| existing governed merge; Public/Production/G5 remain HOLD   |
+-------------------------------------------------------------+
```

No lower zone MAY grant itself access to a higher zone.

---

# 5. Components

TAZ v1 consists of six components.

## 5.1 `taz-activate`
Canonical CLI entrypoint.

Responsibilities:
- Parse task intent.
- Resolve current repository context.
- Invoke existing bootstrap/receipt/provenance validators.
- Generate normalized Activation Decision.
- Persist audit receipt locally/artifact surface as permitted.
- Never execute repository mutation itself.

Suggested path:

```text
scripts/taz/taz-activate-v1.mjs
```

## 5.2 `taz-decision`
Pure decision engine.

Suggested path:

```text
scripts/taz/lib/taz-decision-v1.mjs
```

Properties:
- Pure function.
- No network.
- No filesystem mutation.
- Deterministic for identical normalized inputs.

## 5.3 `taz-audit`
Canonical audit envelope generator/validator.

Suggested paths:

```text
scripts/taz/lib/taz-audit-v1.mjs
schemas/taz/taz-activation-receipt-v1.schema.json
```

## 5.4 `taz-provider-preflight`
Provider-ingress preflight only.

Suggested path:

```text
scripts/taz/taz-provider-preflight-v1.mjs
```

It validates metadata and permission/evidence prerequisites before any payload becomes admissible. It SHALL NOT fetch external data by itself in Sprint 1.

## 5.5 `taz-contract`
Machine-readable canonical TAZ policy contract.

Suggested path:

```text
coordination/kidults/governance/taz-contract-v1.json
```

This file SHALL reference, not duplicate, canonical bootstrap/receipt authorities whenever possible.

## 5.6 `taz-regression`
Test suite and fixture set.

Suggested paths:

```text
tests/taz/
fixtures/taz/
```

---

# 6. Actor model

| Actor | Read | Work branch mutation | Protected merge | Release/Public/Production/G5 |
|---|---:|---:|---:|---:|
| Program Owner | YES | policy dependent | explicit governed approval | explicit separate approval |
| KPMO | YES | bounded reversible work | request/review per canonical gate | NO implicit authority |
| Codex | YES | only after valid activation | NO direct bypass | NO |
| CI Runner | bounded | bounded generated artifacts/tests | only through existing governed workflow | NO implicit authority |
| Provider Adapter | provider-specific | writes only quarantined ingress/data-plane location | N/A | N/A |

Codex SHALL treat this table as a ceiling, not a grant. Actual authority must still be proven by canonical runtime evidence.

---

# 7. Activation intent model

TAZ v1 defines exactly four requested intents:

```text
READ
PROPOSE
MUTATE_WORK_BRANCH
REQUEST_PROTECTED_LANDING
```

Interpretation:

- `READ`: inspect repository and produce analysis only.
- `PROPOSE`: produce a patch plan or non-mutating proposal.
- `MUTATE_WORK_BRANCH`: patch/test/commit only on a non-protected branch within approved scope.
- `REQUEST_PROTECTED_LANDING`: prepare/validate evidence for existing protected landing flow. TAZ does not perform landing unless the existing governed mechanism separately authorizes it.

No `PRODUCTION`, `PUBLIC`, `G5`, `PROVIDER_PURCHASE`, `ACCEPT_EULA`, or `EXTERNAL_SPEND` intent exists in TAZ v1.

---

# 8. Activation state machine

Canonical states:

```text
UNINITIALIZED
  -> CONTEXT_RESOLVED
  -> BOOTSTRAP_VERIFIED
  -> RECEIPT_VERIFIED
  -> PROVENANCE_VERIFIED
  -> SCOPE_VERIFIED
  -> ACTIVATED_READ
  -> ACTIVATED_PROPOSE
  -> ACTIVATED_WORK_BRANCH
  -> LANDING_REQUEST_ELIGIBLE

Any state -> BLOCKED
Any state -> EXPIRED
Any reused nonce -> REPLAY_BLOCKED
```

Allowed transitions:

```text
UNINITIALIZED -> CONTEXT_RESOLVED
CONTEXT_RESOLVED -> BOOTSTRAP_VERIFIED | BLOCKED
BOOTSTRAP_VERIFIED -> RECEIPT_VERIFIED | BLOCKED
RECEIPT_VERIFIED -> PROVENANCE_VERIFIED | BLOCKED
PROVENANCE_VERIFIED -> SCOPE_VERIFIED | BLOCKED
SCOPE_VERIFIED -> ACTIVATED_READ
SCOPE_VERIFIED -> ACTIVATED_PROPOSE
SCOPE_VERIFIED -> ACTIVATED_WORK_BRANCH
ACTIVATED_WORK_BRANCH -> LANDING_REQUEST_ELIGIBLE
```

Forbidden transitions include:

```text
UNINITIALIZED -> ACTIVATED_WORK_BRANCH
READ -> LANDING_REQUEST_ELIGIBLE
BOOTSTRAP_VERIFIED -> LANDING_REQUEST_ELIGIBLE
RECEIPT_VERIFIED -> protected-main mutation
provider preflight PASS -> empirical Evidence PASS
```

---

# 9. Activation input contract

CLI example:

```bash
node scripts/taz/taz-activate-v1.mjs \
  --intent MUTATE_WORK_BRANCH \
  --task-id TAZ-S2-001 \
  --expected-sha <sha> \
  --working-branch codex/taz-sprint2-implementation-v1 \
  --scope-file coordination/kidults/governance/taz-scope-example-v1.json \
  --nonce <opaque-nonce>
```

Required normalized input:

```json
{
  "version": "TAZ_ACTIVATION_INPUT_V1",
  "task_id": "TAZ-S2-001",
  "intent": "MUTATE_WORK_BRANCH",
  "expected_sha": "40-hex-sha",
  "working_branch": "codex/taz-sprint2-implementation-v1",
  "scope_ref": "path-or-authoritative-ref",
  "nonce": "opaque value",
  "requested_by": "actor identity",
  "requested_at": "RFC3339"
}
```

Validation rules:
- Unknown fields MAY be retained but SHALL NOT grant authority.
- Missing required field = `BLOCKED`.
- Protected `main` supplied as `working_branch` for mutation = `BLOCKED`.
- Nonce reuse = `REPLAY_BLOCKED`.
- `expected_sha` mismatch = `BLOCKED`.
- Dirty worktree where clean worktree is required by canonical bootstrap = `BLOCKED`.

---

# 10. Activation decision contract

Canonical output:

```json
{
  "version": "TAZ_ACTIVATION_DECISION_V1",
  "task_id": "TAZ-S2-001",
  "intent": "MUTATE_WORK_BRANCH",
  "decision": "ALLOW_WORK_BRANCH_MUTATION",
  "state": "ACTIVATED_WORK_BRANCH",
  "authority_source": "EXISTING_CANONICAL_GOVERNANCE",
  "bootstrap": {
    "status": "PASS",
    "receipt_ref": "..."
  },
  "receipt": {
    "status": "PASS",
    "digest": "sha256:..."
  },
  "provenance": {
    "status": "PASS",
    "class": "GITHUB_CONTEXT_BOUND"
  },
  "scope": {
    "status": "PASS",
    "allowed_paths": ["scripts/taz/**", "tests/taz/**"]
  },
  "bound_sha": "...",
  "working_branch": "...",
  "nonce_digest": "sha256:...",
  "expires_at": "RFC3339",
  "release_authorized": false,
  "public_authorized": false,
  "production_authorized": false,
  "g5_authorized": false,
  "reasons": []
}
```

Allowed `decision` values:

```text
ALLOW_READ
ALLOW_PROPOSAL
ALLOW_WORK_BRANCH_MUTATION
ELIGIBLE_TO_REQUEST_EXISTING_LANDING_GATE
BLOCK
```

No other allow-state is valid in v1.

---

# 11. Error model

All errors SHALL be structured and machine-readable.

Required codes:

```text
TAZ_E_INPUT_INVALID
TAZ_E_EXPECTED_SHA_MISMATCH
TAZ_E_ORIGIN_MISMATCH
TAZ_E_BOOTSTRAP_FAIL
TAZ_E_RECEIPT_MISSING
TAZ_E_RECEIPT_INVALID
TAZ_E_RECEIPT_EXPIRED
TAZ_E_PROVENANCE_UNKNOWN
TAZ_E_SCOPE_MISSING
TAZ_E_SCOPE_MISMATCH
TAZ_E_PROTECTED_BRANCH_MUTATION
TAZ_E_NONCE_REPLAY
TAZ_E_GOVERNANCE_CONFLICT
TAZ_E_DIRTY_WORKTREE
TAZ_E_PROVIDER_RIGHTS_UNKNOWN
TAZ_E_PROVIDER_SCHEMA_UNKNOWN
TAZ_E_PROVIDER_PROVENANCE_UNKNOWN
TAZ_E_PROVIDER_RETENTION_UNKNOWN
TAZ_E_PROVIDER_DERIVED_RIGHTS_UNKNOWN
```

Process exit codes:

```text
0 = allowed requested bounded operation
2 = invalid input
3 = trust verification failed
4 = scope violation
5 = replay/expiry
6 = governance conflict
7 = provider preflight blocked
8 = internal deterministic processing error
```

TAZ SHALL never return exit code 0 for `decision=BLOCK`.

---

# 12. Nonce and replay protection

Each mutating activation MUST include a unique nonce.

TAZ SHALL persist only a digest where policy requires secrecy.

Replay cache minimum record:

```json
{
  "nonce_sha256": "...",
  "task_id": "...",
  "bound_sha": "...",
  "intent": "...",
  "first_seen_at": "...",
  "expires_at": "..."
}
```

Rules:
- Same nonce + same task = reject.
- Same nonce + different task = reject.
- Expired activation = reject.
- Clock rollback beyond accepted skew = reject/fail closed.
- Replay storage unavailable for mutating intent = reject.

Read-only activation MAY operate without durable nonce storage if existing canonical governance allows it; mutation MAY NOT.

---

# 13. Scope contract

TAZ work-branch mutation SHALL be path-bounded.

Example:

```json
{
  "version": "TAZ_SCOPE_V1",
  "task_id": "TAZ-S2-001",
  "allowed_paths": [
    "scripts/taz/**",
    "tests/taz/**",
    "schemas/taz/**",
    "coordination/kidults/governance/taz-contract-v1.json"
  ],
  "forbidden_paths": [
    ".github/workflows/**",
    "AGENTS.md",
    ".github/AI_AGENT_OPERATING_RULES.md",
    "coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json"
  ],
  "protected_main_mutation": false,
  "external_calls": false,
  "provider_data_acquisition": false,
  "release_authorized": false
}
```

Path conflict SHALL resolve toward denial.

Sprint 2 implementation of TAZ itself SHALL initially forbid modification of existing trust-root/AI bootstrap canonical files. If Codex discovers an unavoidable compatibility change, it SHALL stop at a documented conflict instead of modifying them implicitly.

---

# 14. Existing bootstrap integration

TAZ SHALL call the existing bootstrap implementation as a child verification stage or library-compatible wrapper.

Current known authoritative family includes:

```text
scripts/governance/bootstrap-ai-agent-from-github-v1.mjs
scripts/governance/verify-ai-agent-bootstrap-receipt-v1.mjs
scripts/governance/validate-ai-agent-github-bootstrap-v1.mjs
coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json
```

Implementation requirement:

```text
TAZ -> existing bootstrap -> existing receipt verifier -> existing provenance checks
```

Forbidden implementation:

```text
TAZ -> reimplement weaker bootstrap -> issue own PASS
```

Codex SHALL prefer adapter/wrapper integration to duplication.

---

# 15. Provider ingress architecture

Provider arrival must not wait for the full TAZ refactor.

TAZ v1 defines a provider preflight barrier so incoming provider data can be safely held even before downstream product admission.

```text
Provider
  -> Provider Adapter
  -> TAZ Provider Preflight
  -> QUARANTINE
  -> Rights Receipt Check
  -> Schema/Semantics Check
  -> Provenance Check
  -> Retention/Deletion Policy Check
  -> Derived-Results Rights Check
  -> Admission Decision
       -> REJECT
       -> HOLD_QUARANTINE
       -> ALLOW_INTERNAL_EVALUATION
       -> ELIGIBLE_FOR_EXISTING_EVIDENCE_PIPELINE
```

Provider preflight SHALL NOT output `EVIDENCE_PASS`, `PRODUCT_PASS`, or `PRODUCTION_PASS`.

## 15.1 Required provider descriptor

```json
{
  "version": "TAZ_PROVIDER_DESCRIPTOR_V1",
  "provider_id": "gemrate",
  "provider_contract_ref": "internal authoritative ref",
  "access_mode": "API|FILE|MANUAL_SAMPLE|OTHER",
  "data_class": "PRIVATE_PROVIDER_DATA",
  "schema_ref": "...",
  "rights_receipt_ref": "...",
  "provenance_policy_ref": "...",
  "retention_policy_ref": "...",
  "derived_results_policy_ref": "...",
  "image_rights_policy_ref": "...|UNKNOWN",
  "expected_freshness": "...|UNKNOWN"
}
```

Any required field unknown SHALL be represented as `UNKNOWN`, never omitted and never inferred as permissive.

## 15.2 Preflight decision

Allowed results:

```text
REJECT
HOLD_QUARANTINE
ALLOW_INTERNAL_EVALUATION
ELIGIBLE_FOR_EXISTING_EVIDENCE_PIPELINE
```

`ELIGIBLE_FOR_EXISTING_EVIDENCE_PIPELINE` means only that TAZ's ingress prerequisites passed. The existing evidence pipeline still decides admission.

## 15.3 Immediate data-arrival policy

If provider payload arrives before all metadata is resolved:
- Preserve raw payload only in the already-approved private/quarantined storage surface.
- Do not normalize into product tables if that would violate retention/rights boundaries.
- Record source owner, arrival time, transport, provider object identifier if permitted, and payload digest.
- Mark state `HOLD_QUARANTINE`.
- No Portal exposure.
- No model training unless separately permitted.
- No derived/public output.

---

# 16. Provider adapter contract

Provider adapters SHALL be replaceable and vertical-agnostic at the control plane.

Each adapter MUST implement:

```text
describe() -> ProviderDescriptor
health() -> ProviderHealth
stage(input) -> QuarantineReference
normalize(quarantineRef) -> NormalizedCandidate[]
provenance(normalizedCandidate) -> ProvenanceEnvelope
```

Important: `normalize()` SHALL only run when preflight state permits normalization.

Provider-specific fields MUST not leak into shared downstream contracts unless explicitly namespaced under `provider_extensions`.

Canonical shared candidate envelope:

```json
{
  "provider_id": "...",
  "provider_record_id": "...",
  "observed_at": "...",
  "received_at": "...",
  "vertical": "...",
  "object_identity": {},
  "transaction": {},
  "media": [],
  "provenance": {},
  "rights": {},
  "provider_extensions": {}
}
```

Missing data SHALL remain missing; missing is not zero.

---

# 17. Audit receipt

Every TAZ activation SHALL emit a receipt.

Minimum schema:

```json
{
  "version": "TAZ_ACTIVATION_RECEIPT_V1",
  "receipt_id": "deterministic-or-uuid",
  "task_id": "...",
  "intent": "...",
  "decision": "...",
  "state": "...",
  "requested_at": "...",
  "decided_at": "...",
  "bound_sha": "...",
  "working_ref": "...",
  "bootstrap_receipt_ref": "...",
  "bootstrap_receipt_digest": "...",
  "provenance_class": "...",
  "scope_digest": "...",
  "nonce_sha256": "...",
  "reason_codes": [],
  "authorization_ceiling": {
    "work_branch_mutation": true,
    "protected_landing": false,
    "public": false,
    "production": false,
    "g5": false
  }
}
```

Sensitive tokens, raw credentials, private provider payloads, private cert material, or payment details SHALL NOT appear in receipts.

---

# 18. Sequence — work-branch mutation

```text
Codex
  | request MUTATE_WORK_BRANCH
  v
TAZ Activate
  | resolve repo + expected SHA + branch + scope
  v
Existing Bootstrap
  | PASS/FAIL
  v
Existing Receipt Verification
  | PASS/FAIL
  v
Existing Provenance Verification
  | PASS/FAIL
  v
TAZ Decision Engine
  | ALLOW_WORK_BRANCH_MUTATION or BLOCK
  v
Audit Receipt
  |
  +--> BLOCK: stop
  |
  +--> ALLOW: Codex patches allowed paths only
                -> tests
                -> commit on work branch
                -> Draft PR
                -> separate landing gate remains required
```

---

# 19. Sequence — provider arrival

```text
Provider Transport
   -> Adapter.stage()
   -> quarantine reference + payload digest
   -> TAZ provider preflight
        -> rights known?
        -> schema semantics known?
        -> retention known?
        -> provenance known?
        -> derived-results rights known?
   -> HOLD_QUARANTINE or ALLOW_INTERNAL_EVALUATION
   -> normalization if allowed
   -> existing Evidence admission pipeline
   -> downstream Candidate / Track B / Projection only under existing gates
```

No provider payload enters Portal directly.

---

# 20. Persistence model

TAZ Sprint 2 SHALL minimize new persistence.

Preferred:
- Existing repository governance artifacts for policy.
- Existing approved ledger/audit surfaces for durable receipts.
- Ephemeral local JSON for non-sensitive transient results.
- PostgreSQL only where an existing authoritative ledger contract already exists.

Do not create a second ledger database solely for TAZ.

If replay protection requires durable state and no approved surface is available, implementation SHALL fail closed for mutation and report `TAZ_E_GOVERNANCE_CONFLICT` or an explicit storage blocker rather than inventing a new trust store.

---

# 21. Security requirements

## SEC-001
No secrets in CLI logs, receipts, PR comments, or committed fixtures.

## SEC-002
Raw provider payloads SHALL NOT be committed to GitHub.

## SEC-003
Hash comparisons SHALL use exact canonical byte representations defined by upstream contracts.

## SEC-004
Canonical repository origin rules SHALL be inherited from existing governance.

## SEC-005
TAZ SHALL not accept SSH/alias origins if existing bootstrap rejects them.

## SEC-006
All mutation grants SHALL be task-bound, SHA-bound, branch-bound, scope-bound, nonce-bound, and time-bounded where upstream permits.

## SEC-007
Do not weaken validation because a command runs in CI.

## SEC-008
Unknown authority = deny.

## SEC-009
Do not log raw authorization tokens, API keys, payment identifiers, provider credentials, cert numbers, or private account data.

## SEC-010
Provider image/media rights are independent from text/metadata rights and SHALL be separately represented.

---

# 22. Observability

Each run SHALL expose structured fields:

```text
taz.version
taz.task_id
taz.intent
taz.decision
taz.state
taz.bound_sha
taz.working_ref
taz.bootstrap_status
taz.receipt_status
taz.provenance_status
taz.scope_status
taz.provider_preflight_status (when applicable)
taz.reason_codes
taz.duration_ms
```

Never expose secrets.

Recommended human summary:

```text
TAZ_ACTIVATION: PASS
intent=MUTATE_WORK_BRANCH
bound_sha=<sha>
working_branch=<branch>
bootstrap=PASS receipt=PASS provenance=PASS scope=PASS
ceiling=WORK_BRANCH_ONLY
protected_landing=NOT_AUTHORIZED
production=HOLD public=HOLD g5=HOLD
```

---

# 23. Compatibility requirements

Codex SHALL verify TAZ against current protected main behavior before changing any existing governance artifact.

Required compatibility assertions:

1. Existing bootstrap PASS remains PASS when called through TAZ with identical valid inputs.
2. Existing bootstrap FAIL remains FAIL.
3. Existing receipt invalidation remains blocking.
4. Expected-SHA mismatch remains blocking.
5. Provenance UNKNOWN remains blocking for mutation.
6. Remote branch presence does not become authority.
7. Existing protected landing authorization remains separate.
8. Existing current-SOLD private candidate PASS is not promoted to rights/evidence/product PASS by TAZ.
9. Existing AI agent operating rules remain a ceiling.
10. Existing Production/Public/G5 HOLD remains unchanged.

---

# 24. Test specification

## 24.1 Positive tests

`T001`: Valid READ activation returns `ALLOW_READ`.  
`T002`: Valid PROPOSE activation returns `ALLOW_PROPOSAL`.  
`T003`: Valid bounded mutation activation returns `ALLOW_WORK_BRANCH_MUTATION`.  
`T004`: Valid work-branch completion may become `LANDING_REQUEST_ELIGIBLE` but not merged.  
`T005`: Provider descriptor with complete internal-evaluation rights can return `ALLOW_INTERNAL_EVALUATION`.

## 24.2 Negative tests

`T101`: SHA mismatch -> BLOCK.  
`T102`: invalid origin -> BLOCK.  
`T103`: missing receipt -> BLOCK.  
`T104`: receipt digest mismatch -> BLOCK.  
`T105`: expired receipt -> BLOCK.  
`T106`: provenance unknown -> mutation BLOCK.  
`T107`: nonce replay -> `REPLAY_BLOCKED`.  
`T108`: forbidden path in scope -> BLOCK.  
`T109`: attempt to mutate main -> BLOCK.  
`T110`: request Production/Public/G5 -> unsupported/BLOCK.  
`T111`: provider rights UNKNOWN -> `HOLD_QUARANTINE`.  
`T112`: retention UNKNOWN -> `HOLD_QUARANTINE`.  
`T113`: derived-results rights UNKNOWN -> `HOLD_QUARANTINE`.  
`T114`: image rights UNKNOWN while metadata rights PASS -> media remains blocked.  
`T115`: provider payload PASS cannot become Evidence PASS inside TAZ.  
`T116`: synthetic fixture cannot become empirical PASS.  
`T117`: replay store unavailable during mutation -> BLOCK.  
`T118`: dirty worktree when canonical bootstrap requires clean -> BLOCK.  
`T119`: alternate receipt issuer -> BLOCK.  
`T120`: lower-layer warning normalized as PASS -> test must fail.

## 24.3 Regression tests

Codex MUST run all existing governance/bootstrap tests that cover modified call paths. If no direct test selector exists, run the narrowest deterministic relevant suite plus required repository regression mandated by current rules.

A TAZ-specific green suite SHALL NOT be considered sufficient if existing governance regression fails.

---

# 25. Definition of Done — Sprint 2 implementation

Sprint 2 is COMPLETE only when all of the following are evidence-backed:

- [ ] `taz-activate-v1.mjs` exists.
- [ ] Pure decision engine exists.
- [ ] Machine-readable TAZ contract exists.
- [ ] Audit schema exists and validates.
- [ ] Existing bootstrap is invoked/reused, not weakened or duplicated into an alternate authority path.
- [ ] READ / PROPOSE / MUTATE_WORK_BRANCH / REQUEST_PROTECTED_LANDING state model implemented.
- [ ] Protected-main mutation blocked.
- [ ] Nonce/replay logic implemented for mutating path.
- [ ] Scope/path enforcement implemented.
- [ ] Provider preflight descriptor/decision implemented without external fetch.
- [ ] Provider UNKNOWN rights produce HOLD_QUARANTINE.
- [ ] All T001–T120 applicable tests pass.
- [ ] Existing relevant governance tests pass.
- [ ] No credentials/private payloads added to repository.
- [ ] Draft PR opened from bounded branch.
- [ ] Exact head SHA recorded.
- [ ] Production/Public/G5 remain HOLD.

---

# 26. Codex implementation backlog — exact order

Codex SHALL execute in this order unless a compatibility blocker is discovered.

## Task 1 — Inventory and freeze
Read the existing canonical bootstrap, receipt verification, provenance, AI-agent rules, and governed landing paths. Produce a one-page implementation mapping in the PR description. No code change yet.

Acceptance:
- existing authoritative scripts/files identified;
- no alternate trust root introduced.

## Task 2 — Pure decision engine
Implement normalized input -> decision/state mapping.

Acceptance:
- deterministic unit tests;
- no I/O inside decision function.

## Task 3 — Activation wrapper
Implement CLI and adapters to existing bootstrap/receipt/provenance validators.

Acceptance:
- existing fail states preserved exactly or more strictly;
- no PASS reinterpretation.

## Task 4 — Scope enforcement
Implement path allow/deny and protected-main denial.

Acceptance:
- forbidden-path tests pass;
- main mutation negative test passes.

## Task 5 — Audit receipt
Implement schema + generation + validation.

Acceptance:
- failure attempts also produce safe receipt;
- secrets absent.

## Task 6 — Replay protection
Implement nonce digest and durable/approved replay check for mutating activation.

Acceptance:
- replay fails closed;
- unavailable replay state blocks mutation.

## Task 7 — Provider preflight
Implement provider descriptor validator and preflight decision engine only.

Acceptance:
- no external API call;
- unknown rights/retention/derived results => HOLD_QUARANTINE;
- metadata and media rights separated.

## Task 8 — Integration regression
Run TAZ tests + existing relevant governance tests.

Acceptance:
- exact-head PASS evidence;
- existing controls not weakened.

## Task 9 — Draft PR handoff
Open/maintain Draft PR; do not mark Ready or merge without separate authorization if required by canonical governance.

---

# 27. Codex stop conditions

Codex SHALL stop and report a blocker instead of improvising when any of the following occurs:

1. Existing canonical governance and this SAS conflict materially.
2. Implementing replay protection would require a new secret/trust store not already approved.
3. Existing bootstrap cannot be safely called without modifying protected canonical behavior.
4. A required change touches Production/Public/G5.
5. A provider integration requires contract acceptance, payment, credentials, login/2FA, or external spend.
6. A provider's permitted-use, retention, provenance, or derived-result rights remain unknown.
7. An irreversible security/trust-root change is required.
8. Existing protected landing mechanism requires Owner-specific authorization not already present.

Stop means: keep changes on bounded branch, document exact conflict/evidence, do not weaken the gate.

---

# 28. Migration strategy

TAZ v1 uses strangler migration, not big-bang replacement.

Phase A — wrapper only:
```text
TAZ -> existing controls
```

Phase B — callers gradually use TAZ as the standard entrypoint.

Phase C — duplicate orchestration code may be removed only after equivalence is proven by regression and canonical governance explicitly accepts the removal.

No existing bootstrap or governance component is deleted in Sprint 2 merely because TAZ exists.

---

# 29. Rollback

Rollback is simple because TAZ v1 is additive.

Rollback procedure:
1. Stop invoking TAZ entrypoint.
2. Revert TAZ-specific files/call-site changes.
3. Return callers to existing canonical bootstrap path.
4. Re-run existing governance regression.
5. Confirm no TAZ receipt/state is required for historical control validity.

TAZ SHALL not become a mandatory irreversible dependency until an explicit later migration decision.

---

# 30. KPMO acceptance gate

KPMO accepts Sprint 2 only if:

```text
architecture_simplification = TRUE
existing_trust_strength >= baseline
second_trust_root = FALSE
receipt_semantics_preserved = TRUE
provenance_semantics_preserved = TRUE
protected_merge_separation_preserved = TRUE
provider_quarantine_fail_closed = TRUE
regression = PASS
production_authorized = FALSE
public_authorized = FALSE
g5_authorized = FALSE
```

Any FALSE/UNKNOWN in the protected trust conditions => HOLD.

---

# 31. Codex handoff command

Codex shall treat this SAS as the architecture contract for Sprint 2:

```text
Implement Trust Architecture Zero v1 exactly as defined in
`docs/architecture/taz-software-architecture-specification-v1.md`.

Start by inventorying and mapping the existing canonical bootstrap,
receipt, provenance, AI-agent operating rules, and protected landing path.
Do not modify the existing trust root or weaken any fail-closed behavior.
TAZ is an orchestration facade, not a second authority source.

Implement on a bounded non-protected branch. Preserve Production/Public/G5 HOLD.
Do not call external providers, acquire provider data, accept contracts/EULAs,
activate credentials, incur spend, or make irreversible trust/security changes.
If this SAS conflicts with canonical protected-main governance, stop at the
conflict and report the exact file/rule rather than improvising.

Required output:
- implementation files
- TAZ tests
- existing-governance regression evidence
- exact head SHA
- Draft PR
- explicit remaining HOLD/blockers
```

---

# 32. Sprint 1 verdict

This SAS is sufficient to begin implementation because it defines:

- authority ceiling;
- trust boundaries;
- exact components;
- activation intents;
- state machine;
- machine contracts;
- error model;
- replay rules;
- scope enforcement;
- provider arrival behavior;
- security controls;
- test matrix;
- implementation order;
- stop conditions;
- rollback;
- acceptance gate.

**Sprint 1 architecture status:** `IMPLEMENTATION_READY_ON_DRAFT_BRANCH`  
**Protected main status:** unchanged  
**Provider data status:** safe ingress behavior specified; no provider activation authorized  
**Production/Public/G5:** HOLD
