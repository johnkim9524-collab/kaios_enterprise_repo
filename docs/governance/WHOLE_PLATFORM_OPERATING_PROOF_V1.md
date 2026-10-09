# Whole platform operating proof

The core-four Sentinel is a read-only semantic producer checker. Its success is
one input to whole-platform proof; it is never the whole certificate. The
Continuous Assurance packet includes `whole-platform-operating-proof-v1.json`.
The collector reads protected GitHub run metadata and digest-verified artifacts,
rechecks native producers and main, and retains every missing or invalid check.
It does not dispatch, approve, merge, deploy, mint credentials, or admit data.

The complete operating surface includes core-four content, two distinct complete
natural producer tuples, exact protected landing, AWS configuration and Object
Lock, native dispatch, durable same-operation reuse, consumed finalizer
reservation and immutable mission terminal, and all fourteen value-chain domains.
Two Sentinel observations of the same producers are one producer generation.
An Object Lock canary proves configuration and storage behavior; it cannot
substitute for a mission terminal. Fixture and static scorecard results cannot
supply empirical runtime evidence.

The value-chain scorecard currently has no authenticated full-runtime receipt
set. Source-specific lawful admission, empirical entity review and market
observations, the immutable Candidate/Evidence pair, Track B assessment, approved
Projection/workload replay, and reserved human acceptance must be supplied by
their governed producers before those domains can be runtime-verified. The
collector records this as incomplete, preserves the complete domain inventory,
and grants no automatic retry or permission to waive the holds. Code or workflow
success does not create these external facts.

Finalizer immutable identity uses the original signed quorum binding's
`authorization_generation` and exact merge SHA. Conditional S3 creation prevents
a second version. Existing success is read and consumed without another write;
lost write replies reconcile the same object's version, checksum, retention,
encryption and exact body. A failed HEAD never asserts absence. Drift or an
unknown outcome fails closed without an automatic replacement operation.
Terminal evidence is retained before completion-event delivery. An event-only
failure after verified terminal does not justify another merge or rollback.
All three finalizer workflows retain their receipts even on failure.

Production, Public, G5 and Provider activation remain HOLD. Whole runtime proof
is an evidence statement, not release authority.

## Runtime domain processing and authenticated output consumption

This implementation closes a code gap in `AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION`. The existing exact-pair input runner now executes six bounded local stages and reconciles outputs of registered native domain producers. It does **not** implement or provision all thirteen native workload producers. No additional producer is registered by this change. Local processing, semantic validation and native artifact authentication are separate evidence scopes.

The input must first pass `connectAuthenticatedBusinessInput`: registered producer, successful first-attempt protected-main run, exact archive digest and three file digests, purpose-rights classification and atomic admission. The local stages consume a frozen copy of that same digest-bound stage. Missing input produces an explicit thirteen-domain incomplete observation without executing local stages.

| Domain | Implemented local processing / result consumption | Still required for native operating proof |
| --- | --- | --- |
| VALUE_TRACEABILITY | Input event/Evidence joins and lineage digest; native output consumer | Registered native source-to-decision lineage producer |
| SOURCE_RIGHTS | Purpose classification digest and source coverage; admission output consumer | Independent legal purpose, retention and deletion admission |
| ENTITY_RESOLUTION | Canonical ID groups and conflicting observation detection; decision output consumer | Independent canonical entity adjudication producer |
| MARKET_EVIDENCE | Admitted SOLD semantics and evidence digest; fresh SOLD/liquidity output consumer | Lawful current transactions and independently sourced liquidity execution |
| ASI_EXECUTION | Complete admitted input bundle digest; processor output consumer | Actual complete native processor execution |
| IMMUTABLE_CANDIDATE | Version, compliance lock, digest and readback output consumer | Authorized native pair write, reservation and immutable readback |
| TRACK_B_VALIDATION | Exact pair and assessment output consumer | Native official Track B execution on that pair |
| PROJECTION_TRUTH | Pair, assessment, rights and freshness output consumer | Native approved projection creation |
| PORTAL_TRANSPARENCY_ACCESSIBILITY | Projection, browser, flows and accessibility output consumer | Actual rendered projection and Compare/Watchlist execution |
| EOS_FOUNDER_WORKFLOW | Projection, actual acceptance and persisted decision output consumer | Actual founder decision and readback; never simulated acceptance |
| RUNTIME_RELIABILITY | Pair, business replay, recovery, PITR and DB readback output consumer | Authorized staging business execution and fault recovery |
| PRIVACY_RETENTION | Data surface digest; deletion/classification output consumer | Actual classified retention expiry, deletion and absence readback |
| INTEGRATION_GATE | Exact fourteen-domain receipt set consumption | All thirteen other authenticated domain receipts and native integration execution |

