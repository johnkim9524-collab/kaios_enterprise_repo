# KIDULTS ASI Self-Driving Control Loop v1

## Purpose

ASI continuously re-evaluates the Global Data Acquisition Master Matrix and performs only explicitly authorized reversible SHADOW work without waiting for a human to re-run planning steps.

## Loop

`OBSERVE → PRIORITIZE → GATE → PLAN → EXECUTE_SAFE → VERIFY → RE-EVALUATE`

The loop runs hourly and on relevant main-branch control-plane changes.

## What ASI can do by itself

- deterministically rebuild the 4,352-row acquisition matrix;
- validate structural truth boundaries;
- rank coverage debt and produce a deduplicated Category × Region × Evidence action queue;
- build purpose-specific rights-review packets from unassessed rows;
- re-run explicitly allowlisted SHADOW evidence refreshes where rights/admission already exist;
- rebuild fail-closed regional baseline artifacts;
- verify no-overclaim and release boundaries;
- emit an immutable-per-run SHADOW artifact bundle and next-blocker summary.

## What ASI cannot do by itself

ASI never automatically:

- accepts Terms/EULA/contract;
- creates an external account;
- purchases or subscribes;
- contacts providers;
- infers broader rights from narrower rights;
- scrapes a restricted source;
- publishes provider payloads;
- assigns real human reviewers or fabricates labels;
- deploys Production;
- approves G5.

These states are emitted as gates rather than silently skipped.

## Autonomous execution registry

Every executable command must be in `asi-autonomous-safe-action-registry-v1.json`, have rights `ALLOW`, an explicit internal or bounded-SHADOW admission, be reversible, and remain Production/Public HOLD.

The initial live safe source action is the already-admitted bounded MusicBrainz core regional-catalog observation refresh. This does not create sold, price, demand, liquidity, market-scale or market-weight evidence.

## Priority semantics

Priority is acquisition workload priority, not market weight. Raw record count has zero priority/market-share authority. Coverage debt, rights readiness, admission readiness and runtime readiness may adjust action priority; verified evidence is de-prioritized.

## Persistence model

Scheduled cycles do not write to the repository and do not mutate Production. Each cycle uploads a private/non-public GitHub Actions artifact bundle containing:

- current acquisition matrix;
- autonomous action queue;
- rights-review queue;
- refreshed bounded regional observation;
- fail-closed regional baseline;
- cycle summary.

Repository writes remain reviewed through normal branch/PR protection.

## Operating truth

Autonomy is not permission. The control loop accelerates every reversible step it can lawfully perform and exposes the exact next gate when it cannot proceed.
