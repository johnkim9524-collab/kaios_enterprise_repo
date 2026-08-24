# 제3장. Enterprise Readiness·Acceptance·Transition Baseline

**판본 일자:** 2026-08-25 KST  
**도서:** Intelligence Holdings Enterprise Baseline Book  
**장 상태:** `COMPLETE_FOR_REVIEW / 3_OF_3 / REVIEW_SET_FROZEN`  
**Track:** Enterprise Baseline / KPMO / Track A–E / Security / Productization  
**의사결정 ID:** BASELINE-TRANSITION-03, EVIDENCE-BEFORE-METRICS, ACCEPTANCE-NOT-AUTOPROMOTION, KIDULTS-C1-HOLD, NO-FOURTH-BOOK  
**Snapshot ID:** N/A — immutable Candidate/Evidence pair와 승인 live Projection이 없다.  
**Gate State:** G0 PASS; G1 BLOCKED; G2 NOT STARTED; G3 PARTIAL; G4 BLOCKED; G5 HOLD  
**기준 protected main:** `3efa1242918fdb35c4770f4661d4708633aa02c4` (`protected: true`)  
**Evidence 참조:** canonical issues #235, #236, #237, #238, #240, #256, #609, #769, #881, #921, #1066, #1202; merged #1210, #1211, #1212, #1213, #1217, #1218; active Drafts #1097 and #1219; Platform Constitution; AI Governance registry; prior-book source lineage

## Platform Constitution Effect Receipt

| 필수 메타데이터 | 효과 | Evidence와 한계 |
|---|---|---|
| `autonomous_effect` | `POSITIVE` | readiness·acceptance·transition을 machine-readable entry/exit evidence에 결속해 자동 실행과 자동 승격을 분리한다. |
| `global_effect` | `NEUTRAL_WITH_EVIDENCE` | global profile과 jurisdiction field는 target contract로 존재하지만 실제 market·language·country coverage는 검증되지 않았다. |
| `irreplaceable_value_effect` | `POSITIVE` | 결손·거부·실패·복구·승인 이력을 Knowledge Capital로 보존한다. |
| `transparency_effect` | `POSITIVE` | enterprise target과 KIDULTS verified slice, E0/E1 control과 E2–E7 empirical/acceptance를 분리한다. |

이 receipt는 문서 상태만 설명한다. C2, G1–G5, 고객 acceptance, Production readiness를 통과시키지 않는다.

## 1. Baseline의 최종 역할

Baseline은 상태를 낙관적으로 요약하는 문서가 아니라 다음 전이를 증명하는 장부다.

`Defined → Controlled → Observed → Evidenced → Assessed → Projected → Accepted → Produced`

각 전이는 별도의 entry evidence와 exit receipt를 요구한다. workflow가 성공해도 입력 Evidence가 없으면 다음 상태로 이동하지 않는다. 화면이 완성돼도 고객 acceptance가 없으면 Accepted가 아니다. STAGING contract가 있어도 remote receipt가 없으면 remote readiness가 아니다.

## 2. Enterprise truth와 KIDULTS slice

- **Enterprise target canon:** Intelligence Holdings가 지향하는 identity·governance·architecture·portfolio·value model
- **KIDULTS verified slice:** repository, exact SHA, canonical issues와 immutable artifacts에서 직접 확인 가능한 bounded implementation
- **Unverified enterprise area:** canonical Evidence가 없으므로 `UNKNOWN`

KIDULTS 통제 진전을 전사 완료로 확장하지 않는다. 또한 enterprise 목표를 KIDULTS의 현재 실증값으로 축소하지 않는다.

## 3. Current Protected-main Read-back

| 항목 | 현재 값 | Baseline 판정 |
|---|---|---|
| protected main | `3efa1242918fdb35c4770f4661d4708633aa02c4` | E1 provenance |
| branch API | `protected: true` | E1 control read-back |
| classic required contexts | 0 / enforcement off | P1 control-plane gap |
| maturity | C1 | C2 미진입 |
| latest merged control | #1218 signed server Projection capability core | E0/E1 control |
| real Portal/API/export routes | `NOT_IMPLEMENTED_HOLD` | G3 blocker |
| external trusted execution | 0/15 | G1/G3 blocker |
| remote STAGING approved-path receipt | NONE | G3 blocker |
| Public / Production / G5 | HOLD | human gate |

#1218은 Ed25519 capability envelope, exact Projection·Assessment·Evidence-pair binding, trusted time, single-use nonce, revocation epoch, rollback generation을 구현했다. 그러나 live key·credential·external nonce store·real route·remote STAGING·approved Projection은 만들지 않았다.

