# GitHub trusted-ref and Environment read-back v1

## Governed state

`BLOCKED_EXTERNAL_CONTROL_PLANE_NOT_ESTABLISHED`

This control implements a read-only, fail-closed evidence path for #974. It does not create or modify a GitHub Environment, deployment branch policy, ruleset, repository or Environment secret, credential, Production/Public setting, or G5 authority. It also does not close #974, #936, or parent gate #881.

## Last verified external observation

The observation below is time-bounded to `2026-08-23T11:47:52Z`. GitHub `main` had already advanced from the earlier requested `79366dcb7610b68862fc73c710838e1b6db5b814` to `d222db86e3d2db6427ea126ce56ce939277ff77b`; the latter was re-read from the live branch endpoint before recording this observation.

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

The collector derives the current privileged-job set from `secret-bearing-workflow-dispatch-registry-v1.json`, parses each job's secret references and Environment binding, and performs GET-only GitHub metadata reads. Its receipt records exact source SHA/ref, live default-branch SHA, endpoint statuses, per-job binding results, deployment-policy results, and secret-name coverage counts/digests without emitting secret names or values.

The validator rejects:

- a selected non-main source ref;
- a stale SHA represented as current `main`;
- unprotected or unreadable `main` metadata;
- a missing, dynamic, or unobserved job Environment;
- wildcard, tag, multiple, or otherwise non-exact-`main` deployment policies;
- unreadable or incomplete Environment-secret name coverage;
- dynamic/whole secret context and `secrets: inherit` as externally unprovable sets;
- mutable Actions, moving runners, persisted checkout credentials, non-exact checkout, secret injection, or manual-only activation in the read-back workflow;
- any receipt that claims GitHub settings changed, secret material was read, #974 was auto-closed, #936 was closed, #881 control pass was promoted, empirical Evidence was promoted, or Production/Public/G5 authority changed.

The automatic workflow runs exact-head offline proof on pull requests, read-only proof after protected-main pushes, and a daily scheduled read-back. `workflow_dispatch` is recovery-only. It uses only the ephemeral least-privilege `github.token`; it references no repository or Environment secret.

## Reproduction

Offline internal proof, with no GitHub request:

```bash
node scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs
node --test tests/kidults/kpmo/github-trusted-ref-environment-readback-v1.test.mjs
node scripts/kidults/kpmo/inventory-secret-bearing-workflow-dispatch-v1.mjs --enforce-registry
```

Authorized read-only execution on exact protected `main`:

```bash
node scripts/kidults/kpmo/github-trusted-ref-environment-readback-v1.mjs \
  --source-ref refs/heads/main \
  --source-sha "$GITHUB_SHA" \
  --output /tmp/kidults-github-trusted-ref-environment-readback-receipt-v1.json
node scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs \
  --receipt /tmp/kidults-github-trusted-ref-environment-readback-receipt-v1.json
```

`GITHUB_TOKEN` may be present in the environment for metadata authorization. It is never accepted as a CLI argument, written to the receipt, or printed.

## Remaining external blockers

1. Program Owner security approval for any Environment, secret-scope, deployment-policy, ruleset, or trusted-handoff change.
2. Static Environment binding for every secret-bearing job, or a separately authorized trusted-default-branch/release handoff.
3. Exact-`main` external deployment branch policy for each bound Environment.
4. Authorized Environment-secret metadata read-back proving every referenced secret name resolves in the bound Environment, without reading values.
5. Exact protected-main execution receipt plus negative stale/non-main ref and branch-controlled replacement execution proof.
6. A separate authorized closure decision. A green internal validator or read-back receipt cannot close #974 by itself.

## #881 semantic boundary

This work changes only assurance observability. Partner ingestion remains `HOLD`; empirical Evidence and market claims remain unpromoted; Production/Public remain `HOLD`; G5 remains `EXPLICIT_APPROVAL_REQUIRED`. No #881 control-pass state is advanced by this implementation or by a synthetic positive test fixture.

## Rollback

Revert the single implementation commit or remove the contract, collector, validator, test, documentation, workflow, and registry pointer together. The workflow is read-only and creates no external setting to undo; retained workflow artifacts can expire under the 30-day retention policy.
