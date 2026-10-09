# Runtime domain processing and authenticated output consumption

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

## Native output interface

A registered producer supplies `native_domain_output_references[DOMAIN_ID]` in the existing private input manifest, with positive integer `run_id` and `artifact_id`. Registration is read exclusively from the committed `whole-platform-operating-proof-v1.json`; caller manifest metadata cannot register workflows. The current registry contains only SECURITY_SUPPLY_CHAIN. Registration and credential/activation authority are not granted by this interface.

Non-security artifacts must contain exactly `runtime-domain-receipt.json` and `domain-output.json`, without nested paths or extra members. The receipt must satisfy the existing value-chain runtime receipt verifier, bind the registered workflow and native run, and reference the raw output digest at the exact native run/artifact source. The output uses `kidults-runtime-domain-output-v1`, the exact domain and source SHA, the authenticated stage's `input_digest`, all four HOLD boundaries, `fixture_evidence: false`, and a canonical `output_digest` over the body without that digest. `dependency_receipt_digests` must match the exact required native upstream receipt digests. Reliability additionally requires the immutable business pair. Domain-specific fields are validated by `runtime-domain-output-consumers-v1.mjs`; hashes alone do not prove the claimed underlying operation.

Archive download is data-only. No downloaded code is executed. The reader validates repository, main SHA, workflow path, event, first attempt, completion, freshness (at most two hours), exact artifact identity, archive checksum and semantic content. It reads back run, artifact and main identity after download. Manual dispatch, reruns, stale artifacts, duplicate matches, wrong dependency receipts and drift fail closed. SECURITY_SUPPLY_CHAIN retains its existing archive format, with every primary member checked against its raw digest.

The semantic consumer alone returns `OUTPUT_CONTENT_VERIFIED_NOT_NATIVE_DOMAIN_CERTIFICATE`. Authentication imports an already-existing producer receipt; it never issues a replacement certificate or grants dispatch. Public observations strip private output/receipt bodies and retain counts and digests. A successful read does not establish whole-platform completion or release eligibility.

## Bounds and operational limits

Input batches and rights sources are bounded to 100, the graph to fourteen domains, and each artifact to the existing bounded archive reader limits. Graph cycles and unknown domain IDs fail closed. Reading runs serially provides backpressure; no external writes, commands, retries, provider acquisition or infrastructure provisioning occur. Existing automatic workflow activation is reused; workflow permissions and triggers are unchanged. Source-neutral interfaces permit separate provider partitions but this change contains no measured throughput, cost or SLO claim. Rollback is a revert; domain failures prevent downstream joins and retain HOLD diagnostics rather than fabricated success.

## Verification and completion boundary

Regression and negative tests exercise real input-stage compatibility, each of thirteen semantic consumers, native transport mutation, checksum drift, main/run/artifact readback, dependency receipt joins and fixture/non-native evidence separation. All native-transport tests use explicitly synthetic test transports. Their success is not a live workload receipt.

Completion remains blocked on lawful current transaction/liquidity input and authorized registered native producers. After those actual outputs arrive, whole-platform completion still requires the governed independent verification, normal autonomous quorum/finalizer/merge evidence, and two distinct natural generations on the same final main. Production/Public/G5/provider activation remain HOLD. No manual approval, dispatch, protection bypass, historical approval reuse, provider message or DigitalOcean email edit is performed by this implementation.
