# Intelligence Holdings 엔터프라이즈 아키텍처 북 — 제1장: Enterprise Flow와 KIDULTS Bounded Profile

**판본일:** 2026-08-23 KST  
**문서:** Intelligence Holdings Enterprise Architecture Book / EVIA successor  
**트랙:** KPMO / Architecture / Tracks A–E  
**의사결정 ID:** `KIDULTS-POSITIONING-V1-20260822`; `KIDULTS-COMPETITIVENESS-V1-20260822`; `KIDULTS-PLATFORM-PRINCIPLES-V1-20260823` (MERGED_VERIFIED / protected main `1109a98c…`)  
**스냅샷 ID:** N/A — Architecture 장이며, Candidate/Evidence pair가 존재하지 않음  
**문장 분류:** TARGET ARCHITECTURE — 구현된 통제는 별도로 명시하며, 이 장은 Production 증명이 아님  
**Gate 상태:** C1 확립; C2 미완료; Production/Public/G5 HOLD  
**증거 참조:** #235, #236, #237, #238, #240, #256, #881, #921, #1013, #1074, #1080, #1106, #1107, #1108, #1113, #1115, #1116, #1117, Platform Constitution commit; protected main `1109a98ce4cbdd68953d913fbddfb3b803809a0a`

## 1. Enterprise Architecture Canon과 적용 범위

이 책은 John이 전달한 `EVIA Canon Edition 1.0 — Volume 3 Enterprise Architecture Book`을 Intelligence Holdings의 공식 선행 아키텍처 원전으로 승계한다. EVIA의 전사 흐름, Layer·Contract 경계, Asset lifecycle, Explainability, Autonomous Operating Model과 Recovery discipline은 목표 기업 아키텍처의 기준이다.

이 장에서 최신 GitHub evidence로 직접 검증되는 것은 Intelligence Holdings 전체 Production architecture가 아니라 **KIDULTS의 bounded implementation profile**이다. 따라서 아래 Source→Projection 흐름, AI Governance binding과 Scale Wave는 기업 Canon을 KIDULTS에 적용한 Profile이며, 다른 Portfolio 구현 상태는 각자의 canonical evidence가 연결되기 전까지 `UNKNOWN`이다. TARGET architecture와 VERIFIED implementation을 서로 승격하지 않는다.

Enterprise architecture는 발견량, 데이터 규모, Confidence, Provider 또는 사용자 인터페이스 가운데 어느 것도 스스로 진실을 승인하지 못하도록 통제하면서, 파편화된 글로벌 관측을 재현 가능한 고객 Intelligence로 전환해야 한다.

KIDULTS bounded profile의 불변 처리 흐름은 다음과 같다.

`Discover → Screen → Reverify → Admit → Normalize → Resolve Identity → Pair Evidence → Assess Independently → Project → Render → Decide → Audit`

모든 전환은 명시적이고, 버전이 관리되며, 되돌릴 수 있어야 한다. 실패하거나 필요한 항목이 존재하지 않으면 그 이후 단계의 주장은 닫힌다.

## 2. Intelligence Holdings 최상위 운영원칙의 실행 아키텍처

네 최상위 원칙은 선언이 아니라 서로 다른 통제 책임을 갖는 하나의 운영계약이다. 전략적 순서는 **Autonomous → Global → Irreplaceable Value → Transparent**로 고정한다. 네 원칙은 모두 필수이며, Transparent는 다른 세 원칙 전체에 적용되는 비면제 통제다.

| 원칙 | 아키텍처 책임 | 최소 실행 증거 | Fail-closed 경계 |
|---|---|---|---|
| **Autonomous** | 승인된 의도를 Scheduler, Queue, Lease, Retry, Health, Idempotency, Fencing, Incident, Recovery와 Rollback으로 지속 실행한다 | Automation ID, Trigger/Main SHA, Run·Cycle ID, Owner, Authority boundary, Health, immutable Artifact와 KPMO Receipt | 실행 메커니즘·Artifact·Receipt 중 하나라도 없으면 자동 실행 또는 완료를 주장하지 않는다 |
| **Global** | Region, Language, Currency, Venue, Source, Category, Institution과 Jurisdiction 차이를 Canonical schema와 policy로 다룬다 | Coverage와 exclusion, locale/currency rule, source-rights jurisdiction, freshness와 limitation | 한 시장의 가정·권리·결손을 전 세계의 사실로 확장하지 않는다 |
| **Irreplaceable Value** | Identity, Ontology, Evidence/Market/Rights Graph, Method, Confidence/Rankability, Projection, Decision History를 Provider-switchable internal Core로 누적한다 | 반복 가능한 Decision improvement, customer outcome, reuse, switching/replacement evidence | 독점 Feed, Provider Lock-in, Record 수 또는 근거 없는 리더십을 가치 증거로 사용하지 않는다 |
| **Transparent** | FACT / INFERENCE / PLAN / UNKNOWN, Provenance, Rights, Method version, Freshness, Limitation, Decision, Correction과 Next action을 모든 경계에서 노출한다 | Source reference, status vocabulary, transformation lineage, correction history, governed receipt | 불확실성·오류·권리결손·승인경계를 숨기거나 더 강한 상태로 렌더링하지 않는다 |

