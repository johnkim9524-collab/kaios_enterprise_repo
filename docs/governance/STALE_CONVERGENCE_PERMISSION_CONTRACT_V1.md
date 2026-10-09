# Stale branch convergence permission contract

The Dispatcher classifies safe same-repository stale PRs before its broker
reconciles the exact PR head, old base and current protected-main SHA.
GitHub's update-branch operation may write workflow files from the PR or import
them from protected main. The PR's changed paths alone cannot prove that the
operation needs no workflow permission.

Only `AUTONOMOUS_STALE_BASE_CONVERGENCE` requests `contents:write`,
`pull_requests:write`, `metadata:read` and `workflows:write` for the one selected
repository. The read token, general event-dispatch token and redundant-PR
hygiene token retain their existing scopes. Missing, downgraded, additional or
unexpected permissions are rejected. Main/head/base drift prevents write mint.
Existing semantic classification, independent machine verification, fresh CI,
new authorization generations, no force push and protected landing remain
required. Workflow permission is not approval or merge authority.

A canonical workflow-permission HTTP 403 quarantines that PR without retry,
preserves its exact tuple and bounded reason, and permits unrelated candidates
their existing bounded attempt. The aggregate run still fails. Unknown 403,
authentication, transport and ambiguous mutation failures stop fail-closed.

Activation requires explicit action-time Owner confirmation of the GitHub App
installation workflow permission expansion and exact-source STAGING broker
deployment. A Draft, local tests or merged diagnostic PR does not activate or
prove this correction. The installation must grant Workflows read/write; the
broker must request and verify it. Changing GITHUB_TOKEN Actions permissions
alone does not repair this GitHub App installation token scope.

After activation, consume a fresh natural generation's update-branch receipt,
verify exact ordered parents and current-main base, then fresh CI and the
normal authorization/finalizer chain. Never rerun a historical mutation or
reuse its approval. Production, Public, G5 and provider activation stay HOLD.

Rollback restores the previous exact broker source and removes only the
added App workflow scope after reconciliation. No IAM, repository selection,
secret-reader, ruleset, PAT or public exposure expansion is proposed.

The machine contract is
`coordination/kidults/kpmo/stale-convergence-permission-contract-v1.json`.
