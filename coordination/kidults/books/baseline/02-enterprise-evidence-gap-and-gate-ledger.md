# 제2장. Enterprise Evidence·Gap·Gate Ledger

**판본 일자:** 2026-08-24 KST  
**도서:** Intelligence Holdings Enterprise Baseline Book  
**장 상태:** `IN_PROGRESS / 2_OF_3 / NOT_READY_FOR_INTEGRATED_REVIEW`  
**Track:** Enterprise Baseline / KPMO integration / Track A–E  
**의사결정 ID:** BASELINE-TRUTH-02, EVIDENCE-BEFORE-METRICS, KIDULTS-C1-HOLD, NO-FOURTH-BOOK  
**Snapshot ID:** N/A — 승인된 Snapshot·Candidate/Evidence·Projection이 존재하지 않는다.  
**Gate State:** G0 PASS; G1 BLOCKED; G2 NOT STARTED; G3 PARTIAL; G4 BLOCKED; G5 HOLD  
**기준 protected main:** `984dfa3ce05be35040450fe1443ecc897553592c` (`protected: true`)  
**Evidence 참조:** canonical issues #235, #236, #237, #238, #240, #256, #609, #769, #881, #921, #1066; PRs #1097, #1139, #1140, #1141, #1142; Platform Constitution; AI Governance registry; merged P0–P3 records; prior-book source lineage

## Platform Constitution Effect Receipt

| 필수 메타데이터 | 효과 | Evidence와 한계 |
|---|---|---|
| `autonomous_effect` | `POSITIVE` | 자동화된 readiness·receipt chain과 실제 empirical readiness를 분리해, 자동 실행이 Gate를 우회하지 않도록 기준선을 강화한다. |
| `global_effect` | `NEUTRAL_WITH_EVIDENCE` | global schema와 jurisdictional field는 존재하지만 실제 국가·언어·시장별 실증 coverage는 확인되지 않았다. |
| `irreplaceable_value_effect` | `POSITIVE` | 결손·거부·UNKNOWN·rollback까지 기업 Memory로 남겨 다음 실행의 학습자산으로 만든다. |
| `transparency_effect` | `POSITIVE` | enterprise target, KIDULTS verified slice, control evidence, empirical evidence, 외부 의존성을 서로 다른 상태로 공개한다. |

어떤 효과도 Production readiness, 글로벌 실증, 고객 traction 또는 승인 Projection의 증거로 사용하지 않는다.

## 1. Baseline의 목적

Baseline은 진행률을 높여 보이는 문서가 아니다. 특정 시각에 무엇을 **알고**, 무엇을 **모르고**, 무엇이 **차단됐으며**, 어떤 Evidence가 있어야 다음 상태로 이동하는지를 재현하는 기업 장부다.

이 장은 두 truth domain을 분리한다.

1. **Enterprise Canon:** Intelligence Holdings가 목표로 하는 정체성·운영원칙·공통 계약
2. **KIDULTS Verified Slice:** 현재 repository와 canonical issues에서 직접 확인 가능한 bounded implementation

KIDULTS에서 검증됐다는 이유만으로 전사 완료를 주장하지 않는다. KIDULTS 밖의 사업·시장·고객·권리·운영 상태는 canonical Evidence가 없으면 `UNKNOWN`이다.

## 2. Evidence Class

| Class | 정의 | 허용되는 표현 | 금지되는 표현 |
|---|---|---|---|
| E0 Contract | schema, policy, validator, workflow 계약 | DEFINED, INSTALLED | 운영 성공, 시장 검증 |
| E1 Control | exact-head test, fail-closed rejection, artifact integrity | CONTROL VERIFIED | empirical Evidence, 고객가치 |
| E2 Observation | 출처·시각·필드·권리·무결성이 결속된 관찰 | OBSERVED | Assessment, Projection |
| E3 Candidate/Evidence | immutable Candidate와 Evidence Package의 정확한 pair | READY FOR TRACK B | Track B 완료 |
| E4 Assessment | 승인된 입력에 대한 설명 가능한 Track B 평가 | ASSESSED | 승인 Projection |
| E5 Projection | lineage·scope·confidence·rankability가 승인된 Projection | APPROVED PROJECTION | Production 승인 |
| E6 Acceptance | Founder/customer workflow의 확인 가능한 수용 evidence | ACCEPTED WITH SCOPE | G5·Public 자동 승인 |
| E7 Production | 명시적 G5 승인과 운영·rollback evidence | PRODUCTION WITH RECEIPT | 전사 완성 선언 |

