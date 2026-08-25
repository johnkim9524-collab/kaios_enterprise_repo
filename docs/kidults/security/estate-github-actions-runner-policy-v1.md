# Estate GitHub Actions runner policy v1

## Enforced repository state

Every active Linux job in `.github/workflows` uses `runs-on: ubuntu-24.04`. The estate validator rejects the moving `ubuntu-latest` alias, including quoted scalar and inline-array forms, and exercises negative mutations before it scans the repository.

This is an internal reproducibility improvement. It fixes the requested operating-system release label and prevents a future automatic jump from Ubuntu 24.04 to another release through `ubuntu-latest`.

Every external repository Action reference must also exactly match `coordination/kidults/kpmo/estate-action-allowlist-v1.json`. The allowlist binds repository identity, full 40-character commit SHA, reviewed release label, and canonical source repository URL. The observed unique reference set and allowlist must be identical: an unapproved full SHA, a stale unused entry, an identity/source mismatch, or a duplicate entry fails closed. A syntactically immutable SHA by itself is not treated as an approved dependency.

## External hosted-image residual

`ubuntu-24.04` is not an immutable hosted-image build identifier. GitHub controls the image build behind that label and can update it in place. GitHub Actions `runs-on` does not provide a SHA- or digest-pinning mechanism for the GitHub-hosted image build. Therefore Action-SHA pinning plus `ubuntu-24.04` removes repository-controlled moving aliases but does not establish immutable trusted execution.

Execution receipts for critical hosted jobs must record `ImageOS`, `ImageVersion`, `RUNNER_OS`, `RUNNER_ARCH`, the exact repository source SHA, and the workflow run identity. That receipt is observation of the selected build, not a pre-execution pin. A separately governed self-hosted or image-attested execution boundary would be required to close image-build immutability.

## Truth boundary

A passing estate validator proves only that repository Action references are immutable, match the exact reviewed allowlist, and the moving `ubuntu-latest` alias is absent from active `runs-on` declarations. The allowlist is not a substitute for source review, upstream compromise monitoring, artifact attestation, or the external GitHub Environment/trusted-execution control plane. It does not prove remote STAGING health or rollback, empirical Evidence, or release readiness. Production and Public remain `HOLD`; G5 remains `EXPLICIT_APPROVAL_REQUIRED`.

## Reproduction

```bash
node scripts/kidults/kpmo/validate-estate-action-pinning-v1.mjs
node scripts/kidults/kpmo/validate-full-value-chain-critical-gate-bindings-v1.mjs
node scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs
```
