# 제2장. 재현 가능한 Governed Autonomy

**판본 일자:** 2026-08-24 KST  
**도서:** Intelligence Holdings EVIA / Architecture Book  
**장 상태:** `COMPLETE_FOR_REVIEW / 3_OF_3 / REVIEW_SET_FROZEN`  
**Track:** Enterprise Architecture / AI Governance / Security / Operations / KIDULTS profile  
**의사결정 ID:** EVIA-AUTONOMY-02, PC-A-G-I-T, EVIDENCE-ADMISSION-FLOOR, HUMAN-GATE-PRESERVATION, NO-FOURTH-BOOK  
**Snapshot ID:** N/A — 승인된 Snapshot·Candidate/Evidence·Projection이 없다.  
**Gate State:** G0 PASS; G1 BLOCKED; G2 NOT STARTED; G3 PARTIAL; G4 BLOCKED; G5 HOLD  
**기준 protected main:** `0d89556064ef5244bc1cc788641e2ef0bdfb49b7` (`protected: true`)  
**Evidence 참조:** EVIA Canon; Platform Constitution; AI Governance registry; canonical issues #235, #236, #237, #238, #240, #256, #609, #769, #881, #921, #1066; merged #1013, #1134, #1136, #1138 and current P3 v2 chain; Draft PRs #1139, #1140, #1141, #1142; prior-book source lineage

## Platform Constitution Effect Receipt

| 필수 메타데이터 | 효과 | Evidence와 한계 |
|---|---|---|
| `autonomous_effect` | `POSITIVE` | 정상 실행경로, authority envelope, fail-closed admission, immutable artifact, governed receipt, recovery를 하나의 재현 가능한 계약으로 결속한다. |
| `global_effect` | `NEUTRAL_WITH_EVIDENCE` | jurisdiction·language·market profile을 지원하는 구조를 정의하지만 실제 global source coverage와 운영 실증은 확인되지 않았다. |
| `irreplaceable_value_effect` | `POSITIVE` | provider-switchable adapters 뒤에 identity·rights·evidence·methodology·Projection·decision memory를 기업 소유 Core로 고정한다. |
| `transparency_effect` | `POSITIVE` | request·decision·artifact·rollback·missing·escalation을 receipt와 lineage로 관찰 가능하게 한다. |

이 효과는 target architecture와 current control evidence에 한정된다. empirical Evidence, live Projection, remote STAGING, Production readiness를 입증하지 않는다.

## 1. Governed Autonomy의 정의

Governed Autonomy는 인간이 매번 버튼을 누르지 않아도 시스템이 반복 실행되는 능력과, 시스템이 스스로 권한을 확대하지 못하도록 하는 능력의 결합이다.

Autonomous는 먼저 실행하고 나중에 설명하는 방식이 아니다. 다음 조건을 충족할 때만 정상 실행으로 인정한다.

1. 입력과 authority envelope가 명시돼 있다.
2. source·rights·purpose·retention이 machine-readable 상태로 결속된다.
3. 실패와 missing이 fail-closed로 처리된다.
4. exact SHA와 immutable artifact로 재현된다.
5. 결과와 한계가 KPMO governed receipt에 기록된다.
6. rollback target이 mutation 전에 존재한다.
7. 인간 통제 Gate는 자동으로 우회·확대·승인되지 않는다.

## 2. Platform Constitution 실행 순서

모든 Engine, Agent, Fleet, Workflow는 Constitution을 다음 고정 순서로 평가한다.

`Autonomous → Global → Irreplaceable Value → Transparent`

순서는 수사적 우선순위가 아니라 evaluation dependency다.

| 단계 | Architecture 질문 | 실패 시 상태 |
|---|---|---|
| Autonomous | bounded authority 안에서 재현 가능하게 실행되는가? | HOLD / ESCALATE |
| Global | jurisdiction·language·market 차이를 명시적으로 처리하는가? | UNKNOWN / BOUNDED |
| Irreplaceable Value | 결과가 기업 소유 Knowledge Capital에 누적되는가? | REJECT / NON-CANONICAL |
| Transparent | 입력·결정·결손·rollback이 관찰 가능한가? | FAIL-CLOSED |

앞 단계의 실패를 뒤 단계의 장점으로 보상하지 않는다. 네 효과 중 하나가 `UNKNOWN`이면 `COMPLETE_VERIFIED` 또는 full platform alignment를 주장하지 않는다. 부정적 효과는 explicit governed exception과 승인 주체·만료·rollback이 있어야 한다.