### Native output interface

A registered producer supplies `native_domain_output_references[DOMAIN_ID]` in the existing private input manifest, with positive integer `run_id` and `artifact_id`. Registration is read exclusively from the committed `whole-platform-operating-proof-v1.json`; caller manifest metadata cannot register workflows. The current registry contains only SECURITY_SUPPLY_CHAIN. Registration and credential/activation authority are not granted by this interface.

Non-security artifacts must contain exactly `runtime-domain-receipt.json` and `domain-output.json`, without nested paths or extra members. The receipt must satisfy the existing value-chain runtime receipt verifier, bind the registered workflow and native run, and reference the raw output digest at the exact native run/artifact source. The output uses `kidults-runtime-domain-output-v1`, the exact domain and source SHA, the authenticated stage's `input_digest`, all four HOLD boundaries, `fixture_evidence: false`, and a canonical `output_digest` over the body without that digest. `dependency_receipt_digests` must match the exact required native upstream receipt digests. Reliability additionally requires the immutable business pair. Domain-specific fields are validated by `runtime-domain-output-consumers-v1.mjs`; hashes alone do not prove the claimed underlying operation.

Archive download is data-only. No downloaded code is executed. The reader validates repository, main SHA, workflow path, event, first attempt, completion, freshness (at most two hours), exact artifact identity, archive checksum and semantic content. It reads back run, artifact and main identity after download. Manual dispatch, reruns, stale artifacts, duplicate matches, wrong dependency receipts and drift fail closed. SECURITY_SUPPLY_CHAIN retains its existing archive format, with every primary member checked against its raw digest.

The semantic consumer alone returns `OUTPUT_CONTENT_VERIFIED_NOT_NATIVE_DOMAIN_CERTIFICATE`. Authentication imports an already-existing producer receipt; it never issues a replacement certificate or grants dispatch. Public observations strip private output/receipt bodies and retain counts and digests. A successful read does not establish whole-platform completion or release eligibility.

### Bounds and operational limits

Input batches and rights sources are bounded to 100, the graph to fourteen domains, and each artifact to the existing bounded archive reader limits. Graph cycles and unknown domain IDs fail closed. Reading runs serially provides backpressure; no external writes, commands, retries, provider acquisition or infrastructure provisioning occur. Existing automatic workflow activation is reused; workflow permissions and triggers are unchanged. Source-neutral interfaces permit separate provider partitions but this change contains no measured throughput, cost or SLO claim. Rollback is a revert; domain failures prevent downstream joins and retain HOLD diagnostics rather than fabricated success.

### Verification and completion boundary

Regression and negative tests exercise real input-stage compatibility, each of thirteen semantic consumers, native transport mutation, checksum drift, main/run/artifact readback, dependency receipt joins and fixture/non-native evidence separation. All native-transport tests use explicitly synthetic test transports. Their success is not a live workload receipt.

Completion remains blocked on lawful current transaction/liquidity input and authorized registered native producers. After those actual outputs arrive, whole-platform completion still requires the governed independent verification, normal autonomous quorum/finalizer/merge evidence, and two distinct natural generations on the same final main. Production/Public/G5/provider activation remain HOLD. No manual approval, dispatch, protection bypass, historical approval reuse, provider message or DigitalOcean email edit is performed by this implementation.