## 4. Empirical Truth Ledger

| 항목 | 검증값 | 상태 |
|---|---:|---|
| Reviewer-ready material | 720/840 | PARTIAL |
| Blind candidates | 360/420 | CANDIDATE_NOT_SEALED |
| GRADED population | 0/120 | BLOCKED |
| Human review records | 0 | NOT STARTED |
| 적법한 collector current-market dated-SOLD | 0 | BLOCKED |
| Immutable Candidate | NONE | NOT CREATED |
| Immutable Evidence Package | NONE | NOT CREATED |
| Track B | NOT STARTED | READY/WAITING |
| Final real workload | NOT RUN | BLOCKED |
| Approved live Projection | NONE | NOT CREATED |
| Current-SOLD rights-clear | 0/16 | HOLD |
| Active Adapter / acquisition backlog | 0 / 0 | DISABLED |
| Active Provider PoC | 0 | NOT STARTED |

Sean·Claire reviewer roster의 준비는 실제 review records가 아니다. Getty historical Evidence와 State Department reference Evidence는 current collector-market SOLD·price·liquidity Evidence가 아니다.

## 5. Evidence Class와 Transition Rule

| Transition | Entry evidence | Exit evidence | 현재 |
|---|---|---|---|
| E0→E1 Control | schema·policy·validator | exact-head rejection·integrity proof | PARTIAL/ADVANCED |
| E1→E2 Observation | source·rights·time·field | immutable observation receipt | BLOCKED |
| E2→E3 Pair | Candidate + Evidence Package | exact digest-bound pair | NONE |
| E3→E4 Assessment | approved exact pair | Track B assessment | NOT STARTED |
| E4→E5 Projection | rankable assessment·approval | signed Projection lineage | NONE |
| E5→E6 Acceptance | approved Projection·workflow | Founder/customer acceptance | BLOCKED |
| E6→E7 Production | G5 authorization·rollback | production health/decision receipt | HOLD |

E0/E1 control의 양이 늘어도 E2 이상으로 자동 승격하지 않는다. `missing is not zero`를 적용하고, 실제 0이 검증된 경우에만 0을 쓴다.

## 6. Track A–E Baseline

| Track | 현재 상태 | Exit condition |
|---|---|---|
| A | control·software advance / empirical blocked | GRADED 120, lawful current-market Evidence, exact pair |
| B | READY/WAITING / NOT STARTED | exact Candidate/Evidence pair 도착 |
| C | browser admission + server capability core / routes HOLD | real governed routes, approved Projection, route negatives |
| D | local contract PASS / remote HOLD | exact-main remote health·NO_PROJECTION·rollback receipt |
| E | foundation ready / acceptance waiting | approved Projection과 Founder acceptance |
| Security | internal scoped advance / external HOLD | Environment·ruleset·secret-scope 15/15 read-back |
| Red-Team | active | full-chain negative evidence와 회귀 0 |
| Editorial | 3/3/3 review set ready | integrated review 후 별도 판정 |

## 7. 현재 P0/P1

| 등급 | 위험 | 근본원인 | Owner | Recovery evidence |
|---|---|---|---|---|
| P0 | GRADED 0/120 | PSA 인간 판정·대안 권리 미완료 | Track A/KPMO | written field×purpose rights + lawful graded intake |
| P0 | current dated-SOLD 0 | collector rights-clear source 없음 | Track Z/John | collect·store·derive·display·retention·termination evidence |
| P0 | Candidate/Evidence NONE | E2 observation과 exact pair 결손 | Track A/B | immutable pair digest |
| P1 | real route 미구현 | capability core와 consumer route 분리 | Track C | Portal/API/export fail-closed integration |
| P1 | external trust 0/15 | GitHub Environment/ruleset/secret binding 미승인 | Security/John | 15/15 external read-back |
| P1 | remote STAGING receipt 없음 | 승인 실행창·credential·remote proof 결손 | Track D/John | health·NO_PROJECTION·rollback |
| P1 | 3-Book 종합 판정 미실시 | 이 review set이 방금 3/3/3 도달 | Editorial/KPMO | integrated review receipt |

## 8. Active Draft Truth

### PR #1097

- Documentation-only
- 이 장 세트로 Master·Baseline·Architecture가 3/3/3에 도달
- Draft / open / unmerged 유지
- integrated review의 입력으로만 사용

### PR #1219

- base: current protected main `3efa1242`
- 31 commits / 390 files / broad internal closure
- current head `9b0b7a1684fc796eba6e2e049276bb10765b5a8f`
- connector first-page workflows: 93 SUCCESS / 7 FAILURE
- 실패 영역: ASI SHADOW regeneration, Security Assurance, CI unbounded API guard, sharded reserve restore, SHADOW operating evidence mutation, source-domain observation restore, owned-source graph restore
- non-promotable / empirical gate effect NONE

