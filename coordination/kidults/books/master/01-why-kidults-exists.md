# 마스터 북(Master Book) — 제1장: KIDULTS가 존재하는 이유

**판본 일자:** 2026-08-23 KST  
**도서:** 마스터 북(Master Book)  
**트랙(Track):** KPMO / Product / Brand  
**의사결정 ID:** `KIDULTS-POSITIONING-V1-20260822`; `KIDULTS-COMPETITIVENESS-V1-20260822`  
**Snapshot ID:** N/A — 전략 장이며, 어떠한 데이터 Snapshot도 존재한다고 주장하지 않음  
**문장 분류:** TARGET / GOVERNING DOCTRINE — 현재의 실증 또는 시장 주장이 아닌 전략적 의도  
**Gate 상태:** C1 Product Contract 실질적 확립; C2 미완료; Production/Public/G5 HOLD  
**Evidence 참조:** #235, #236, #237, #238, #240, #256, #1061, #1117, Draft #1118; protected main `d050d8b993929a883298e7cb90ea22bc97ec6ae1`

## 1. 존재 목적

KIDULTS의 목표이자 가치는 **보이지 않는 것을 보이게 만드는 것**이다.

컬렉터블 오브젝트는 문화와 시장을 연결하지만, 이를 이해하는 데 필요한 정보는 카탈로그, 리스팅, 아카이브, 그레이더, 전문가, 소유자, 이미지와 거래 기록 곳곳에 분산되어 있다. Identity는 모호할 수 있고, Condition과 Provenance는 불완전할 수 있다. 화면에 표시된 가격이 실제 거래 가격이라는 보장은 없다. 확신에 찬 설명이라도 Rankable하지 않을 수 있으며, 관측값의 부재가 0으로 잘못 해석될 수도 있다.

KIDULTS는 이러한 파편을 Collector와 Institution을 위한 통제되고 설명 가능한 인텔리전스로 전환한다. KIDULTS의 임무는 불확실성에 숫자를 붙여 그럴듯하게 꾸미는 것이 아니다. 다음을 명확하게 보여주는 것이 임무다.

- 무엇이 확인되었는가;
- 어떤 Evidence가 이를 뒷받침하는가;
- 그 Evidence는 얼마나 최신이며 실제 판단에 사용할 수 있는가;
- 무엇이 `UNAVAILABLE`, `INFERRED`, `STALE` 또는 `RIGHTS BLOCKED` 상태로 남아 있는가;
- 어떤 결론이 왜 Rankable하거나 Rankable하지 않은가; 그리고
- 사용자가 다음에 무엇을 책임 있게 할 수 있는가.

이를 지배하는 약속은 간결하다.

> 오브젝트를 알라. Evidence를 이해하라. 의사결정의 경계를 보라.

## 2. 최상위 운영원칙

KIDULTS는 다음 네 원칙을 이 순서대로 최상위 운영원칙으로 삼는다.

| 우선순위 | 원칙 | 경영적 의미 | 금지되는 오해 |
|---:|---|---|---|
| 1 | **Autonomous** | 승인된 의도를 지속적이고 경계가 명확하며 관측·복구 가능한 실행으로 전환한다 | 자율성을 무제한 권한, 무감사 자동화 또는 인간 책임의 제거로 해석하지 않는다 |
| 2 | **Global** | 지역·언어·통화·Venue·Source·Category·Institution의 차이를 수용하는 글로벌 구조를 만든다 | 한 시장의 가정, 권리 또는 데이터 결손을 보편적 진실로 확장하지 않는다 |
| 3 | **Irreplaceable Value** | Identity, Evidence, Methodology, Decision Grammar, Historical Memory와 Workflow Integration을 통해 이해관계자가 포기하기 어려운 실질적 효용을 만든다 | 독점 Feed, Provider 종속, 인위적 Lock-in, Record 수 또는 근거 없는 우월성을 가치로 간주하지 않는다 |
| 4 | **Transparent** | 상태, Evidence, Method, 불확실성, Rights, Limitation, Decision, Correction과 Next Action을 보이게 만든다 | 네 번째 순서라는 이유로 투명성을 선택 가능한 원칙으로 취급하지 않는다 |

