# PostgreSQL external one-shot authorization v1

## Outcome

The two remote PostgreSQL/PITR workflows no longer treat a repository variable set to `true` as reusable execution authority. The legacy variable must be explicitly set to `false`; an unset or `true` value blocks the privileged lane.

The implementation baseline supplied by the authorized control-plane read-back reports repository variable `KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED=false` and no same-named Environment-variable shadow in `kidults-do-staging-ssh`. This repository change does not mutate or independently re-attest that remote state; exact post-landing read-back remains mandatory before a grant or provider run.

The repository control is `IMPLEMENTED_NOT_ACTIVATED`. The external durable ledger, response-signing key pin, signed exact-state read-back and post-landing GitHub configuration read-back are not evidenced by this change, so neither PostgreSQL lane may be dispatched yet.

Each credential-bearing run requires one external ledger grant bound to the exact approval, operation, repository, workflow ref, live-main control SHA, source SHA, GitHub run ID, first run attempt, fresh request UUID, wall-clock windows, provider target and target digest. For restore verification, the target resource ID also commits a canonical digest of the source run ID, source artifact ID and API digest, source receipt digest, and SHA-256 of the operator restore reference. The raw restore reference remains `BOUND_NOT_VERIFIED`; binding it is not provider proof. The dispatch supplies the expected ledger-stored approval expiry, but that value grants nothing and cannot extend authority: the durable ledger must compare it with the immutable ACTIVE record and return `422` on mismatch, and its exact signed `201` response must mirror the value. The ledger must atomically transition that grant from `ACTIVE` to `CONSUMED`. Only the single HTTP `201` winner can open the downstream provider job. Unknown, consumed, replayed, expired, mismatched, unsigned, late, redirected, unavailable or ambiguous outcomes fail before SSH/PostgreSQL credential use or provider connection.

## Workflow sequence

1. A credential-free readiness job re-reads live protected `main`, requires the legacy variable to equal the literal string `false`, and validates the operation inputs. The source-fixture lane creates its fresh UUID and ten-minute window there.
2. Restore verification first binds the exact source run, artifact and source receipt without PostgreSQL or SSH credentials. Only after that binding succeeds does it create the fresh UUID and ten-minute window, derive the digest-bound restore target, and emit the exact external-ledger grant template. This prevents the source-binding job from consuming the request window.
3. Both secret-bearing jobs load the expected Ed25519 SPKI digest from the exact-SHA repository contract and reject an unprovisioned or malformed pin. A ledger-only job in `kidults-approval-ledger-consume` then calls `POST /v1/approvals/consume` and verifies the signed receipt against both the public key and repository-machine pin.
4. The PostgreSQL provider job starts only through `needs` after the consume job reports one verified `CONSUMED` receipt. It re-reads live `main`, checks out the exact SHA, performs a bounded 12×5-second read-back for exactly one same-run authorization artifact, verifies the artifact API digest, exact two-file shape, Ed25519 signature and key pin, and rechecks the authenticated operation, SHA, workflow, run, attempt, nonce, expiry and target. Restore verification independently recomputes the source/reference-bound target. Consume and provider start both require at least 30 minutes of signed approval life for the 25-minute provider-job budget, and each secret-using or provider-calling step verifies signature and current expiry again before first use or call.
5. GitHub resolves the SSH or PostgreSQL secret only in later, step-scoped provider steps.

Push remains a credential-free readiness path. It cannot consume a grant or activate the provider lane. Actual one-shot execution is `workflow_dispatch` only and run attempt 1 only; a workflow rerun is rejected even when the original approval existed.

## External configuration required before any run

The following control-plane changes are intentionally not performed by repository code:

- Set repository variable `KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED` to the literal string `false` and keep it false.
- Create Environment `kidults-approval-ledger-consume`, restrict it to protected `main`, disable administrator bypass, and require an independent approval before each deployment job proceeds.
- In that Environment, set variable `KIDULTS_APPROVAL_LEDGER_BASE_URL` to the approved HTTPS ledger origin only; query strings, fragments, redirects and non-HTTPS endpoints are forbidden by the client.
- In that Environment only, set secret `KIDULTS_APPROVAL_LEDGER_REQUEST_HMAC_KEY_B64`. The request key authenticates the exact canonical raw consume body, which includes `requested_at`. Set public variable `KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_B64` to the external ledger signer’s SPKI DER base64 public key, and expose the same public value to `kidults-do-staging-ssh` for downstream receipt re-verification.
- Replace `external_ledger.response_verification.public_key_spki_sha256=UNPROVISIONED` in the PostgreSQL machine contract with the independently computed `sha256:<64 lowercase hex>` digest of that exact SPKI DER key and land it through the governed exact-main path. Workflows export this checked-in value as `KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_SHA256`; do not create a mutable GitHub variable with that name. A public-key value and repository pin mismatch fails before consume or provider contact.
- The paired PKCS8 private key `KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64` must exist only in the external ledger runtime and must never be configured in GitHub. Do not configure a standing authorization nonce and do not copy PostgreSQL, SSH, Cloudflare or provider credentials into the ledger-consume Environment.
- Configure the external ledger to implement the registered `external-one-shot-approval-ledger-v1` contract and retain immutable ACTIVE, CONSUMED, rejection and transaction audit records.
- Before approving the Environment job, use the exact grant template in the readiness receipt (source fixture) or post-bind source-fixture receipt (restore verification) to create exactly one ACTIVE grant for the visible GitHub run ID, fresh UUID, timestamps and all immutable request bindings. Complete registration and approval before the ten-minute `request_expires_at`; at least 30 minutes must remain before the signed approval expiry. The dispatch expiry is only the expected immutable value used for comparison; the ledger record, server time, atomic CAS, signed mirrored expiry and signed `consumed_at + 1800 seconds < approval_expires_at` relationship are authoritative. A caller-supplied later expiry cannot update the ledger record and must receive `422`.
- Obtain an Ed25519-signed exact-state read-back from the deployed ledger and independently re-read the post-landing GitHub variable/Environment configuration before enabling either workflow. Until those receipts exist, keep both lanes `IMPLEMENTED_NOT_ACTIVATED` and do not dispatch them.
- Preserve `kidults-do-staging-ssh` as the separate provider-credential Environment. Do not place the ledger token or authorization nonce there.

These changes authorize neither an external restore nor a PostgreSQL connection by themselves. A concrete grant is operation-specific, and Public, Production and G5 remain `HOLD`.

## Rollback

Revert the repository implementation as one unit. Keep the legacy variable `false`. Disable the ledger-consume Environment and revoke its token/HMAC key if the ledger boundary is unhealthy. A Git revert cannot unconsume an external grant, erase its audit record, undo a database mutation or prove PITR; those states require their own authoritative receipts and rollback decision.