Autonomous의 정상 운영 루프는 다음과 같다.

`PR Merge → Protected-main Push → Scale Wave Auto Dispatch → Immutable Artifact → KPMO Governed Status Receipt`

Protected main의 PR 병합과 push가 Scale Wave를 자동으로 시작해야 하며, 사람이 매번 `Run workflow`를 누르는 경로에 정상 운영이 의존해서는 안 된다. Manual dispatch는 Break-glass·복구·진단에만 남긴다. 동일 main SHA에 대한 중복 실행은 Deduplication과 Concurrency control로 통제하고, 실패는 이유가 기록된 Receipt와 재시도·복구 경로를 남긴다.

Artifact는 입력 Main SHA, Workflow/Run/Cycle ID, 실행된 Scope, 결과, Check, Limitation, Child artifact reference, Rollback target과 네 Constitution 효과를 포함한다. KPMO Receipt는 `autonomous_effect`, `global_effect`, `irreplaceable_value_effect`, `transparency_effect`를 필수로 기록하고 해당 Artifact를 AI Governance 상태어휘로 해석해 `IMPLEMENTED_NOT_VERIFIED`, `RUNNING_VERIFIED`, `VERIFIED_PASS`, `BLOCKED` 등을 구분한다. Artifact나 Receipt가 없으면 완료로 승격하지 않는다.

자동 실행은 권한의 자동 확대가 아니다. Evidence admission, Rights, 개인정보, 계약·지출, Credential 활성화, Trust-root, Public release, Production과 G5는 각각의 명시적인 Authority와 Human accountability를 계속 요구한다. Scale Wave는 이 Gate를 우회하거나 자체 승인할 수 없다.

현재 **VERIFIED CURRENT STATE**는 protected main `1109a98c…`가 네 원칙을 Platform Constitution으로 고정하고, 전 Track·AI Agent·Workflow·Runtime의 상속과 자동 Scale Wave trigger를 machine contract·registry·validator에 결속했다는 것이다. 그러나 개별 main-triggered 실행은 해당 SHA의 immutable Artifact와 KPMO governed Receipt가 검증되기 전까지 완료 상태로 표현하지 않는다.

## 3. 3단계 수집 통제

### Gate A1 — ASI 유입 선별

ASI는 발견된 Candidate를 수집하거나 분석에 사용하기 전에 분류한다. Source family, Evidence role, Provenance, Rights state, Freshness, 예상 제품 용도를 보수적으로 선별한다.

산출물: Candidate metadata와 명시적인 허용·보류·거절 사유.

경계: 발견은 수집 허가가 아니며 Evidence도 아니다.

### Gate A2 — 독립 재검증

두 번째 통제 단계는 Admission에 필요한 중요 사실을 독립적으로 다시 검증한다. Gate A1의 결정 자체를 Evidence로 재사용해서는 안 된다.

산출물: Candidate 및 Rule version에 결속된 재검증 기록.

경계: 재검증에 성공하더라도 해당 Source가 부여하지 않은 권리가 새로 생기지는 않는다.

### Gate A3 — 목적과 범위가 제한된 Admission

Admission은 명시적으로 허용된 목적과 필드에 대해서만 이루어진다. 수집, 저장, 파생, 내부 표시, 공개 표시, Export는 서로 분리된 권리 차원이다. 권리가 `UNKNOWN`이면 Fail-closed 처리한다.

산출물: Admission된 Observation metadata, Provenance, Rights horizon, Retention, 허용된 Transformation state.

경계: 비공개 Evidence pool에 Admission되었다는 사실은 제품 공개를 의미하지 않는다.

## 4. 내부 Core와 Provider의 경계

KIDULTS는 Provider가 달라져도 지속적으로 축적되는 다음 구성요소를 내부에서 소유해야 한다.

