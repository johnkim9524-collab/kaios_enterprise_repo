# 제3장. Trust·Release·Safe Scale Enterprise Architecture

**판본 일자:** 2026-08-25 KST  
**도서:** Intelligence Holdings EVIA / Architecture Book  
**장 상태:** `COMPLETE_FOR_REVIEW / 3_OF_3 / REVIEW_SET_FROZEN`  
**Track:** Enterprise Architecture / AI Governance / Security / Operations / Productization / KIDULTS profile  
**의사결정 ID:** EVIA-TRUST-RELEASE-03, PC-A-G-I-T, SERVER-AUTHORITY-BOUNDARY, SAFE-SCALE-RELEASE, HUMAN-GATE-PRESERVATION, NO-FOURTH-BOOK  
**Snapshot ID:** N/A — 승인된 Candidate/Evidence pair·Assessment·live Projection이 없다.  
**Gate State:** G0 PASS; G1 BLOCKED; G2 NOT STARTED; G3 PARTIAL; G4 BLOCKED; G5 HOLD  
**기준 protected main:** `3efa1242918fdb35c4770f4661d4708633aa02c4` (`protected: true`)  
**Evidence 참조:** EVIA Canon; Platform Constitution; AI Governance registry; canonical issues #235, #236, #237, #238, #240, #256, #609, #769, #881, #921, #1066, #1202; merged #1210–#1213, #1217, #1218; active Drafts #1097 and #1219; prior-book source lineage

## Platform Constitution Effect Receipt

| 필수 메타데이터 | 효과 | Evidence와 한계 |
|---|---|---|
| `autonomous_effect` | `POSITIVE` | trust·release·rollback을 normal path와 authority envelope에 결속해 자율 실행이 human gate를 넘지 못하게 한다. |
| `global_effect` | `NEUTRAL_WITH_EVIDENCE` | environment·surface·purpose·jurisdiction profile을 구조화하지만 global runtime coverage는 검증되지 않았다. |
| `irreplaceable_value_effect` | `POSITIVE` | cryptographic lineage, rights interpretation, model/decision history와 recovery memory를 enterprise-owned Core로 축적한다. |
| `transparency_effect` | `POSITIVE` | exact SHA·run·artifact·nonce·revocation·rollback·missing·escalation을 관측 가능한 receipt로 요구한다. |

이 효과는 target architecture와 current E0/E1 control evidence에 한정된다. live route, external trust, remote STAGING, Production readiness를 입증하지 않는다.

## 1. Safe Scale의 정의

Safe Scale은 더 많은 Agent·source·workflow를 실행하는 능력이 아니다. 동일한 truth·rights·authority·rollback 계약을 유지하면서 범위를 넓히고, 결함의 영향반경을 제한하며, 실패를 재현·격리·복구하는 능력이다.

Scale 이전에 다음 질문에 모두 답해야 한다.

1. 어떤 exact input과 권리로 실행되는가?
2. 누가 어떤 authority를 부여했는가?
3. 결과가 어느 artifact·digest·Projection에 결속되는가?
4. 실패 시 무엇이 fail-closed되는가?
5. rollback target이 mutation 전에 존재하는가?
6. external system의 실제 상태를 read-back했는가?
7. 고객 surface가 승인 범위 밖 payload를 노출하지 않는가?

## 2. Enterprise Trust Planes

| Plane | 책임 | Fail-closed 조건 |
|---|---|---|
| Identity | object·actor·service·key identity | ambiguous identity |
| Source | factual origin·acquisition·jurisdiction | origin 또는 timestamp 없음 |
| Rights | collect·store·derive·display·retain·terminate | field×purpose UNKNOWN |
| Evidence | integrity·lineage·corroboration | digest·provenance 결손 |
| Assessment | method·explainability·rankability | exact pair 없음 |
| Projection | approval·scope·freshness·surface | signature·lineage·approval 결손 |
| Runtime | environment·release·workload·health | trusted read-back 없음 |
| Decision | human gate·exception·rollback | approver·scope·expiry 없음 |

어느 Plane의 PASS도 다른 Plane의 결손을 자동 보상하지 않는다.

## 3. Signed Server Projection Capability

#1218은 server-only Ed25519 capability core를 protected main에 병합했다. capability는 다음을 exact하게 결속한다.

- Projection digest
- Assessment identity
- Evidence-pair digest
- rights·rankability·freshness
- environment·surface·purpose
- release·workload
- trusted control-plane time
- bounded lifetime과 not-before/expiry
- durable single-use nonce
- revocation epoch와 rollback generation

검증기는 unknown/prototype key, wrong key type, non-canonical signature/time, excessive lifetime, nonce-store outage를 거부한다. 이는 browser claim이나 client-side flag가 server authority를 대신하지 못하게 하는 E0/E1 통제다.

현재 남은 경계는 명확하다.

