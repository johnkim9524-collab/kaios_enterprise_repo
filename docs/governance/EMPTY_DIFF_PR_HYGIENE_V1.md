# Empty-diff PR hygiene

An API result containing zero changed files is not proof that a PR is redundant.
The protected Dispatcher must resolve the complete immutable head and current-main
commits, verify both source SHAs, and compare their complete tree IDs. Missing,
different, foreign, closed, merged, or drifted sources fail closed.

The existing bounded redundant-PR profile may close a current-base empty PR only
after this equality proof. The broker independently re-reads both exact commits
before minting its existing pull_requests:write token. It adds no contents,
workflows, repository, IAM, credential, deployment, merge, or promotion authority.
Stale convergence still rejects an already-current base. Nonempty stale hygiene
retains its exact changed-file blob equality checks and removal/rename exclusions.

Receipts distinguish complete-tree equality from changed-file blob equality.
Closure remains reversible by reopening. Missing proof never becomes merge
authorization. Production, Public, G5, and provider activation remain HOLD.

Incident lineage: PR1884 predecessor-object intent was superseded by main efc5f7cb;
PR2286 durability intent was superseded by subsequent main dcbbea29. Both existing
branches were non-forcibly reconciled to exact main 8f69cc8926bbafad72fec0be19f7d2b12f85aeec.
Their remaining zero-file state exposed this cleanup gap. PR1903 is reused for
the producer, broker, workflow receipt, policy, template, and negative-test correction.

autonomous_effect: safely close fully redundant current-base PRs without routine
Owner orchestration. global_effect: retain the four-candidate bound and isolated
fail-closed classification; no unmeasured throughput claim. irreplaceable_value_effect:
retain immutable source and supersession lineage. transparency_effect: name the
actual equality proof and distinguish branch reconciliation from native closure.

Rollback: revert this code/policy change through governed landing; reopen a closed
PR if necessary. Operational completion requires a fresh natural Dispatcher receipt
binding exact main, head, tree, and closed PR readback after code deployment.