Draft-head success 또는 mergeability는 protected-main evidence, empirical PASS, release authorization이 아니다.

## 9. Provider·PoC Baseline

| Portfolio state | 대상 | 현재 경계 |
|---|---|---|
| CONDITIONAL_HOLD | GemRate Developer, PSA Premium, Classic.com Bundle 3 | rights·retention·derived-data·가격·ROI·exit 미완료 |
| PENDING_PROVIDER_RESPONSE | PSA Enterprise, CGC Dealer, ALT/FNDATA, LiveArt, Hagerty | 공식 회신 전 terminal DROP/REJECTED 금지 |
| PRE-SEND HOLD | Bonhams | 수신자·정확한 scope·대체 포트폴리오 미완료 |
| BOUNDED PUBLIC REFERENCE | Getty, Seattle | historical/non-collector; current-market PoC 아님 |

활성 PoC·계약·EULA·지출·credential·Provider 실데이터 ingestion은 모두 0이며 `POC_PROGRAM_CLOSE_ACCEPTED`도 없다.

## 10. Gate Transition Contract

| Gate | 현재 | 다음 상태 최소 Evidence |
|---|---|---|
| G0 | PASS | Constitution·registry·rollback drift 0 유지 |
| G1 | BLOCKED | rights-admitted empirical Observation + Evidence |
| G2 | NOT STARTED | exact immutable Candidate/Evidence pair |
| G3 | PARTIAL | real routes + signed approved Projection + remote STAGING |
| G4 | BLOCKED | independent assurance + Founder acceptance |
| G5 | HOLD | explicit Program Owner approval + production rollback readiness |

Gate는 순차 의존성을 가진다. 뒤 Gate의 control code가 준비돼도 앞 Gate의 Evidence 결손을 상쇄하지 않는다.

## 11. Acceptance와 Productization

Productization은 UI 완료가 아니라 다음을 함께 요구한다.

- defined customer decision
- rights-admitted Evidence
- approved Projection
- accessible and secure interaction
- source SHA와 release lineage
- health·rollback·recovery receipt
- customer/Founder acceptance
- cost·ROI·replacement evidence

모바일 Workspace 개선이나 Portal visual QA는 제품 품질 진전이지만 위 acceptance bundle을 대신하지 않는다.

## 12. Decision Mapping

| 결정 | Baseline 적용 |
|---|---|
| EVIDENCE-BEFORE-METRICS | E2 admission 전 metric claim 금지 |
| MISSING-IS-NOT-ZERO | 미관찰을 0 또는 PASS로 치환 금지 |
| CONFIDENCE-NOT-RANKABILITY | confidence로 Track B·Projection 우회 금지 |
| ACCEPTANCE-NOT-AUTOPROMOTION | workflow success로 Founder acceptance·G5 승격 금지 |
| RESPONSE-FIRST-PROVIDER | 회신 없는 terminal disposition 금지 |
| KIDULTS-C1-HOLD | 현재 C1, C2 미진입 |
| NO-FOURTH-BOOK | 세 공식 Book만 유지 |

## 13. Architecture Update Note

이 장은 상태전이와 acceptance floor를 정의할 뿐 runtime을 변경하지 않는다. #1218 capability core와 #1219 Draft를 정확히 E0/E1 control로 분류하고, route·external trust·remote STAGING·empirical gap을 유지한다.

## 14. Source Inheritance

Enterprise Baseline source canon, Baseline 제1·2장, Master와 EVIA/Architecture 경계, `coordination/kidults/`, Platform Constitution, AI Governance registry, positioning·competitiveness records, canonical issues와 protected-main evidence를 교체하지 않고 승계한다.

## 15. Book Sync Report

| Book | 현재 장 수 | 상태 |
|---|---:|---|
| Master | 3/3 | COMPLETE_FOR_REVIEW |
| Baseline | 3/3 | COMPLETE_FOR_REVIEW |
| Architecture | 3/3 | COMPLETE_FOR_REVIEW |

상태는 `READY_FOR_INTEGRATED_REVIEW`다. chapter-count 완결 외의 종합 PASS·enterprise completion·full alignment는 아직 판정하지 않았다.

## 16. Rollback

이 장은 독립 Markdown 파일이다. 삭제 또는 commit revert가 가능하다. runtime·Provider·rights·credential·GitHub control-plane·Portal·STAGING·Public·Production·G5에는 변경이 없다.