E0·E1의 양이 늘어도 E2 이상으로 자동 승격하지 않는다. 현재 main의 P3 readiness factory v2는 E0/E1 통제 진전이다.

## 3. Status Grammar

| 상태 | 의미 |
|---|---|
| `VERIFIED` | 현재 evidence reference와 exact state가 있다. |
| `PARTIAL` | 일부 구성은 검증됐지만 acceptance 조건이 남았다. |
| `READY/WAITING` | 다음 입력 전까지 실행 준비는 됐으나 입력이 없다. |
| `BLOCKED` | 다음 상태로 이동할 필수 Evidence·권한·외부조건이 없다. |
| `UNKNOWN` | 관찰 또는 canonical evidence가 없어 판단할 수 없다. |
| `NOT STARTED` | 정의된 시작조건이 충족되지 않아 실행하지 않았다. |
| `HOLD` | 인간 통제 Gate가 명시적으로 진행을 금지한다. |

`missing is not zero`를 적용한다. 확인되지 않은 값은 0으로 기입하지 않고 `UNKNOWN`으로 남긴다. 다만 repository에서 실제 개수가 0으로 검증된 경우에만 0을 사용한다.

## 4. Protected-main Read-back

| 항목 | 현재 값 | Evidence class |
|---|---|---|
| protected main SHA | `984dfa3ce05be35040450fe1443ecc897553592c` | E1 control provenance |
| branch protection | `protected: true` | E1 control provenance |
| latest merged purpose | ASI P3 current-chain Snapshot Readiness Factory v2 | E0/E1 control |
| current maturity | C1 — Product Contract established | Baseline classification |
| C2 eligibility | NOT ELIGIBLE | G1·G2 결손 |
| Production/Public/G5 | HOLD | human-controlled gate |

직전 `d222db86` 이후 main에 current-chain readiness contract, registry, factory, fail-closed validator, rolling count validation, 자동 실행 연결이 추가됐다. 이는 readiness chain을 더 재현 가능하게 만들었지만 Observation, Candidate/Evidence, Track B, Projection을 생성했다는 증거가 아니다.

## 5. KIDULTS Empirical Truth Ledger

| 항목 | 현재 검증값 | 판정 |
|---|---:|---|
| Reviewer-ready ER | 720/840 | PARTIAL |
| Blind candidates | 360/420 | PARTIAL |
| GRADED population | **0/120** | BLOCKED |
| Human review records | **0** | NOT STARTED |
| 적법한 collector-market dated-SOLD observations | **0** | BLOCKED |
| Immutable Candidate/Evidence pair | **NONE** | BLOCKED |
| Track B | **NOT STARTED** | 시작조건 미충족 |
| Final real workload | **NOT RUN** | 시작조건 미충족 |
| Approved live Projection | **NONE** | BLOCKED |
| Founder Acceptance | **NONE** | WAITING |
| Active Provider PoC | **0** | NOT ACTIVE |
| Provider redundancy for current market | **0** | NOT ESTABLISHED |

Discovery candidate, source graph, mission, preflight queue, runtime-alignment receipt, synthetic capacity는 통제·탐색 Evidence다. 위 표의 empirical 값으로 대체할 수 없다.

## 6. Current Control Evidence Ledger

| Control slice | 검증된 상태 | 남은 한계 |
|---|---|---|
| Platform Constitution | 고정 순서와 bounded authority가 main에 반영 | empirical alignment는 별도 |
| AI Governance | registry와 효과 receipt contract 존재 | 외부 Environment binding 미완료 |
| Trust/admission internal controls | #1013·#1134·#1136 등 내부 통제 main 반영 | #881 외부 control-plane 때문에 HOLD |
| Owned-source graph | #1138: 2,774 nodes, 6,278 edges, 482 candidates, 192 missions | 권리 승인 Evidence 또는 dated-SOLD 아님 |
| P3 readiness factory v2 | current-chain readiness contract·validator·automation main 반영 | approved Snapshot·real workload 없음 |
| Projection consumer | #1139 Draft exact-head 과거 검증 | current-main 재증명·Projection 없음 |
| STAGING receipt | #1142 local fail-closed proof | remote STAGING health·rollback receipt 없음 |
| Supply-chain slice | #1140 Draft 일부 proof | estate-wide immutable proof 미완료 |
| External control-plane | #1141 Draft read-back | external binding 0/15 |
| Three Books | PR #1097, 현재 2/3·2/3·2/3 편집 중 | 종합 리뷰 금지 |

