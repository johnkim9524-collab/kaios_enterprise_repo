# P0 current-run failure receipt retention

## Detected

PR #2042 first candidate `636878f1a2ee2883ef64a073d276adaba863c18b`
failed P0 run `34010460178`, job `101425257276`, on the workflow fanout
budget. The suite wrote a VERIFIED_FAIL receipt, but the success-only
artifact upload step was skipped. The log is historical failure evidence,
not a durable artifact or a PASS.

The parallel correction `1df2b9ab475583a2275b55277afcd30aea2adc21`
already integrated semantic observation into the terminal Assurance consumer
without changing the fanout budget. This follow-up preserves that correction,
its observation classifier, all existing workflow triggers and the four
Cloudflare no-replay changes. No competing reusable-workflow design is applied.

## Correction

The existing P0 workflow initializes a current-run diagnostic RED receipt
before checkout, using a path inside the runner temporary directory. It binds
source SHA, repository, run and attempt without granting authority. A stale
PASS at that path is overwritten by initialization. Initialization is not a
completed suite result.

After exact-source checkout and the new receipt regression, the original
P0 suite still executes unchanged. It replaces initialization with its actual
result and exits nonzero on failure. Artifact upload now has `if: always()`
for successful, failed and interrupted task paths where the job reaches the
upload step. Missing files remain an error; old artifacts are not rewritten.
An infrastructure failure or cancellation before the first step cannot be
claimed to have a receipt. No workflow run is made green by upload success.

## Regression and evidence boundary

Five cases cover workflow ordering/always-upload, the actual Python
initializer replacing stale PASS, the actual P0 runner under closed child
transport for both PASS and FAIL, and change-trigger/test integration.
The child-transport cases do not claim that the underlying eighteen checks
ran. Those checks require a separate real P0 suite execution.

Only the P0 workflow, this document and the five-case test file are changed.
No new workflow, listener, permission, caller dispatch, provider call,
managed database migration, protected-main merge or release is authorized.
Production/Public/G5 stay HOLD. A fresh exact-head hosted P0 run and artifact
readback are required before reporting this increment as remotely verified.

```sh
node --test tests/kidults/kpmo/p0-failure-receipt-retention-v1.test.mjs
node scripts/kidults/kpmo/run-p0-control-plane-closure-suite-v1.mjs
```