- Source Registry와 Collection Framework
- Canonical Identity와 Entity Resolution
- KIDULTS Ontology와 Normalization
- Evidence Graph, Market Observation Graph, Rights Graph
- Evidence Admission, Corroboration, Freshness, Limitations
- Comparable-distance logic
- Confidence와 Rankability contract
- Derived analytics
- Projection schema와 생성 체계
- Provider switching 및 replacement test
- Audit, Observability, Rollback, Release Governance

외부 Provider는 승인된 Observation, Feed, Image, Grading/Condition data 또는 Specialist opinion을 제공할 수 있다. Raw payload와 Provider 제한이 적용되는 Payload는 명시적인 Retention rule에 따라 목적이 제한된 비공개 저장소에 보관한다. KIDULTS가 파생한 구조는 Lineage와 Permitted-use metadata를 포함해 별도로 저장한다.

어떤 Provider도 KIDULTS의 System of Record가 될 수 없다. Provider를 교체할 때는 Evidence, Rights, Freshness, Output quality를 다시 검증하면서 공개된 분석 문법은 유지해야 한다.

## 5. Canonical Data Plane

| Plane | 구성 내용 | Release 경계 |
|---|---|---|
| Discovery plane | URL, Candidate metadata, Source-family 및 Evidence-role 가설 | 고객 Evidence로 사용 금지 |
| Private source plane | 승인된 Raw observation과 Source-specific metadata | 목적과 Retention 제한 적용 |
| Canonical object plane | 해소된 Identity, Maker/Model/Variant/Year, 상태 이력 | Field state 필수 |
| Evidence plane | Claim-to-source lineage, Corroboration, Date, Transformation, Limitation | 정확한 Reference 필수 |
| Rights plane | Collect/Store/Derive/Display/Export 권한과 만료 상태 | 권리가 `UNKNOWN`이거나 만료되면 해당 Field를 닫음 |
| Assessment plane | 하나의 정확한 Immutable pair에 결속된 Track B 결과 | Track B는 입력을 변경할 수 없음 |
| Projection plane | 승인된 고객 표시 Field, Method, Confidence, Freshness, Limitation, Receipt ID | Portal/EOS가 사용할 수 있는 유일한 Intelligence input |
| Decision/audit plane | 사용자 행동, Release decision, Receipt, Incident, Rollback history | 추가만 허용되는 책임추적 기록 |

이들 Plane 전체에서 Missing은 계속 Missing으로 유지된다. 어떤 Adapter, Database default, Calculation, Interface도 Missing을 암묵적으로 0으로 바꿔서는 안 된다.

## 6. Immutable Candidate/Evidence 인계

Track A는 정확히 두 개의 공식 입력을 산출한다.

1. `snapshot-candidate.json`
2. Evidence Package

두 입력은 Immutable identity, Methodology, Evidence-lineage binding을 공유해야 한다. Track A는 스스로 Rankability를 승인할 수 없다. Track B는 정확히 일치하는 Pair만 입력으로 받고, 이를 변경하지 않은 상태에서 검증한 후 하나의 `rankability-assessment.json`만 산출한다.

두 입력 중 하나라도 없거나, 서로 일치하지 않거나, 변경 가능하거나, Rights상 Admission될 수 없거나, Stale 상태이면 Track B를 시작하지 않는다.

## 7. Confidence와 Rankability

Confidence가 답하는 질문은 다음과 같다.

*Admission된 Evidence가 이 Field 또는 Claim을 얼마나 강하게 뒷받침하는가?*

Rankability가 답하는 질문은 다음과 같다.

*이 Evidence와 Method가 선언된 목적에 따른 비교, 순위화 또는 Release에 적합한가?*

Identity claim의 Confidence가 높더라도 Market claim은 Rankable하지 않을 수 있다. 이 두 상태는 Schema, Rule, Interface, Audit record에서 반드시 분리되어야 한다.

## 8. 통제된 Projection

Projection은 제품 표면으로 전달되는 유일한 Intelligence contract다. Projection은 다음을 하나의 계약으로 묶는다.

- Product와 Universe
- 정확한 Filter와 Period
- Axis와 Unit
- 승인된 Value 또는 명시적인 Missing state
- Source count와 Independence
- Confidence와 Rankability
- Observation timestamp와 Update timestamp
- Freshness policy
- Rights와 Limitation
- Method version
- Evidence, Assessment, Release, Rollback reference
- 검증 가능한 Runtime receipt