## 3. 정상 자동 실행경로

공식 정상경로는 하나다.

`PR Merge → Protected-main Push → Scale Wave Auto Dispatch → Immutable Artifact → KPMO Governed Status Receipt`

### 3.1 PR Merge

- protected policy와 required checks를 만족한다.
- merge authorization이 없는 Agent는 merge하지 않는다.
- security trust-root, legal, data rights, credential, G5 변경은 별도 인간 승인을 요구한다.

### 3.2 Protected-main Push

- trigger SHA가 immutable provenance의 시작점이다.
- branch protection read-back과 exact SHA가 receipt에 포함된다.
- Draft-head green을 protected-main 운영증거로 승격하지 않는다.

### 3.3 Scale Wave Auto Dispatch

- protected-main event가 자동 dispatch를 발생시킨다.
- registry에 등록된 bounded mission과 workflow만 실행한다.
- manual dispatch는 break-glass, recovery, diagnostics이며 정상 자동 완료율에 합산하지 않는다.

### 3.4 Immutable Artifact

- artifact는 trigger SHA, workflow run ID, input digest, schema version, producer, timestamp, integrity digest를 포함한다.
- upstream artifact가 없거나 digest가 다르면 downstream은 fail-closed한다.
- artifact 존재는 empirical truth admission과 별개다.

### 3.5 KPMO Governed Status Receipt

- 실행·거부·결손·재시도·rollback·escalation을 함께 기록한다.
- 네 Constitution effect와 evidence reference를 포함한다.
- `SUCCESS`는 정의된 workflow가 성공했다는 뜻이지 시장·고객·Production 성공을 뜻하지 않는다.

## 4. Authority Envelope

| Authority class | Agent가 가능한 행동 | 인간 승인 없이는 불가한 행동 |
|---|---|---|
| A0 Read | repository·artifact·public metadata read | private credential 획득 |
| A1 Prepare | schema·plan·Draft·validator·synthetic test | external commitment |
| A2 Internal Execute | rights-free internal computation·fail-closed QA | live provider ingestion |
| A3 Controlled Staging | 승인된 exact scope·credential·rollback 내 실행 | scope 확대·Production cutover |
| A4 Human Gate | 승인·거절·예외·계약·비용 결정 | Agent self-approval |
| A5 Production/G5 | 명시적 Program Owner authority | 자동 승격 |

Authority는 task success에 따라 상향되지 않는다. 권한이 없으면 시스템은 `BLOCKED_BY_AUTHORITY` receipt를 생성하고 종료한다.

## 5. Data·Evidence Plane

Architecture의 canonical 흐름은 다음과 같다.

`Source Candidate → Source Qualification → Observation → Evidence Package → Candidate/Evidence Pair → Assessment → Projection → Portal/EOS`

각 경계의 최소 계약은 다음과 같다.

| Boundary | 필수 입력 | Fail-closed 조건 |
|---|---|---|
| Source Qualification | owner, factual origin, jurisdiction, robots/terms, purpose | owner·purpose·rights UNKNOWN |
| Observation | object ID, event time, source, field, acquisition receipt | dated event 또는 provenance 없음 |
| Evidence Package | integrity, rights, retention, lineage, corroboration | rights·digest·field scope 결손 |
| Candidate/Evidence | immutable exact pair | 한쪽 없음·digest mismatch |
| Assessment | approved pair, method version, explainability | Track B 시작조건 미충족 |
| Projection | Assessment lineage, confidence, rankability, approval | approval·rankability·lineage 결손 |
| Portal/EOS | approved Projection only | raw candidate·unapproved output |

`Confidence != Rankability`를 구조로 강제한다. confidence가 높아도 비교 기준, coverage, missingness, rights가 충족되지 않으면 rankable하지 않다.

## 6. Provider-switchable Internal Core

외부 Provider는 adapter boundary 밖에 둔다.

| Provider layer | Internal Core |
|---|---|
| authentication·rate limit·transport | identity·canonicalization |
| provider-specific schema | normalized object·event model |
| source-specific availability | provenance·rights interpretation |
| commercial pricing | evidence admission·methodology |
| SLA·coverage | confidence·rankability |
| termination behavior | Projection·decision history·memory |

