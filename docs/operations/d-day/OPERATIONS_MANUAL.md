# KIDULTS D-Day Operations Manual

Production, Public, G5 and all provider activation remain `HOLD`. Operators run only control simulations until an exact provider qualification authorizes a bounded adapter.

## Detection
Run `npm run observe:provider-operations` and reject snapshots older than 60 seconds. Run `npm run simulate:provider-operations` for the complete provider control receipt.

## Isolation
Disable the affected adapter ingress, preserve receipts, and prevent Candidate, Current SOLD, Confidence, Projection and Portal advancement.

## Recovery
Restore the last verified immutable input, replay once with the same identity, and keep conflicting replay quarantined.

## Verification
Require exact SHA, rights, evidence, canonical, Current SOLD, Track B and portal receipt bindings plus all negative tests.

## Communication
Record incident class, affected provider and fields, first detection, current HOLDs, receipt references and owner in the internal incident channel. Never contact a provider without authority.
