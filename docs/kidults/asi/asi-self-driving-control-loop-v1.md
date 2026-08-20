# KIDULTS ASI Self-Driving Control Loop v1

## Purpose
ASI continuously re-evaluates acquisition coverage debt and performs only explicitly authorized reversible SHADOW work without waiting for manual replanning.

## Loop
`OBSERVE → PRIORITIZE → GATE → PLAN → EXECUTE_SAFE → VERIFY → RE_EVALUATE`

Runs hourly and on relevant main control-plane changes.

## Automatic scope
- rebuild/validate the 4,352-row acquisition matrix;
- rank 2,048 deduplicated Category × Region × Evidence demands;
- emit top-priority work and rights-review packets;
- refresh explicitly allowlisted rights-cleared SHADOW observations;
- rebuild fail-closed regional baseline evidence;
- verify no-overclaim, Public HOLD and Production HOLD;
- emit a per-cycle artifact bundle and next-blocker summary.

## Automatic prohibitions
ASI never automatically accepts Terms/EULA, creates external accounts, purchases/subscribes, contacts providers, infers broader rights, scrapes restricted sources, publishes provider payloads, fabricates reviewers/labels/evidence, deploys Production, or approves G5.

## Safe-action registry
Every executable action must appear in `asi-autonomous-safe-action-registry-v1.json`, have rights ALLOW, explicit internal or bounded-SHADOW admission, reversibility, and Production/Public HOLD.

The initial live safe source action is the existing bounded MusicBrainz core regional-catalog observation refresh. It cannot become sold, price, demand, liquidity, market-scale or market-weight evidence.

## Persistence
Scheduled cycles use `contents: read` only. They do not write to the repository. Each run uploads non-public SHADOW artifacts; repository changes still require normal branch/PR protection.

## Operating truth
Autonomy is not permission. ASI accelerates every reversible step it can lawfully perform and emits the exact gate when it cannot proceed.