Provider 교체시험은 단순 endpoint switch가 아니다. 동일 bounded workload에서 input coverage, field semantics, rights, latency, cost, quality, reproducibility, exit residue를 비교해야 한다.

Provider status가 `UNKNOWN`이면 adapter는 `PRIVATE_ONLY / DISABLED`를 유지한다. 계약 협상 승인만으로 credential 또는 ingestion을 활성화하지 않는다.

## 7. Current P0–P3 Control Chain

현재 protected main의 통제 chain은 다음과 같이 분류한다.

| Stage | Current evidence | Architecture 판정 |
|---|---|---|
| P0 Trust·Admission | trust-root migration, SSRF-safe preflight, monotonic validation | INTERNAL CONTROL ESTABLISHED |
| P1 Control-plane·Staging | Draft #1141·#1142 | EXTERNAL/REMOTE HOLD |
| P2 Source Intelligence | owned-source graph v2: 2,774 nodes·6,278 edges·482 candidates·192 missions | CONTROL/SOURCE INTELLIGENCE ONLY |
| P3 Snapshot Readiness Factory v2 | current-chain contract, registry, validator, automation, rolling counts | READINESS CONTROL; NO SNAPSHOT |

P0–P3는 작업 및 control-plane 단계명이다. C0–C5 성숙도와 동일하지 않으며 P3 진전이 C2 승격을 의미하지 않는다.

현재 empirical state는 GRADED 0/120, human review 0, lawful dated-SOLD 0, Candidate/Evidence NONE, Track B NOT STARTED, approved Projection NONE다.

## 8. AI Governance Registry

모든 Agent·Engine·Workflow 등록은 최소 다음 필드를 가진다.

- owner와 accountable human
- authority class와 allowed mutations
- input/output schema와 evidence class
- source·rights·retention requirements
- failure state와 escalation route
- trigger mode와 manual break-glass flag
- artifact name, digest, retention, provenance
- rollback target과 recovery procedure
- `autonomous_effect`
- `global_effect`
- `irreplaceable_value_effect`
- `transparency_effect`

등록되지 않은 workflow는 canonical status를 발행할 수 없다. registry validation 성공은 해당 workflow의 external permission이나 empirical input을 보장하지 않는다.

## 9. Security와 External Control-plane

내부 통제 PASS와 외부 binding은 분리한다.

현재 #881은 외부 proof 결손 때문에 partner ingestion 관점에서 HOLD다. #1141 read-back 기준 secret-bearing jobs의 external binding은 0/15이며, Environment/ruleset/secret-scope의 실제 변경은 인간 승인 영역이다.

External control-plane acceptance에는 다음이 필요하다.

1. job-level Environment binding
2. trusted-ref enforcement
3. least-privilege secret scope
4. exact SHA and immutable action references
5. runtime and install integrity
6. read-back receipt from GitHub control plane
7. failure injection과 no-secret-on-untrusted-ref proof

문서 또는 local validator만으로 external state를 `VERIFIED`로 표시하지 않는다.

## 10. STAGING·Projection·Portal

STAGING은 Production의 축소판이 아니라 별도 승인·receipt domain이다.

Remote STAGING acceptance bundle은 다음을 포함한다.

- Program Owner가 승인한 실행창과 exact scope
- exact protected-main SHA
- `NO_PROJECTION` 또는 승인 Projection ID
- release artifact digest와 provenance
- remote health receipt
- pre-cutover rollback target
- rollback execution 또는 validated dry-run receipt
- credential scope와 secret exposure 0 증거

#1142는 local receipt contract를 검증했지만 remote deployment는 0이다. #921의 remote health·rollback receipt 전에는 STAGING ready를 주장하지 않는다.

Portal은 `Brand Surface + Product Interface + Market Sensor`다. 그러나 consumer boundary는 Projection-only다. Portal/API/export 세 경로 모두 unapproved Projection, raw Candidate, missing lineage, rights violation을 거부해야 한다. #1139는 이 경계를 다루지만 current-main reproof가 필요하다.

## 11. Observability와 Truthful Status

관측성은 로그의 양이 아니라 다음 질문에 답하는 능력이다.

- 무엇이 어떤 SHA에서 실행됐는가?
- 어떤 입력 artifact와 rights state를 사용했는가?
- 어떤 결정을 왜 거부했는가?
- 무엇이 missing 또는 UNKNOWN인가?
- 누가 어떤 Gate를 승인했는가?
- rollback target과 실제 복구 결과는 무엇인가?

