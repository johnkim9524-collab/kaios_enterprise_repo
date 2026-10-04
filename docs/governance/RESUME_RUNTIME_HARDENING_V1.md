# Resume runtime hardening — implementation boundary

State: IMPLEMENTED_NOT_VERIFIED. This document is not a landing authority or an operational completion receipt.

`scripts/kidults/staging-operations/lib/resume-operation-v1.mjs` implements a stable operation identity and a fail-closed executor. Keys bind repository, root mission, stage, operation, exact target, and payload digest; session and retry fields are rejected. External state is read before claiming and again before execution. Protected receipt verification and authority adapters are mandatory. A single conditional ledger insert admits one writer. In-flight or ambiguous operations cannot be automatically reclaimed. An uncertain transport outcome becomes UNKNOWN and requires reconciliation rather than blind retry.

The PostgreSQL adapter has a unique operation key and conditional terminal updates. Its SQL is implementation, not evidence of deployed schema or live database behavior. The JavaScript concurrency test uses an atomic test ledger and proves orchestration behavior only. No cross-system exactly-once guarantee is claimed.

## Integration and acceptance still required

1. Wire protected source-state readers, authority checks, and receipt validators for each push, PR, approval, review request, dispatch, deployment, generation, and reservation consumption adapter. No permissive default callback is allowed.
2. Bind the executor to the protected launcher before any model dispatch. This repository cannot configure the external ChatGPT/Codex service by publishing a file.
3. Apply the operation table through an authorized ledger migration, isolate writer authority, and test real concurrent sessions and lost-response reconciliation. Existing task leases are not a substitute for operation keys.
4. Preserve original mission ownership, approval budgets, and rollback. Do not reset a consumed reservation or delete UNKNOWN records.
5. Verify interrupted execution, process replacement, uncertain remote outcomes, invalid receipts, and fenced writers through native operational receipts before completion.

Existing GitHub role fanout has a stable generation-bound dispatch key; retain it. Existing task-transition PostgreSQL fencing is reusable but covers task transitions, not every remote side effect. Neither mechanism establishes universal adapter coverage.

Rollback before activation: revert the hardening changes. No current production activation, database migration, IAM expansion, provider activation, or workflow dispatch is performed by this change. Production/Public/G5 and PAT/ruleset bypass remain HOLD.

Effects: autonomous_effect is safe reuse and ambiguity containment; global_effect is a shared operation interface across execution surfaces; irreplaceable_value_effect is durable mission and operation lineage; transparency_effect is explicit separation of implementation from native runtime proof.
