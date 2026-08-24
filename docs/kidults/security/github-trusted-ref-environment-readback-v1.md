# GitHub trusted-ref and Environment read-back v1

## Governed state

`BLOCKED_EXTERNAL_CONTROL_PLANE_NOT_ESTABLISHED`

This control implements a read-only, fail-closed evidence path for #974. It does not create or modify a GitHub Environment, deployment branch policy, ruleset, repository or Environment secret, credential, Production/Public setting, or G5 authority. It also does not close #974, #936, or parent gate #881.

## Last verified external observation

The observation below is time-bounded to `2026-08-23T11:47:52Z`. It is historical external evidence, not a claim about this unmerged implementation branch. GitHub `main` had already advanced from the earlier requested `79366dcb7610b68862fc73c710838e1b6db5b814` to `d222db86e3d2db6427ea126ce56ce939277ff77b`; the latter was re-read from the live branch endpoint before recording this observation.

Read-only GitHub REST metadata showed:

- `main` reported `protected: true` at `d222db86e3d2db6427ea126ce56ce939277ff77b`;
- two active repository rulesets target `~DEFAULT_BRANCH`; this is context only and is not an effective-ruleset closure claim for #936;
- three Environments exist: `copilot`, `github-pages`, and `kidults-poc-preview`;
- only `github-pages` reported a deployment branch policy, with one exact `main` branch policy;
- the 15 registered secret-bearing `workflow_dispatch` lanes have 15 secret-bearing jobs, zero job-level Environment bindings, and two repository-side explicit `main` guards;
- therefore none of the three observed Environments is bound to any registered privileged manual job;
- unauthenticated Environment-secret metadata reads returned HTTP `401`, so secret scope was not established and no secret name or value was recorded;
- repository-side `main` guards and default-branch rulesets do not prevent a selected non-main ref from carrying altered workflow code. They remain containment, not the required external trusted-execution boundary.

The observation used only public control-plane metadata. It did not read secret values, dispatch a privileged workflow, activate a provider credential, contact a provider, deploy, or mutate GitHub settings.

## Implemented internal control

The repository-side implementation now statically binds all 15 registered secret-bearing jobs to eight named GitHub Environments and gives every such job an exact-`main` guard. The registry binds every workflow/job identity to its required Environment and to a digest of its required secret-name set. The machine validator rejects a missing, renamed, dynamic, duplicate, or extra binding; a changed secret-name digest; or a removed exact-`main` guard. These local bindings do not prove that the eight Environments exist, have exact-`main` deployment policies, disable administrator bypass, or contain Environment-only secrets on live GitHub.

The collector derives the current privileged-job set from `secret-bearing-workflow-dispatch-registry-v1.json`, parses each job's secret references and Environment binding, and performs GET-only GitHub metadata reads. Every list endpoint is paginated to exhaustion and reconciled to its reported count before it can contribute to a pass. The receipt records exact source SHA/ref, live default-branch SHA, endpoint statuses, registry-to-workflow binding results, deployment-policy results, Environment coverage, repository/organization scope-absence counts/digests, and negative-execution evidence without emitting secret names or values.

The validator rejects:

- a selected non-main source ref;
- a stale SHA represented as current `main`;
- unprotected or unreadable `main` metadata;
- a missing, dynamic, or unobserved job Environment;
- a workflow/job Environment name that differs from the registry binding;
- a required secret-name set whose digest differs from the registry binding;
- a secret-bearing job without a repository exact-`main` guard;
- wildcard, tag, multiple, or otherwise non-exact-`main` deployment policies;
- unreadable or incomplete Environment-secret name coverage;
- any required credential name that still exists at repository or organization scope;
- a truncated or count-mismatched Environment, policy, or secret-name listing;
- an Environment that permits administrator bypass;
- missing negative execution evidence for a selected non-main ref or branch-controlled workflow replacement;
- a stale or altered read-back digest;
- dynamic/whole secret context and `secrets: inherit` as externally unprovable sets;
- mutable Actions, moving runners, persisted checkout credentials, non-exact checkout, secret injection, or manual-only activation in the read-back workflow;
- any receipt that claims GitHub settings changed, secret material was read, #974 was auto-closed, #936 was closed, #881 control pass was promoted, empirical Evidence was promoted, or Production/Public/G5 authority changed.