Portal과 IH-EOS는 Projection을 소비한다. 순위를 자체 계산하거나, Provider payload를 재해석하거나, 상태를 더 강한 상태로 승격하거나, Missing value를 추론하지 않는다.

#1074의 Projection contract와 #1080의 Executable consumer binding은 Canonical repository에서 여전히 Draft/open 상태다. 따라서 이 아키텍처는 요구되는 경계를 정의할 뿐, 승인된 Live implementation이 존재한다고 주장하지 않는다.

## 9. Portal과 EOS의 책임

Portal은 **Brand Surface + Product Interface + Market Sensor**다.

- Brand Surface로서 Category와 Trust model을 설명한다.
- Product Interface로서 Governed state, Evidence, Filter, Comparison, Monitoring, Next action을 제시한다.
- Market Sensor로서 허용된 범위 안에서 고객의 Intent와 Product interaction을 기록하되, 그 행동을 승인되지 않은 Intelligence로 변환하지 않는다.

IH-EOS는 등록된 Program, Blocker, Gate, Outcome, Projection state를 소비하여 Founder가 현재 상태를 이해하고 의사결정할 수 있게 한다. 두 Surface 모두 Intelligence producer가 되지 않는다.

## 10. Security와 운영 통제

- LOCAL → DEV → STAGING → PRODUCTION은 계속 분리한다.
- Credential과 Signing key를 Commit하거나 Registry에 복사하지 않는다.
- Provider access는 Rights와 Owner authorization이 모두 확보된 후에만 활성화한다.
- Security 또는 Trust-root migration에는 명시적인 승인과 최신 Protected-main 증명이 필요하다.
- 모든 Deploy, Rollback, Incident, Recovery는 Audit receipt를 생성한다.
- 검증된 Rollback target과 명시적인 G5가 없으면 Production deployment를 시작하지 않는다.
- Incident가 발생하면 Recovery와 Root-cause closure가 완료될 때까지 Promotion을 중단한다.
- Log에는 운영 Reason code와 Correlation ID를 남기되, 제한된 Payload나 Credential은 노출하지 않는다.

승인 Gate가 적용되는 Trust-root migration이 병합되지 않은 동안 #881은 `CONTROL PASS SUSPENDED` 상태를 유지한다. Draft에서의 증명은 Release authority가 아니다.

## 11. 아키텍처 업데이트 노트(Architecture Update Note)

| 문장 분류 | 현재 아키텍처상의 의미 |
|---|---|
| **VERIFIED CURRENT STATE** | #1106은 Governed Common Crawl public-index traversal을 Pre-Gate 1 통제 경로에 결속한다. #1113은 Deterministic 256-shard metadata reserve와 100k Synthetic design-capacity proof를 추가한다. #1107은 Common-Crawl이 보강된 Hourly Gate 1→2→3 rolling-pool v2를 Current main에 배치한다. #1108은 v1을 Retirement하기 전에 서로 구분되는 두 개의 성공한 Main-branch v2 cycle artifact를 요구한다. #1115는 OpenAlex/GDELT public-metadata scale, provider-health routing과 rolling reserve increment를 하나의 통제경로로 통합한다. #1116은 두 개의 main v2 cycle을 순차 실행하고 exact-pair readiness를 검증하는 dispatcher를 배치한다. |
| **UNKNOWN / NOT ESTABLISHED** | #1116이 main에서 생성해야 하는 두 개의 실제 cycle receipt와 최종 promotion-readiness artifact는 이 기준 시각에 아직 검증되지 않았다. 따라서 v1 retirement는 차단된다. #1109–#1112는 병합되지 않은 채 #1115/#1116으로 대체되어 종료됐다. |
| **TARGET** | 적법한 Source admission, Immutable Candidate/Evidence pair, Track B assessment, Governed Projection, Customer acceptance, 명시적인 G5 |
| **PROPOSAL** | 병합되지 않은 Adapter, Provider, Schema 또는 운영 변경은 정상적인 Gate를 통과하기 전까지 비권위적 상태로 유지된다. |

256-shard와 100k 결과는 Synthetic input을 사용한 Control-path design-capacity evidence다. 이는 100k개의 적법한 Source, Market observation, Safe Pool entry, Customer evidence 또는 Release readiness를 의미하지 않는다.

병합된 Source control은 적법한 GRADED label, Collection/Display rights, Immutable pair, Track B assessment 또는 승인된 Projection을 생성하지 않으므로 Promotion state는 바뀌지 않는다.