이 순서는 전략적 우선순위를 고정하지만, 네 원칙 가운데 어느 것도 생략할 수 있다는 뜻이 아니다. **Transparent는 모든 원칙을 가로지르는 비면제 통제**다. Evidence, Rights, Security, Privacy, Contractual Authority, Human Accountability와 Production/G5 Gate는 네 원칙 모두를 제한한다.

**Irreplaceable Value는 현재 시장지위에 대한 주장이 아니라 장기적으로 입증해야 할 목표다.** KIDULTS는 제공자 종속이 아니라 Provider-switchable internal Core, 누적되는 Knowledge Capital과 실제 Decision Improvement로 그 가치를 증명해야 한다.

Autonomous는 다음의 닫힌 운영 루프로 구현한다.

`PR Merge → Protected-main Push → Scale Wave Auto Dispatch → Immutable Artifact → KPMO Governed Status Receipt`

정상 운영에서 사람이 매번 `Run workflow`를 누르는 것은 성공 조건이 아니다. Manual dispatch는 Break-glass, 복구 또는 진단을 위한 보조 경로로만 남긴다. 자동 실행은 중복 방지, 동시성 통제, 재시도, Health, Fencing, 불변 Artifact와 Receipt를 갖춰야 한다. 다만 자동화는 Evidence를 만들거나 권리를 추론하거나 상태를 승격하는 권한이 아니다. 계약·비용·Credential·Trust root·Public/Production/G5와 같이 명시적 인간 권한이 필요한 Gate는 계속 닫혀 있다.

## 3. 시장의 문제

컬렉터블 시장은 정돈된 증권시장처럼 작동하지 않는다. 같은 오브젝트가 서로 다른 이름, Variant 또는 Identifier로 나타날 수 있다. Venue, Currency, Date, Condition, Provenance와 Rights에 따라 하나의 Observation이 갖는 의미도 달라진다. 거래가 희소하고 공시 기준이 일관되지 않기 때문에 단순 비교는 신뢰하기 어렵다. 레코드 수가 많더라도 Evidence 품질은 낮을 수 있다.

이로 인해 두 가지 고객 문제가 발생한다.

Collector의 질문은 실용적이다. *이 오브젝트는 무엇인가, 무엇이 변했는가, 무엇과 비교할 수 있는가, 무엇을 검증해야 하는가, 그리고 어떤 Risk가 남아 있는가?*

Institution의 질문은 시스템적이다. *어떤 Universe를 포괄하는가, Evidence의 깊이와 집중도는 어느 정도인가, Method는 재현 가능한가, 모든 결론을 Audit할 수 있는가?*

KIDULTS는 서로 다른 두 개의 진실을 만들지 않으면서 두 고객 모두에게 답한다. 하나의 통제된 Evidence 기반이 두 가지 Decision Grammar를 지원한다.

- **Collector Lens:** 무엇이 변했는가(What changed) → 왜 중요한가(Why it matters) → Comparable 맥락(Comparable context) → Liquidity → Risk → 가능한 행동(Possible action).
- **Institutional Lens:** Universe → Coverage → Market scale → Depth → Turnover → Concentration → Exposure → Confidence.

## 4. 상품 포지션

KIDULTS는 통제형 컬렉터블 인텔리전스 플랫폼이다. Marketplace도, 가격만을 모은 Archive도, Grading Authority도, 불투명한 Recommendation Engine도, 합성된 Ranking Surface도 아니다.

KIDULTS가 소유하는 Decision Layer는 다음과 같다.

`Observation → Canonical Object → Evidence Admission → Independent Validation → Governed Projection → Decision Lens → Audit History`

대표 상품은 선행 의존조건에 따라 다음 순서로 전개된다.

