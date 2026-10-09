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

### 2026-10-09 finalization incident correction and inactive proposal

PR #2621 remains open at `edeac43c7031af5b8b3c64a40627dd740bfa64cb`, based on main `c32293a0bb2107f88326c9ae279f7b72bf307c98` at the reconciliation preceding this proposal. Its three native role receipts belong to generation `pr-2621-edeac43c7031af5b8b3c-c1a805d084b72cfb`; they are not authority for a changed source head. Elected finalizer run `37868436680`, job `113620747798`, failed with `AUTONOMOUS_GITHUB_API_403` before merging. Its quarantined artifact `11589446645` records `merge_performed=false` and no merge SHA.

Reserve run `37868792082` / job `113621777133` and Discovery run `37869143499` / job `113622902853` explicitly report GitHub installation API rate-limit exhaustion in the same period. The finalizer discards response headers and body, so attributing its particular 403 to that exhaustion is an inference, not a captured server diagnosis. `contents: write` is already declared in the finalization job; missing content permission has not been established.

Correction: recovery run `37868620750` belongs to the fixed historical PR #2555 incident in `POSTMERGE_RECOVERY_INCIDENT`. It is not PR #2621 recovery evidence. Neither its failure nor success can establish #2621 completion.

The separate inactive source proposal reduces repeated immutable-file retrieval: exact forty-character Git SHAs are required, verified file bytes are cached only within the process by repository/path/SHA, and changed-file reads are serialized. Live PR, main, ruleset and check observations remain uncached. Rejected or invalid objects are not cached. HTTP errors retain only bounded numeric rate-limit headers and a rate-limit boolean; response bodies and credentials are not logged. No write is automatically retried, no credential scope or trigger is changed, and no authority is renewed. This mitigates request amplification; it does not guarantee the shared installation budget is sufficient or implement a new recovery authority.

The proposed protected finalizer change was rejected by both unchanged local capability classifiers: `CAPABILITY_GUARD_DEPENDENCY_CHANGED` and `INDEPENDENT_GUARD_DEPENDENCY_CHANGED`. It must not replace the eligible #2621 source or activate through a manual dispatch/bypass. The proposal is preserved on a separate development branch for exact-source review. This branch is not a landing receipt or production authorization.

Actual thirteen-domain native connections remain **0/13**, the business producer registry remains empty, and authenticated input is missing. Six local processors and thirteen consumers do not replace seven absent native workload producers, source-specific legal admission, or actual business outputs. No second natural generation on a final merged main has been established. Production/Public/G5/provider activation remain HOLD; DigitalOcean email 84216 is unchanged.


### 2026-10-09 실제 업무 입력 확보 재개 및 외부 요청 검토

판정: 실제 업무 생산자 등록 0개, 13개 영역의 인증된 실제 업무 연결 0/13. 기존 PR #2621의 head와 main은 그대로 소비한다. 이번 요청에서 새 PR, 승인, 수동 실행, dispatch, 배포 또는 생산자 등록을 생성하지 않았다. 아래 문서는 공급자 증거 재조회와 미발송 요청문이며, 입력 취득이나 등록 완료 증거가 아니다.

| 경로 | 새로 확인한 원문 및 범위 | 실제 업무 입력 적격성 | 마지막 미완료 단계 |
|---|---|---|---|
| CLASSIC.COM | 2026-09-21 공급자 메시지 `1a0c4203654d2bab`: 사용 계획 후 계약안을 제공하겠다고 회신. 같은 날 사용 계획 발송 `1a0c44ea6500968e`. 2026-10-09 검색에서 이후 공급자 회신 없음 | 샘플 및 협상은 가격·권한이 확정된 계약이나 현재 업무용 API 취득 권한이 아님 | 확정 계약안·권한·가격·provenance·필드 지원 확인 |
| PSA | 공급자 메시지 `1a0c4ff590997e62`에서 기존 시험 사용 허용 및 해당 규모 서명 계약 불요 확인. `1a0ce643d74de351`에서 공급자 지정 시험번호 제공 확인 | 인증/참조 시험 범위. SOLD·최근 가격·유동성 입력으로 사용할 수 없음 | 승인된 비공개 token/runtime 결속, 목적별 입력 경로. AWS ap-northeast-2의 기존 승인 프로필에서 이름에 psa가 있는 Secrets Manager 항목은 0개였으나 다른 저장소의 부재는 추론하지 않음 |
| Getty | 공식 `https://data.getty.edu/provenance/docs/`에서 CC0 재확인. 기존 계약은 이미 취득된 정확한 두 snapshot 및 1938년 거래 1건에 한정 | 과거 거래 맥락. 최근 업무 입력기의 CURRENT_SOLD_TRANSACTION 목적과 불일치 | 이미 완료된 취득을 반복하지 않음. 최근 거래로 승격하지 않음 |
| Seattle / 미 국무부 | 기존 권한·목적별 계약 재검토 | 정부 차량 처분 참고 또는 제한된 관측 사실. 수집품 시장 가격·유동성 목적이 승인되지 않음 | 목적/대표성 불일치. 대체 입력으로 등록하지 않음 |