Control evidence는 중요하지만 empirical truth를 대체하지 않는다.

## 7. Work Package Ledger

| WP | Owner | 상태 | Evidence | Blocker | 다음 acceptance evidence |
|---|---|---|---|---|---|
| WP-A1 | Track A | BLOCKED | #609, ER 720/840 | GRADED 0/120·human review 0 | 권리 확인된 PRIVATE_ONLY graded intake receipt |
| WP-A2 | Track A/ASI | PARTIAL | #235, source/readiness controls | dated-SOLD 0 | field×purpose rights + lawful observation |
| WP-P1 | KPMO/John | NEGOTIATION AUTHORIZED | #1066, #769 | rights·retention·derived-data·price·ROI UNKNOWN | substantive written provider matrix |
| WP-B1 | Track B | READY/WAITING | #236 | Candidate/Evidence NONE | immutable exact pair |
| WP-C1 | Track C | ACTIVE HARDENING | #237, #1139 | old base·Projection NONE | current-main Portal/API/export rejection proof |
| WP-D1 | Track D | PARTIAL | #240, #1142 | remote receipt 없음 | exact-main remote health·rollback bundle |
| WP-D2 | Track D | WAITING RIGHTS | provider-switchable Core | approved credential·rights 없음 | PASS provider bounded activation |
| WP-E1 | Track E | READY/WAITING | #256 | Projection·Founder Acceptance NONE | approved Projection EOS acceptance |
| WP-S1 | Security/KPMO/John | INTERNAL PASS / EXTERNAL HOLD | #881, #1140, #1141 | Environment binding 0/15·estate gaps | external read-back and trusted-ref proof |
| WP-R1 | Red-Team/KPMO | ACTIVE | fail-closed controls | remote·external evidence 부족 | no-promotion·rollback attack receipt |
| WP-BK1 | Editorial/KPMO | IN PROGRESS | PR #1097 | 3/3/3 미완료 | chapter-count receipt 3/3/3 |

## 8. Provider·Partnership Ledger

| Provider | Current state | Rights·retention·derived data | ROI·replacement·exit |
|---|---|---|---|
| CLASSIC.COM | NEGOTIATION AUTHORIZED / NOT ACTIVE | collection, storage, derivation, display, redistribution, retention, post-termination use 모두 UNKNOWN | price·ROI·replacement·exit UNKNOWN |
| ALT/FNDATA | NEGOTIATION AUTHORIZED / NOT ACTIVE | substantive field×purpose written rights 없음 | cost·ROI·replacement·exit UNKNOWN |
| PSA | HUMAN DETERMINATION PENDING | Case `04935073`; active data access 0 | 지연·부적합 시 승인된 대안 검토 |
| SGC 및 대안 | TRIAGED ONLY | active rights·data 없음 | qualification 이전 비활성 |

계약, 비용, EULA 수락, credential activation, 실데이터 ingestion, 외부 commitment는 이번 기준선에서 모두 0이다. PoC 종료는 `COMPLETED / REJECTED / DEFERRED`와 rights·retention·derived-data·ROI·replacement·exit receipt가 있어야 한다.

## 9. Gap Ledger