| 항목 | 현재 |
|---|---|
| Portal render route binding | NOT_IMPLEMENTED_HOLD |
| API route | NOT_IMPLEMENTED_HOLD |
| Export route | NOT_IMPLEMENTED_HOLD |
| live key / credential | NONE |
| durable external nonce store | NONE |
| approved live Projection | NONE |
| payload | null |
| remote STAGING approved-path receipt | NONE |

## 4. Projection-only Consumer Architecture

정상 consumer flow는 다음과 같다.

`Signed approved Projection + server capability → route verifier → policy/rights/freshness check → payloadless denial or bounded render → consumption receipt`

Portal, API, export는 각 surface별로 capability의 surface·purpose·environment·release를 재검증한다. 한 surface의 capability를 다른 surface에서 재사용할 수 없다. client가 `approved=true`를 제출해도 server verifier가 통과하지 않으면 payload는 `null`이어야 한다.

필수 negative tests:

- wrong issuer/key/reference/digest
- replay·nonce reuse
- expired/not-yet-valid capability
- revoked epoch·old rollback generation
- cross-surface·cross-purpose·cross-environment
- missing rights·freshness·rankability
- nonce store unavailable
- unapproved Projection·raw Candidate·Evidence leakage

## 5. AI Governance와 Agent Fleet

모든 Agent·Engine·Workflow는 AI Governance registry에 다음을 등록한다.

- accountable human과 authority class
- allowed reads·writes·external actions
- input/output schema와 Evidence class
- source·rights·retention·privacy requirement
- trigger mode와 manual break-glass flag
- artifact·digest·retention·lineage
- failure state·escalation·timeout
- rollback target·recovery procedure
- 네 Constitution effect

등록되지 않은 Agent는 canonical status를 발행할 수 없다. fleet의 크기나 workflow 성공률은 empirical completeness가 아니다.

## 6. Autonomous Normal Path

정상경로는 하나다.

`PR Merge → Protected-main Push → Scale Wave Auto Dispatch → Immutable Artifact → KPMO Governed Status Receipt`

- PR Merge: 권한과 required checks를 만족
- Protected-main Push: exact SHA가 provenance root
- Auto Dispatch: 등록된 bounded mission만 실행
- Immutable Artifact: input·producer·run·digest·schema 결속
- KPMO Receipt: 성공·거부·missing·rollback·effect 기록

Manual dispatch는 break-glass·recovery·diagnostics로만 분류한다. 정상 자동 완료율이나 Production evidence에 합산하지 않는다.

## 7. External Control-plane와 Security

내부 validator PASS와 외부 control-plane verified state를 분리한다. external acceptance는 최소 다음을 요구한다.

1. job-level GitHub Environment binding
2. effective ruleset와 required status read-back
3. trusted-ref enforcement
4. least-privilege secret scope
5. exact action/runtime/install integrity
6. secret-name-only receipt와 value exposure 0
7. failure injection과 untrusted-ref denial
8. revocation·rotation·rollback procedure

현재 external trusted execution은 0/15이고 classic required contexts는 0/enforcement off다. 문서, Draft, local validator로 외부 상태를 VERIFIED로 표시하지 않는다.

## 8. STAGING와 Release Architecture

Release bundle은 다음을 포함한다.

- exact protected-main SHA
- successful workflow attestation
- immutable release artifact와 digest
- environment·surface·purpose
- approved Projection ID 또는 `NO_PROJECTION`
- health check와 accessibility/security check
- prior release rollback target
- deploy·health·rollback receipt
- credential scope와 secret exposure 0
- Program Owner execution window

#921의 remote localhost HTTP·`NO_PROJECTION`·rollback receipt가 없으므로 remote STAGING readiness는 미증명이다. local contract PASS는 remote execution을 대신하지 않는다.

## 9. Productization Architecture

Productization은 네 층의 결속이다.

| 층 | Architecture requirement |
|---|---|
| Brand Surface | claim ceiling, provenance, responsive accessibility |
| Product Interface | approved Projection-only, denial UX, decision workflow |
| Market Sensor | observation capture, consent/rights, no auto-promotion |
| Operating System | health, audit, rollback, incident, decision memory |

모바일 Workspace navigation과 visual consistency는 Brand/Product 품질을 높이지만 Evidence·Projection·acceptance를 생성하지 않는다.

## 10. Provider-switchable Data Architecture

Provider adapter는 transport·authentication·source schema를 담당하고 internal Core는 identity·provenance·rights·normalization·methodology·Projection·decision memory를 보유한다.

Provider activation sequence:

`written rights PASS → bounded credential → PRIVATE STAGING intake → immutable receipt → field tuple validation → evidence admission → replacement test`

계약·접근 가능성·listing·bid·aggregate는 current SOLD rights를 의미하지 않는다. Provider가 종료되면 adapter disable, credential revoke, retention/deletion, derived-data disposition, replacement source, decision history를 receipt로 남긴다.

## 11. Current Draft Integration Risk