1. **KIDULTS Object Passport**는 Canonical Identity, Provenance, Condition, Rights와 Audit History를 확립한다.
2. **KIDULTS Market Projection API**는 Lineage, Confidence, Freshness와 Limitations가 함께 기록된 승인 인텔리전스만 전달한다.
3. **Kidult 100 Index**는 Universe, Eligibility, Liquidity, Weighting, Concentration, Rebalance, Rights와 Restatement 규칙을 실증적으로 뒷받침할 수 있을 때에만 성립한다.
4. **KIDULTS Intelligence, Reports and Enterprise**는 이러한 기반을 Research, Monitoring, Collaboration과 Decision Workflow로 전환한다.

어떤 후보 상품도 Evidence, Rights, Independent Assessment, Projection, Experience, Runtime과 Approval Gate를 모두 통과하기 전에는 출시된 상품으로 표현하지 않는다.

## 5. 창출하는 가치

KIDULTS는 가장 많은 Raw Record를 보유하기 위해 경쟁하지 않는다. 파편화된 Observation과 방어 가능한 Action 사이의 통제된 Decision Layer를 소유하기 위해 경쟁한다.

| 이해관계자 | 제공 가치 |
|---|---|
| Collector | 오브젝트, Comparable 맥락, Evidence의 한계, Liquidity의 불확실성, Risk와 다음의 책임 있는 행동을 이해한다 |
| Institution | Universe를 정의하고, Coverage와 Concentration을 점검하며, Method를 재현하고, 공개된 모든 결론을 Audit한다 |
| Research partner | Claim을 Independent Evidence, Freshness, Rights, Transformation과 Limitations에 연결한다 |
| Data/platform partner | KIDULTS의 Identity, Confidence, Methodology 또는 System-of-Record 통제권을 이전받지 않고 승인 인텔리전스를 활용한다 |
| Provider/specialist | 명시적인 Rights, Retention, Provenance와 Exit 조건에 따라 범위가 제한된 Observation을 제공한다 |

지속 가능한 Moat는 하나의 Model이나 독점 Feed가 아니다. Object Graph, Evidence Graph, Market Observation Graph, Rights Graph, Confidence와 Rankability 통제, Projection Layer와 Decision History가 서로 연결되어 누적되는 구조다.

## 6. Portal 원칙

Portal은 동시에 세 가지 책임을 수행한다.

1. **Brand Surface** — KIDULTS의 진지함, 명료함과 문화적 범위를 표현한다.
2. **Product Interface** — 사용자가 통제된 인텔리전스를 점검하고, 비교하고, 필터링하고, 저장하고, 모니터링하며 이해할 수 있게 한다.
3. **Market Sensor** — 사용자가 실제로 필요로 하는 질문, 오브젝트, 필터, Evidence 경로와 행동을 드러낸다.

모든 선, 면, 단어, 폰트, 문장, 메시지, 숫자, 그래프와 컬러는 설명력을 높여야 한다. Interface는 Method, 신뢰 조건과 다음 행동을 명확히 읽을 수 있게 할 때에만 성공한 것이다. Editorial Image는 맥락을 형성할 수 있지만, 결코 Evidence가 되지 않는다.

## 7. 상품 및 브랜드 무결성

8개의 공식 Portfolio Brand는 기존 Portfolio Record의 통제를 계속 받는다. 이 장은 아홉 번째 Brand를 만들지 않으며, 기존 Brand의 명칭을 바꾸지 않고, Ownership, Trademark, Legal 또는 Commercial 상태를 변경하지 않는다.

KIDULTS의 표현 체계는 다음 원칙을 보존해야 한다.

- **Evidence Before Metrics**;
- **Missing is not zero**;
- **Confidence is not Rankability**;
- Generated/Editorial Image는 Market Evidence가 아니다;
- 현재의 측정값은 영구적인 우위를 의미하지 않는다;
- **Projection-only product rendering**;
- **Provider-switchable internal Core**; 그리고
- 근거 없는 보편적 리더십 표현을 배제한 Evidence-bounded Claim.

## 8. 성공의 의미

KIDULTS의 성공은 고객이 답뿐 아니라 그 답의 품질과 경계까지 볼 수 있을 때 시작된다. 이러한 명료함이 실제 의사결정을 반복적으로 개선하고, 신뢰를 얻으며, 유료 사용을 뒷받침하고, Provider와 Category가 달라져도 지속적으로 운영될 때 Commercial Success로 이어진다.

