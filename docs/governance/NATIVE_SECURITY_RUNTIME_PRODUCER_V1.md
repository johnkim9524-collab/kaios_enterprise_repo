# Native security runtime producer v1

The receipt grants no authorization for acquisition, external infrastructure mutation or release.

The first registered native domain is `SECURITY_SUPPLY_CHAIN`. Its inputs are the actual committed repository files and full dependency lockfiles, not synthetic business records. The existing pinned security workflow performs committed-secret scanning and native npm/pip vulnerability audits. On protected-main push only, after all steps succeed, the new producer binds these results to exact checkout SHA, GitHub repository/workflow identity, run ID and attempt 1.

The emitter re-reads report components, checks full tracked-file integrity against the actual checkout, requires complete raw audit files, rejects vulnerability/unavailable/partial results, and emits the canonical domain receipt. The collector authenticates the native successful run and archive digest before consuming it. A receipt digest alone is not a trust root. PR and manual runs remain observations and cannot emit registered live-domain evidence.

Scope is actual repository/source/dependency assurance only. This is not a penetration test or external infrastructure security assessment. It does not prove business data execution, provider rights, market evidence, Production readiness, or the other thirteen domains. The fourteen-domain threshold remains unchanged; registration is not verification.

Activation requires protected landing of this code. The automatically triggered main workflow then performs actual audits and publishes an exact-SHA/run/attempt archive. No manual dispatch or provider activation is authorized by this change. A source hash or dependency audit failure must be corrected; no green receipt is emitted for failed or partial work.

Rollback must revert producer registration and workflow emission together. Retain the existing security workload and all release HOLDs.

Constitutional effects: automatic native evidence improves autonomous observation; repository-wide source coverage does not claim global market coverage; owned content-addressed evidence improves traceability; explicit empirical scope prevents control tests from substituting for business runtime proof.