### Durable proposal and scoped implementation checkpoint

The one Draft PR #2621 creation intent remains immutable in authenticated ancestor commit `6b551b7bd81125bce7be8c6dcea27483c53f4673`, at `coordination/kidults/integration/runtime-domain-workload-draft-proposal-intent-20261009-v1.json`. Its historical canonical create payload and single successful registration are preserved; it does not authorize another create or rebind any approval. Current-head documentation is consolidated in this existing audit-indexed document. No audit path, classifier, authority policy or routing rule is expanded.

The following checkpoint records the implementation stage as observed at its original source commit, and is not a later-head runtime proof:

```json
{
  "id": "kidults-runtime-domain-implementation-checkpoint-v1",
  "agent_id": "atlas-thirteen-workloads-20261009",
  "as_of": "2026-10-09T00:54:17.597969+00:00",
  "scope": "AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION / thirteen runtime domains",
  "state": "IMPLEMENTED_NOT_VERIFIED",
  "commit_sha_or_branch_ref": "6301233aa9c457ed8e369e11fdcba9d629075a7e",
  "facts": {
    "local_stage_implementations": 6,
    "native_output_semantic_consumers": 13,
    "native_output_authenticator_implemented": true,
    "local_tests_passed": 148,
    "actual_thirteen_native_connections_proven": 0,
    "native_producer_registration_changed": false
  },
  "evidence_refs": [
    "tests/kidults/kpmo/business-input-stage-v1.test.mjs",
    "docs/integration/RUNTIME_DOMAIN_CONNECTION_EXECUTION_V1.md"
  ],
  "inferences": [
    "Local validation is ready for independent exact-head CI; it is not native operating evidence."
  ],
  "uncertainties": [
    "Future actual native producer execution and lawful current input remain unverified."
  ],
  "blockers": [
    "Lawful current transaction/liquidity input and registered native producers missing.",
    "Seven native workload producer adapters are not implemented or provisioned by this change."
  ],
  "actions_executed": [
    "Implemented six bounded local stages, thirteen semantic consumers and registered native artifact reconciliation.",
    "Ran 148 local tests and both capability classifiers."
  ],
  "next_action": "Submit one intent-bound Draft through the existing normal autonomous validation/landing path, then verify exact final main and natural generations.",
  "authority_boundary": {
    "production": "HOLD",
    "public": "HOLD",
    "g5": "HOLD",
    "provider_activation": "HOLD",
    "manual_approval_or_dispatch": false,
    "remote_write_or_provider_acquisition": false,
    "digitalocean_email_84216_modified": false
  },
  "defect_disposition": "Replaced observation-only code gap with bounded computation and authenticated output consumption; actual producer gap remains.",
  "remediation_sequence": [
    "Implement bounded processors",
    "Implement typed consumers",
    "Bind native run/artifact, input and dependency receipts",
    "Negative/regression tests",
    "Normal independent CI and landing",
    "Actual producer/input integration",
    "Two natural generations on final main"
  ],
  "verification_evidence_refs": [
    "tests/kidults/kpmo/authenticated-runtime-domain-outputs-v1.test.mjs",
    "tests/kidults/kpmo/runtime-domain-output-consumers-v1.test.mjs",
    "tests/kidults/kpmo/runtime-domain-workloads-v1.test.mjs"
  ],
  "truth_sync_refs": [
    "coordination/kidults/integration/authenticated-business-input-connection-v1.json",
    "coordination/kidults/kpmo/whole-platform-operating-proof-v1.json"
  ],
  "improvement_proposal": "Bind authorized native producers to these exact interfaces; do not register synthetic or observation-only producers as operating proof.",
  "autonomous_effect": "Reuses automatic exact-pair input execution without manual dispatch.",
  "global_effect": "Source-neutral bounded interfaces cover all thirteen outstanding domain results.",
  "irreplaceable_value_effect": "Preserves exact input, dependency and protected artifact lineage.",
  "transparency_effect": "Keeps local processing, semantic validation and actual native evidence separate."
}
```
