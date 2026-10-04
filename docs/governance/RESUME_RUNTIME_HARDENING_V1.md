# Resume runtime hardening — implementation boundary

State: IMPLEMENTED_NOT_VERIFIED. This document is not a landing authority or an operational completion receipt.

`scripts/kidults/staging-operations/lib/resume-operation-v1.mjs` implements a stable operation identity and a fail-closed executor. Keys bind repository, root mission, stage, operation, exact target, and payload digest; session and retry fields are rejected. External state is read before claiming and again before execution. Protected receipt verification and authority adapters are mandatory. A single conditional ledger insert admits one writer. In-flight or ambiguous operations cannot be automatically reclaimed. An uncertain transport outcome becomes UNKNOWN and requires reconciliation rather than blind retry.

The PostgreSQL adapter has a unique operation key and conditional terminal updates. Its SQL is implementation, not evidence of deployed schema or live database behavior. The JavaScript concurrency test uses an atomic test ledger and proves orchestration behavior only. No cross-system exactly-once guarantee is claimed.

The generation-bound dispatch builder is composed with the executor by `resume-dispatch-fanout-v1.mjs`. Its receipt checks retain exact binding and digest validation and additionally require a protected authenticator. Stable identity excludes workflow run and attempt. This function is not yet called by the normal dispatcher workflow; disposable PostgreSQL CI exercises its concurrency and replacement reuse using explicitly isolated transport fixtures. The token broker remains token-only and the current workflow still performs its direct GitHub request.

## Integration and acceptance still required

The DynamoDB adapter `dynamodb-operation-ledger-v1.mjs` offers an alternative to a new operational PostgreSQL connection. It uses the existing table's `pk`/`sk` shape with a separate `RESUME_OPERATION_V1#` namespace; landing generation reservations remain separate. Conditional insertion, consistent reads, owner-fenced terminal updates and late success reconciliation preserve the original writer. Tests use injected transport fixtures and do not prove deployed DynamoDB behavior. The existing ledger writer does not expose these operations and Dispatcher can invoke only the token broker. Activation therefore still requires a protected operation RPC, bound receipt authentication, namespace-limited authority and normal workflow wiring; this adapter grants none of those permissions. No console setting should be changed to bypass the signed landing API.

1. Wire protected source-state readers, authority checks, and receipt validators for each push, PR, approval, review request, dispatch, deployment, generation, and reservation consumption adapter. No permissive default callback is allowed.
2. Bind the executor to the protected launcher before any model dispatch. This repository cannot configure the external ChatGPT/Codex service by publishing a file.
3. Apply the operation table through an authorized ledger migration, isolate writer authority, and test real concurrent sessions and lost-response reconciliation. Existing task leases are not a substitute for operation keys.
4. Preserve original mission ownership, approval budgets, and rollback. Do not reset a consumed reservation or delete UNKNOWN records.
5. Verify interrupted execution, process replacement, uncertain remote outcomes, invalid receipts, and fenced writers through native operational receipts before completion.

Existing GitHub role fanout has a stable generation-bound dispatch key; retain it. Existing task-transition PostgreSQL fencing is reusable but covers task transitions, not every remote side effect. Neither mechanism establishes universal adapter coverage.

Rollback before activation: revert the hardening changes. No current production activation, database migration, IAM expansion, provider activation, or workflow dispatch is performed by this change. Production/Public/G5 and PAT/ruleset bypass remain HOLD.

Effects: autonomous_effect is safe reuse and ambiguity containment; global_effect is a shared operation interface across execution surfaces; irreplaceable_value_effect is durable mission and operation lineage; transparency_effect is explicit separation of implementation from native runtime proof.