성숙도는 계속 Evidence에 따라 상승한다.

- **C1:** Product Contract;
- **C2:** Lawful Evidence Fabric;
- **C3:** Independently Validated Bounded Product;
- **C4:** 명시적 G5를 갖추고 반복적으로 사용할 수 있는 Market-ready Product;
- **C5:** 독립적인 Evidence로 입증된 Category Leadership.

현재 공식 상태는 C1이며 C2는 미완료다. 이 장은 현재 상태를 상향하지 않는다.

## 9. Decision Mapping

| Decision | 이 장에 미치는 효과 | Boundary |
|---|---|---|
| `KIDULTS-POSITIONING-V1-20260822` | Category, Audience, Product Family와 Value Proposition을 정의한다 | Live Claim 또는 출시 승인 없음 |
| `KIDULTS-COMPETITIVENESS-V1-20260822` | 통제된 Decision Layer와 Maturity Path를 정의한다 | Target, Traction 또는 우위를 만들어내지 않음 |
| `KIDULTS-PLATFORM-PRINCIPLES-V1-20260823` | Autonomous → Global → Irreplaceable Value → Transparent를 최상위 운영원칙으로 정의한다 | Draft #1118이며 병합·실행·시장지위 또는 G5를 의미하지 않음 |
| #239의 Three-Book Governance 및 Coordination Hub Rule 11 | Master, Baseline, Architecture만을 공식 Book으로 유지한다 | No Fourth Book — 네 번째 Book을 만들지 않음 |

## 10. 원전 승계 및 편집 기준

이 장은 새로 시작한 문서가 아니다. John이 전달한 기존 문서군을 공식 원전으로 승계하고, 현재의 검증된 운영체계와 연결해 v2로 발전시킨다.

- `Master_Book_Chapter_01_KO.docx`: 자율형 지식자본 회사, Mission, Vision, 인간 책임과 KAIOS 실행의 분리.
- `Master_Book_Chapter_02_The_Intelligence_Economy_KO.docx`: 정보에서 지식·인텔리전스·의사결정 인프라로 이동하는 가치사슬.
- `Master_Book_Chapter_03_The_Knowledge_Capital_Doctrine_KO.docx`: Evidence, Methodology, Organizational Memory와 반복 효용의 복리화.
- 기존 Baseline Chapter 1–3: 사실·해석·Target의 분리, E1–E4 증거 기준, Current State와 Production Readiness의 분리.
- `EVIA Canon Edition 1.0 — Volume 3 Enterprise Architecture Book`: Layer boundary, Asset lifecycle, Explainability, Autonomous Operating Model, Audit evidence와 Recovery control.

원전의 철학·구조·문서 형식은 보존하되, 오래된 Portfolio·상태·수치는 현재 Canonical Registry와 Protected-main Evidence로 대체한다. 검증되지 않은 과거 주장은 역사적 초안으로 보존하며 현재 사실로 승격하지 않는다.

## 11. Book Sync Report

- **Baseline Book dependency:** 현재 상태, Evidence Population, Blocker와 Gate는 사실에 근거하고 기준 일시가 명시되어야 한다.
- **Architecture Book dependency:** 모든 Product Promise는 재현 가능한 System Boundary로 연결되어야 한다.
- **Contradiction check:** Market Number, Provider Right, Candidate/Evidence Pair, Track B 결과, Live Projection 또는 Production Readiness를 주장하지 않는다.
- **Sync state:** ALIGNED TO CANONICAL PROTECTED MAIN `d050d8b9` AT 2026-08-23 11:08 KST; PLATFORM PRINCIPLES PROPOSED IN DRAFT #1118.

## 12. Rollback

Dated Documentation Branch에서 이 장을 삭제하거나 해당 단일 파일 Commit을 Revert한다. Rollback은 Runtime, Data, Provider Relationship, Rights Determination, Registry, Security Control, Public Release 또는 Production 상태를 변경하지 않는다.