Status vocabulary는 Baseline과 동일하게 사용한다. `VERIFIED`, `PARTIAL`, `BLOCKED`, `UNKNOWN`, `NOT STARTED`, `HOLD`를 증거보다 강하게 표현하지 않는다.

## 12. Recovery와 Rollback Architecture

Rollback은 배포 후 생각하는 비상절차가 아니라 mutation 전 계약이다.

| Failure domain | Recovery unit | Required receipt |
|---|---|---|
| Documentation | file/commit revert | changed paths·parent SHA |
| Workflow | workflow commit revert·disable | trigger SHA·run ID |
| Registry | prior registry digest | before/after validation |
| Artifact | reject and regenerate | producer·input·digest |
| STAGING | prior release target | remote health·rollback result |
| Provider | adapter disable·fallback | rights·data residue·exit status |
| Projection | revoke/unpublish | Projection ID·consumer purge |
| Production | G5 governed rollback | release·health·decision receipt |

Rollback이 입증되지 않은 mutation은 다음 Gate로 이동하지 않는다.

## 13. KIDULTS Bounded Implementation Profile

KIDULTS는 위 enterprise architecture를 collector-market intelligence에 제한 적용한다.

- object: collectible product and market identity
- event: rights-admitted dated market observation
- Evidence: field×purpose provenance and retention
- Assessment: Track B의 설명 가능한 비교·평가
- Projection: approval-bound decision surface
- consumer: private Portal/EOS
- provider: switchable adapter, internal Core retained

현재 source graph와 readiness factory는 profile의 control preparation이다. 적법한 dated-SOLD와 immutable Candidate/Evidence가 없으므로 Track B 이후의 runtime path는 fail-closed 상태가 맞다.

## 14. Decision Mapping

| 결정 | Architecture 적용 | Gate |
|---|---|---|
| PC-A-G-I-T | 네 Constitution effect의 고정 순서와 receipt | G0 |
| EVIDENCE-ADMISSION-FLOOR | rights·provenance·integrity 없이는 Evidence admission 금지 | G1 |
| HUMAN-GATE-PRESERVATION | legal·security·credential·STAGING·Production 권한의 human control | G1–G5 |
| AUTONOMOUS-NORMAL-PATH | protected-main 기반 auto dispatch만 정상경로 | G0–G4 |
| PROJECTION-ONLY-CONSUMER | Portal/API/export에서 승인 Projection만 허용 | G3 |
| NO-FOURTH-BOOK | 세 공식 Book 외 architecture canon 생성 금지 | Editorial governance |

## 15. Architecture Update Note

이 장은 새로운 runtime을 배포하지 않는다. EVIA 목표 Canon에 current P0–P3 control chain, external control-plane gap, P3 readiness factory v2, Projection-only consumer, remote STAGING receipt 경계를 문서로 결속한다.

Current main의 구조를 empirical completion으로 승격하지 않으며, G5 HOLD를 변경하지 않는다.

## 16. Source Inheritance

이 장은 이전에 제공된 EVIA/Architecture Book을 enterprise target canon으로 승계한다. Architecture 제1장 `Observation to Governed Projection`, Intelligence Holdings Master, Enterprise Baseline, `coordination/kidults/`, Platform Constitution, AI Governance registry, canonical issues와 merged control records를 이어받는다.

상충 시 protected main의 canonical evidence, rights/provenance floor, 인간 통제 Gate를 우선한다.

## 17. Book Sync Report

| Book | 현재 장 수 | Architecture 결속 |
|---|---:|---|
| Master | 3/3 | Intelligence Economy·Knowledge Capital을 Shared Core와 portfolio boundary로 구현 |
| Baseline | 3/3 | evidence class·status·gap·gate를 runtime state machine과 receipt에 적용 |
| Architecture | 3/3 | governed autonomy와 current P0–P3 control chain 정리 |

Book Sync 상태는 `REVIEW_SET_FROZEN / 3_OF_3`다. 제3장 작성 전 종합 리뷰·완료·full alignment를 선언하지 않는다.

## 18. Rollback

이 장은 독립 Markdown 파일 한 개다. 삭제 또는 해당 commit revert로 복원할 수 있다. runtime, workflow, registry, provider, rights, credential, security trust-root, Portal, STAGING, Public, Production, G5에는 변경을 가하지 않는다.