`executeBusinessInputStage`는 CURRENT_SOLD_TRANSACTION 권한 및 atomic transaction receipt를 요구한다. `MARKET_EVIDENCE` 소비자는 최근 거래·유동성 및 독립 원천 2개를 요구한다. 계약안 확보만으로 이 요구가 충족되거나 13개 생산자가 구현되는 것은 아니다. 아직 없는 7개 native workload adapter와 보호된 입력 취득/등록 경로도 구현·실증해야 한다. 공급자 이메일 원문과 오래된 canonical provider state의 날짜가 불일치하므로, 오래된 state를 최신 승인이나 실행 권한으로 소비하지 않는다.

KPMO 1차 검토: 목적은 미회신 계약안을 받아 적법한 현재 업무 입력 취득의 가능 여부를 결정하는 것이다. 미발송 상태에서는 계약·입력 부재가 유지된다. 이번 메일은 새 계약 체결, 결제, 토큰 생성, 서비스 활성화 또는 기록 전달의 승인을 요청하지 않는다. 단일 공급자 답변은 독립 원천 2개가 아니다. CLASSIC.COM이 provenance 또는 유동성 필드를 지원하지 않으면 그 주장은 제외하고 별도 적법한 원천을 검토한다. 비용은 미정이며 새 지출 0이다. 계약 상대방은 공급자가 제시할 실제 법인으로 확인하고, Intelligence Holdings 법인 존재나 계약 권한을 가정하지 않는다. 답변을 구하는 목표일은 2026-10-14 KST이며 회신/거절이 오면 원문을 다시 읽고 다음 단계로 진행한다. 자동 추적·자동 발송은 설정하지 않았다.

KPMO 별도 2차 적대 검토: 같은 기존 스레드와 확인된 발신/수신 계정만 사용하고 CC/BCC·첨부·외부 링크를 추가하지 않았다. 9월 21일 메시지를 재전송하지 않고 미회신 계약안에 대한 후속 요청만 제안한다. 전화 제안, 권한 추정, 가격 동의, 데이터 전달/activation 요청, 현재 유동성 지원의 기정사실화, 공급자 원천 독립성의 과대 주장이 없다. 현재 판정은 `APPROVED_FOR_PROGRAM_OWNER_REVIEW`; 실제 발송 승인이 아니다. Gmail 임시저장 생성 및 발송은 0건이다.

정확한 외부 요청 패키지(JSON 문자열의 줄바꿈 LF, RFC 8785 방식 정렬 JSON의 SHA-256):

```json
{
  "schema_version": "1.0.0",
  "package_id": "CLASSIC_COM_WRITTEN_SCHEDULE_FOLLOWUP_20261009_V1",
  "provider_id": "CLASSIC_COM",
  "sender_identity": "partnerships@kidults.com",
  "to": [
    "datasupport@classic.com"
  ],
  "cc": [],
  "bcc": [],
  "thread_or_reply_target": "gmail:thread:1a0b5669d94b054b; gmail:message:1a0c44ea6500968e",
  "subject": "Re: KIDULTS Data Evaluation — Required Quality Evidence Before Commercial Consideration",
  "complete_body": "Hi Pablo,\n\nI am following up on the intended use profile sent on 21 September for the proposed Taxonomy and Sales History Schedule and Master Agreement.\n\nPlease confirm whether you can provide the written proposal for our initial 30-day, private, non-production evaluation of up to 120 Sales History records and corresponding taxonomy references. Please state the exact contracting entity, price and minimum commitment, access method and quota, internal storage and analytics rights, retention/deletion period, derived-result rights after termination, and renewal/cancellation terms.\n\nPlease also confirm whether named auction/dealer/venue provenance or equivalent auditable source identifiers are available. For current transaction and liquidity evaluation, please specify the available sale/outcome dates, listing or observation start dates, and unsold/withdrawn observations. If these fields or uses are unavailable, please state that explicitly; we will keep those claims excluded.\n\nEnglish is not my native language, and I sincerely appreciate your understanding that we require written email for accurate review and an auditable record. We will not arrange a phone, voice, or video call.\n\nThis request is for a written proposal only. It does not accept an agreement, authorize payment, activate credentials or data delivery, or permit public or production use. If you cannot support this written evaluation path, please confirm so that we can close this lane and evaluate alternatives.\n\nThank you,\n\nYun Goo Kim\nKIDULTS\npartnerships@kidults.com",
  "attachments": [],
  "links": []
}
```

패키지 digest: `sha256:6b52e732562e57a76daba447e6dc35c0a82e4d416fb11bade1c42119513b9376`.

Program Owner의 정확한 패키지 발송 승인: 미확보. 이 단계는 내부 PR/CI 일상 승인이 아니라 외부 공급자 통신이다. 근거: `docs/strategy/IH_GROUP_GLOBAL_PROVIDER_STRATEGY_V6.md` §9.1의 “Program Owner exact-content send approval”. 승인 이후에도 수신자·본문·스레드·첨부·링크가 달라지면 이 digest를 재사용할 수 없다. 발송만 승인돼도 계약·지출·credential·acquisition·Public/Production/G5 권한은 생성되지 않는다. DigitalOcean 이메일 84216은 읽거나 수정하지 않았다.