#1219는 Portal/server route integration, STAGING contracts, source-pool persistence, workflow provenance, registry와 tests를 한 branch에 포함한다. 현재 31 commits·390 files·100,874 additions·1,588 deletions의 broad unit이며 exact head workflow first page는 93 success·7 failure다.

실패는 ASI artifact parity·restore, Security Assurance bootstrap, CI unbounded API guard, source graph restore에 집중된다. 한 누락 validator binding은 보정됐지만 현재 head 전체가 green이 아니므로 merge·promotion·Gate advance가 불가하다.

Architecture recovery rule:

1. failure별 root cause와 affected surface를 분리한다.
2. stale artifact와 restore dependency를 exact-main lineage로 재생성한다.
3. unbounded API access와 audit bootstrap을 bounded contract로 복구한다.
4. current exact head에서 terminal green을 재증명한다.
5. 가능하면 route·security·source persistence를 독립 rollback unit으로 분할한다.

## 12. Observability·Incident·Recovery

필수 receipt는 다음 질문에 답해야 한다.

- 어떤 SHA와 authority로 실행됐는가?
- 어떤 input artifact와 rights state를 사용했는가?
- 어떤 validator가 무엇을 거부했는가?
- retry가 안전한가, 격리해야 하는가?
- 누가 예외를 승인했고 언제 만료되는가?
- rollback target과 실제 복구 결과는 무엇인가?

| Failure domain | Recovery unit | Receipt |
|---|---|---|
| Documentation | file/commit revert | path·parent SHA |
| Workflow | isolated workflow revert/disable | trigger SHA·run ID |
| Artifact | reject/regenerate | producer·input·digest |
| Registry | prior digest restore | before/after validation |
| Portal route | route feature flag/revert | surface·payload denial |
| STAGING | prior release | remote health·rollback |
| Provider | adapter disable | rights·retention·exit |
| Projection | revoke/unpublish | ID·consumer purge |
| Production | G5 governed rollback | decision·release·health |

## 13. KIDULTS Bounded Implementation Profile

KIDULTS profile은 다음 상태를 유지한다.

- object/event: collector identity와 rights-admitted dated observation
- Evidence: field×purpose provenance·retention
- Assessment: Track B exact pair only
- Projection: signed, approved, scoped
- consumer: private Portal/EOS; payloadless denial
- provider: switchable adapter
- current truth: GRADED 0/120, review 0, current SOLD 0, Candidate/Evidence NONE, Track B NOT STARTED, approved Projection NONE

이 profile의 통제 준비는 전사 architecture의 학습자산이지만 enterprise completion 증거가 아니다.

## 14. Decision Mapping

| 결정 | Architecture 적용 | Gate |
|---|---|---|
| PC-A-G-I-T | 네 effect의 고정 순서 | G0–G5 |
| SERVER-AUTHORITY-BOUNDARY | client claim 대신 signed server capability | G3 |
| PROJECTION-ONLY-CONSUMER | Portal/API/export의 fail-closed admission | G3 |
| SAFE-SCALE-RELEASE | exact SHA·artifact·health·rollback bundle | G3–G5 |
| HUMAN-GATE-PRESERVATION | rights·security·credential·Production self-approval 금지 | G1–G5 |
| PROVIDER-SWITCHABLE-CORE | adapter 교체와 enterprise memory 분리 | G1–G4 |
| NO-FOURTH-BOOK | 세 공식 Book만 유지 | Editorial governance |

## 15. Architecture Update Note

이 장은 EVIA target canon에 #1218 server capability core, current route/external trust/remote STAGING gap, #1219 broad Draft risk, safe-scale release·rollback contract를 결속한다. runtime·workflow·registry·external system은 변경하지 않는다.

## 16. Source Inheritance

이전에 제공된 EVIA/Architecture Book을 enterprise target canon으로 승계한다. Architecture 제1·2장, Master·Enterprise Baseline, `coordination/kidults/`, Platform Constitution, AI Governance registry, positioning·competitiveness records, canonical issues와 protected-main control evidence를 이어받는다.

## 17. Book Sync Report

| Book | 현재 장 수 | 상태 |
|---|---:|---|
| Master | 3/3 | COMPLETE_FOR_REVIEW |
| Baseline | 3/3 | COMPLETE_FOR_REVIEW |
| Architecture | 3/3 | COMPLETE_FOR_REVIEW |

첫 한국어 review set은 `READY_FOR_INTEGRATED_REVIEW`다. 이 상태는 integrated review를 시작할 수 있다는 뜻이며, review PASS·Global validation·Production readiness를 의미하지 않는다. 세트는 동결하고 추가 장을 쓰지 않는다.

## 18. Rollback

이 장은 독립 Markdown 파일이다. 삭제 또는 commit revert로 원복 가능하다. runtime, Provider, rights, credential, trust-root, registry, Portal, STAGING, Public, Production, G5에는 변경이 없다.
