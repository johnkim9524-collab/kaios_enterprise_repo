# KIDULTS ASI Engine Refactoring v2

**Authority:** KPMO  
**Status:** Mandatory / Fail-closed  
**Principle order:** Autonomous → Global → Irreplaceable Value → Transparent

## 1. Purpose

ASI Engine Refactoring v2 converts the four platform principles from policy language into an executable control surface.

The objective is not to attach four labels to an engine. The objective is to ensure that every declared logical engine has one governed alignment profile and that every currently implemented ASI execution fleet must pass the four hard floors before processing a queue task.

## 2. Truthful scope of 100% alignment

The current platform taxonomy contains:

- 52 logical engines across nine platform layers;
- 11 ASI logical engines;
- 25 independently registered ASI execution fleets;
- 25 deterministic SHADOW processor implementations.

`100% aligned` in this increment means:

1. 52 of 52 logical engines are enumerated once, bound to one funnel stage, and assigned the common four-principle profile;
2. 25 of 25 current ASI execution fleets map to exactly one ASI logical engine;
3. 25 of 25 current execution fleets are protected by a runtime hard-floor preflight at the Queue worker boundary;
4. every accepted queue message receives an immutable preflight audit receipt;
5. every completed aligned batch receives a completion audit receipt;
6. missing profiles, failed axes, provider bypasses, opaque lineage, and permission promotion fail closed.

This does **not** mean that all 52 logical engines have separately deployed runtime services. Full 52-engine runtime implementation remains unverified, durable remote runtime remains undeployed, and Production remains HOLD.

## 3. Four non-compensating hard floors

### Autonomous

An execution must be registered, bound to a logical engine, routed through canonical stage transitions, bounded from Production/Public side effects, and capable of governed retry/replay or deterministic recompute.

### Global

An execution must preserve explicit channel, region, language, scope, source-role, and canonical-host partition dimensions. Provider count is never accepted as proof of global coverage.

### Irreplaceable Value

An execution must bind to a KIDULTS-owned logical engine and source identity. A provider cannot directly write canonical truth, an index, or a projection. External raw data is not treated as KIDULTS-owned moat.

### Transparent

An execution must preserve a versioned event, input snapshot, SHA-256 payload hash, explicit rights state, explicit freshness state, decision state, reason codes, and trace references.

A high result on one axis cannot compensate for failure on another axis.

## 4. Runtime sequence

```text
Queue message
    ↓
Validate registered fleet
    ↓
Resolve one KIDULTS logical engine
    ↓
Autonomous hard floor
    ↓
Global hard floor
    ↓
Irreplaceable Value hard floor
    ↓
Transparent hard floor
    ↓
Preflight audit receipt
    ↓
Existing ASI processor/runtime execution
    ↓
Batch alignment completion receipt
```

Any failed axis rejects the affected task before processor transformation.

## 5. Authoritative files

- Contract: `coordination/kidults/source-intelligence/asi-engine-refactoring-contract-v2.json`
- Registry: `coordination/kidults/source-intelligence/asi-engine-principle-alignment-registry-v2.json`
- Platform taxonomy: `coordination/kidults/architecture/platform-market-funnel-alignment-v1.json`
- Fleet registry: `services/kidults-autonomous-intelligence/src/asi/registry.ts`
- Runtime hard floor: `services/kidults-autonomous-intelligence/src/asi/alignment.ts`
- Queue entrypoint: `services/kidults-autonomous-intelligence/src/worker.ts`
- Runtime test: `services/kidults-autonomous-intelligence/scripts/asi-engine-alignment-test.mjs`
- Validator: `scripts/kidults/source-intelligence/validate-asi-engine-principle-alignment-v2.mjs`
- Workflow: `.github/workflows/kidults-asi-engine-refactoring-alignment-v2.yml`

## 6. Required receipts

Each preflight receipt binds:

- policy version and digest;
- fleet and logical engine;
- stage;
- input event and snapshot;
- exact principle order;
- each principle result and check set;
- failure codes;
- evidence references;
- permission boundaries;
- Production HOLD.

The receipt is deterministic for the same immutable input and policy.

## 7. Prohibited paths

- execution without a registered alignment profile;
- execution with a failed or unknown principle axis;
- composite-score compensation;
- explicit payload-driven target-fleet routing;
- provider-direct canonical truth, index, or projection;
- discovery-created collection, admission, or claim permission;
- opaque output without snapshot, hash, rights, freshness, reason, and trace lineage;
- Public or Production promotion.

## 8. Validation and mutations

The controlled workflow validates the exact 52-engine taxonomy and 25-fleet map, typechecks the runtime, runs the 25-fleet alignment test, preserves the existing processor E2E and recovery suites, and rejects mutations that:

- remove a logical-engine profile;
- remove an execution-fleet profile;
- reorder the four principles;
- remove the runtime preflight;
- request provider-direct projection;
- omit global partition evidence;
- corrupt the payload hash;
- request Production authorization.

## 9. Release boundary

```text
Repository logical-engine profile alignment: 100%
Current SHADOW execution-fleet runtime enforcement: 100%
Full 52-engine runtime implementation: NOT VERIFIED
Durable remote runtime deployment: NOT PERFORMED
Public release: HOLD
Production: HOLD
G5: explicit approval required
```