## 12. 의사결정 매핑(Decision Mapping)

| 의사결정 / Issue | 아키텍처상의 책임 |
|---|---|
| `KIDULTS-POSITIONING-V1-20260822` | Product promise는 점검 가능한 System state로 연결되어야 함 |
| `KIDULTS-COMPETITIVENESS-V1-20260822` | Provider-switchable Governed decision layer는 내부 Core로 유지 |
| `KIDULTS-PLATFORM-PRINCIPLES-V1-20260823` | 네 원칙의 Constitution, 의무 상속, 네 효과 metadata와 main-push Scale Wave·Artifact·KPMO Receipt 경계를 정의함; main `1109a98c…` authority |
| #235 | Immutable하고 Evidence-backed인 입력 산출 |
| #236 | 정확한 Pair를 독립적으로 Assessment |
| #237 / #1080 | 의미상 유효하며 승인된 Projection만 Render |
| #240 / #921 | Production 이전에 STAGING에서 운영·관측·복구하고 Rollback을 증명 |
| #256 | Founder의 의사결정을 위해 등록된 진실을 소비 |
| #238 | Track 간 Promotion과 G5 경계 강제 |

## 13. 원전 승계와 Architecture Canon

이 장은 John이 보관해 전달한 `EVIA Canon Edition 1.0 — Volume 3 Enterprise Architecture Book` 전체와 기존 Architecture 문서 형식을 공식 선행 원전으로 승계한다. 새 문서 체계를 다시 만드는 것이 아니라, 원전의 Intelligence Holdings 기업 구조를 현재 KIDULTS Canonical Evidence와 AI Governance에 연결해 v2로 발전시킨다.

승계하는 핵심은 다음과 같다.

- `Source → Collection → Evidence → Knowledge → Intelligence → Decision → Asset`의 Layer boundary와 책임 분리;
- Candidate → Reviewed → Promoted → Monitored → Deprecated → Retired의 통제된 Asset lifecycle;
- Explainability, Versioning, Override와 Decision trace;
- Scheduler, Queue, Lease, Retry, Health, Idempotency/Fencing, Incident, Audit와 Recovery를 포함한 Autonomous Operating Model;
- Local 성공, 문서 존재 또는 자동화 선언을 Production 증거로 승격하지 않는 Evidence discipline.

원전의 철학·구조·문서 위계와 편집 형식은 보존한다. 다만 과거의 상태, Portfolio, Provider, 수치 또는 Runtime claim이 현재 Registry·Protected-main·Canonical issue와 충돌하면 원전은 역사적 Source lineage로 남기고 최신 검증 사실을 적용한다. No Fourth Book 원칙 아래 Runbook, Workflow, Receipt와 Decision record는 Architecture Book의 재현 증거이지 별도 Book이 아니다.

## 14. 북 동기화 보고서(Book Sync Report)

- **Master Book:** Intelligence Holdings의 기업 정체성·Intelligence Economy·Knowledge Capital doctrine을 이 EVIA 기업 Canon의 실행 구조에 연결한다. KIDULTS 고객가치와 Product claim은 이 장의 bounded Projection 및 Evidence 경계에 연결된다.
- **Baseline Book:** Enterprise Baseline의 증거 위계를 따르며, 현재 KIDULTS 슬라이스의 모든 `NONE`, `NOT STARTED`, `OPEN`, `HOLD`, Blocked state는 그대로 표시하고 전사 상태로 일반화하지 않는다.
- **No Fourth Book:** 유지한다. Runbook, Issue ledger, Decision record는 세 권의 Book을 지원하지만 별도의 Book이 되지 않는다.
- **장 누적 상태:** Architecture 1/3. 세 Book 모두 3/3에 도달하기 전에는 종합 리뷰를 수행하지 않음.
- **Sync state:** `EVIA ENTERPRISE CANON INHERITED; KIDULTS BOUNDED PROFILE ALIGNED TO CANONICAL PROTECTED MAIN 1109a98c AT 2026-08-23 11:08 KST; PLATFORM CONSTITUTION v1.1 AND AUTO SCALE TRIGGERS MERGED; PER-RUN ARTIFACT, FOUR EFFECTS AND KPMO RECEIPT REQUIRED`.

## 15. 롤백(Rollback)

이 장의 파일을 Revert한다. 이번 변경은 Documentation-only이며 Code, Data, Registry pointer, Provider, Credential, Rights, Runtime, Trust root, Public release 또는 Production을 변경하지 않는다.