The automatic workflow runs exact-head offline proof on pull requests, read-only proof after protected-main pushes, and a daily scheduled read-back. `workflow_dispatch` is recovery-only. Its live job uses the ephemeral least-privilege `${{ github.token }}` for the metadata it can read and reports `authorization_mode=GITHUB_TOKEN_METADATA_READ` plus `credential_activation=EPHEMERAL_GITHUB_TOKEN_METADATA_READ`. GitHub's workflow token cannot provide the Environment- and Actions-secret metadata permissions required for closure.

An authorization class cannot be selected by an environment variable. The current CLI therefore cannot claim `GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ`, even if an ordinary token is present. A future approved post-run attestor must obtain a separately authorized ephemeral GitHub App installation token, live-read the run/job and negative-control records, bind them to exact protected `main`, and produce cryptographically verifiable artifact provenance. Until that attestor and its verifier are implemented, `--require-external-proof` deliberately fails every receipt with `external_proof_validator_fail_closed_until_trusted_attestor`; `issue_974_closure_eligible` remains `false`.

## Reproduction

Offline internal proof, with no GitHub request:

```bash
node scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs
node --test tests/kidults/kpmo/github-trusted-ref-environment-readback-v1.test.mjs
node scripts/kidults/kpmo/inventory-secret-bearing-workflow-dispatch-v1.mjs --enforce-registry
```

Read-only execution on an exact source revision:

```bash
node scripts/kidults/kpmo/github-trusted-ref-environment-readback-v1.mjs \
  --source-ref refs/heads/main \
  --source-sha "$GITHUB_SHA" \
  --output /tmp/kidults-github-trusted-ref-environment-readback-receipt-v1.json
node scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs \
  --receipt /tmp/kidults-github-trusted-ref-environment-readback-receipt-v1.json
```

`GITHUB_TOKEN` may be present in the process environment for metadata authorization. The token value is never accepted as a CLI argument, written to the receipt, or printed. The receipt records only the authorization/activation class: ephemeral GitHub token metadata read, public metadata, or test fixture. A plain environment variable cannot promote that token to the future GitHub App authorization class.

## Remaining external blockers

1. Program Owner security approval for any Environment, secret-scope, deployment-policy, ruleset, or trusted-handoff change.
2. Land the 15 repository-side static Environment bindings and exact-`main` guards on protected `main`, then verify that live GitHub executes that exact source. The bindings are implemented locally but are not merged or externally proven.
3. Exact-`main` external deployment branch policy for each bound Environment.
4. Administrator bypass disabled for every bound Environment.
5. Authorized Environment-secret metadata read-back proving every referenced secret name resolves in the bound Environment, without reading values.
6. Authorized repository/organization secret-name read-back proving those required names are absent outside the bound Environments.
7. Exact protected-main execution receipt plus live-revalidated negative stale/non-main ref and branch-controlled replacement execution proof.
8. Trusted post-run attestation with cryptographically verifiable artifact provenance bound to the exact repository, workflow, run, ref, and SHA.
9. A separate authorized closure decision. A green internal validator or read-back receipt cannot close #974 by itself.

## #881 semantic boundary

This work changes only assurance observability. Partner ingestion remains `HOLD`; empirical Evidence and market claims remain unpromoted; Production/Public remain `HOLD`; G5 remains `EXPLICIT_APPROVAL_REQUIRED`. No #881 control-pass state is advanced by this implementation or by a synthetic positive test fixture.

## Rollback

Revert the repository implementation commits together. The read-back workflow is read-only and creates no external setting to undo. If the eight Environments or their secret scopes are later configured through a separately approved external change, that external change requires its own rollback plan; it is not undone by a Git revert.