| 우선순위 | Gap | Root cause | Owner | Deadline condition | Recovery action |
|---|---|---|---|---|---|
| P0 | GRADED 0/120 | PSA 인간 판정 및 대안 권리 미확정 | Track A/KPMO | 외부 판정 또는 KPMO 필요 판단 즉시 | 승인 대안 접촉 후 PRIVATE_ONLY intake |
| P0 | dated-SOLD 0 | field×purpose 서면권리 없음 | WP-P1/John | provider 활성화 전 | rights matrix와 bounded reacquisition |
| P0 | Candidate/Evidence NONE | empirical inputs 부재 | Track A/B | C2 전 | immutable pair 생성 후 Track B 시작 |
| P1 | external control-plane 0/15 | Environment/ruleset/secret scope 외부 binding 미완료 | Security/KPMO/John | partner ingestion 전 | 승인된 external read-back과 trusted-ref enforcement |
| P1 | remote STAGING receipt 없음 | credential·실행창·remote health proof 미승인 | Track D/John | STAGING 승격 전 | exact-main NO_PROJECTION deployment·rollback receipt |
| P1 | supply-chain estate 미완료 | 일부 job의 mutable refs·runtime/install proof 결손 | Security | Production/G5 전 | estate-wide exact-SHA·immutable install evidence |
| P1 | Projection consumer drift | #1139가 current main과 분기 | Track C/Red-Team | 다음 개발창 | current-main reproof, 3-path rejection tests |
| P1 | 3-Book incomplete | 각 Book 2/3 | WP-BK1 | integrated review 전 | 다음 주기 각 제3장 1개, 3/3/3 receipt |

## 10. Gate Ledger

| Gate | 상태 | 진입 조건 | 현재 결손 |
|---|---|---|---|
| G0 Structure·Constitution·Contract | PASS | canonical contract와 통제구조 | 해당 없음 |
| G1 Evidence·Rights | BLOCKED | graded·dated-SOLD·written rights | 모두 미충족 |
| G2 Track B | NOT STARTED | immutable Candidate/Evidence | NONE |
| G3 Projection·STAGING | PARTIAL | approved Projection, exact remote receipt | 둘 다 미충족 |
| G4 Assurance·Acceptance | BLOCKED | external binding, Founder acceptance | 0/15, NONE |
| G5 Production | HOLD | Program Owner 승인과 full receipts | 승인 없음 |

G0 PASS는 C2 또는 Production readiness가 아니다.

## 11. Decision Mapping

| 결정 | Baseline 적용 |
|---|---|
| EVIDENCE-BEFORE-METRICS | 지표보다 source·rights·lineage·missing을 우선 기록 |
| KIDULTS-C1-HOLD | C1 유지, C2 미진입, Production/Public/G5 HOLD |
| PROVIDER-SEPARATION | 협상 승인과 계약·권리·credential 활성화를 분리 |
| AUTONOMOUS-NORMAL-PATH | main push 이후 auto dispatch·artifact·receipt만 정상경로 |
| MANUAL-BREAK-GLASS | manual dispatch는 recovery/diagnostics로만 분류 |
| NO-FOURTH-BOOK | 공식 문서는 Master·Baseline·Architecture 세 Book만 유지 |

## 12. Architecture Update Note

이 장은 runtime architecture를 변경하지 않는다. current-chain P3 readiness factory v2를 E0/E1 control evidence로 분류하고, E2 이상 empirical state와의 승격 경계를 Baseline에 고정한다.

정상 자동경로는 유지한다.

`PR Merge → Protected-main Push → Scale Wave Auto Dispatch → Immutable Artifact → KPMO Governed Status Receipt`

## 13. Source Inheritance

이 장은 이전에 제공된 Enterprise Baseline Book, Baseline 제1장 `Current Verified Truth`, Master·EVIA 원전, `coordination/kidults/`, Platform Constitution, AI Governance registry, canonical issues와 merged control records를 승계한다. 과거 SHA·Draft-head green·local artifact를 현재 protected-main empirical truth로 오인하지 않는다.

## 14. Book Sync Report

| Book | 현재 장 수 | Sync state |
|---|---:|---|
| Master | 2/3 | 기업가치·portfolio model과 현재 baseline을 분리 |
| Baseline | 2/3 | current protected main과 empirical/control/gap/gate ledger 결속 |
| Architecture | 2/3 예정 | 동일 상태문법을 runtime·receipt·rollback contract로 구현 |

상태는 `IN_PROGRESS / NOT_READY_FOR_INTEGRATED_REVIEW`다. 3/3/3 전에는 종합 결론이나 완성 판정을 발행하지 않는다.

## 15. Rollback

이 장은 독립 Markdown 파일 한 개로 추가된다. 삭제 또는 해당 commit revert로 완전히 복원할 수 있다. canonical issue, runtime, provider, rights, credential, security control-plane, Portal, STAGING, Public, Production, G5에는 변경이 없다.

