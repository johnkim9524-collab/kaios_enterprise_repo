# Intelligence Holdings 엔터프라이즈 베이스라인 북 — 제1장: 목적·증거기준과 KIDULTS 현재 검증 슬라이스

**기준 시각:** 2026-08-23 11:08 KST  
**책:** Intelligence Holdings Enterprise Baseline Book  
**담당 트랙:** KPMO / Tracks A–E  
**결정 ID:** `KIDULTS-POSITIONING-V1-20260822`; `KIDULTS-COMPETITIVENESS-V1-20260822`  
**스냅샷 ID:** N/A — 불변의 Candidate/Evidence pair가 존재하지 않음  
**문장 분류:** `VERIFIED CURRENT STATE` — 시점이 명시된 canonical 기록이며, 부재는 0이 아니라 missing으로 유지함  
**보호된 main:** Platform Constitution v1.1 이후 `1109a98ce4cbdd68953d913fbddfb3b803809a0a`  
**Gate 상태:** C1 확립; C2 미완료; Production/Public/G5 `HOLD`  
**Evidence 참조:** #235, #236, #237, #238, #240, #256, #881, #921, #1013, #1074, #1080, #1106, #1107, #1108, #1113, #1115, #1116, #1117, Platform Constitution commit `1109a98c…`

## 1. Baseline의 목적과 적용 범위

이 책은 Intelligence Holdings 전체를 대상으로 **현재 무엇이 실제로 존재하고, 무엇이 증명됐으며, 무엇이 아직 존재하지 않는지**를 확립하는 기업 기준서다. 기존 `Enterprise_Baseline_Book_Chapter_01–03_KO.docx`의 목적·증거 위계·상태 구분·진단 방법을 공식 원전으로 승계한다.

다만 이 장에서 최신 canonical GitHub evidence로 직접 검증할 수 있는 범위는 현재 **KIDULTS 프로그램 슬라이스**다. 따라서 아래 수치와 Gate는 Intelligence Holdings 전체의 보편 상태가 아니라 KIDULTS의 시점 고정 상태다. 다른 기업·Portfolio 영역은 각 영역의 E1/E2 증거가 연결되기 전까지 `UNKNOWN`이며, KIDULTS의 상태를 전사 상태로 일반화하지 않는다.

KIDULTS의 제품·거버넌스·범용 Runtime 기반은 상당한 수준으로 구축됐다. 그러나 독립적인 Track B Assessment를 시작하거나 승인된 라이브 Projection을 발행하는 데 필요한 적법한 실증 입력 쌍은 아직 확보되지 않았다.

현재 KIDULTS 검증 슬라이스의 정확한 상태는 다음과 같다.

> STRUCTURE READY / EMPIRICAL CHAIN NOT OPEN / CLAIMS CLOSED / Production HOLD

## 2. Intelligence Holdings AI Governance와 최상위 원칙의 현재 상태

| 항목 | 검증된 현재 상태 |
|---|---|
| Repository-wide AI honesty/transparency governance | **MERGED_VERIFIED** — #1117 및 Constitution v1.1, main `1109a98c…` |
| Human policy / machine contract / registry / validator | main에 존재; `KPMO-AI-GOV-001` v1.0.0 기준 |
| 네 최상위 운영원칙의 v1.1 machine binding | **MERGED_VERIFIED** — Platform Constitution, main `1109a98c…` |
| 자동 실행 계약의 구성·trigger | **MERGED_VERIFIED** — `PR Merge → Protected-main Push → Scale Wave Auto Dispatch → Immutable Artifact → KPMO Governed Status Receipt`, main `1109a98c…`; 개별 실행 결과는 Receipt별 검증 필요 |
| 운영원칙 순서 | TARGET / GOVERNING DOCTRINE — Autonomous → Global → Irreplaceable Value → Transparent |
| Empirical maturity / Production authority | 변경 없음 — C1, C2 미완료, Production/Public/G5 HOLD |

Protected main `1109a98c…`는 #1117의 정직·투명성 통제 위에 John이 정한 네 운영원칙을 Platform Constitution으로 승격하고, 모든 Track·AI Agent·Workflow·Runtime의 의무 상속과 자동 Scale Wave trigger를 결속했다. 이는 구성과 Governance의 `MERGED_VERIFIED` 상태다. 특정 run의 실행 성공은 해당 SHA의 immutable Artifact와 KPMO governed Receipt가 있을 때만 더 강한 상태로 승격한다.

자동 실행의 목표는 사람이 매번 `Run workflow`를 누르는 의존성을 제거하는 것이다. 그러나 Artifact와 KPMO Receipt가 실제로 생성되기 전에는 `RUNNING_VERIFIED`나 `COMPLETE_VERIFIED`로 승격하지 않는다. Manual dispatch는 Break-glass 또는 진단 수단으로만 남는다.

모든 중대한 PR, Issue, Workflow, Receipt와 KPMO Report는 다음 네 효과를 기록해야 한다: `autonomous_effect`, `global_effect`, `irreplaceable_value_effect`, `transparency_effect`. 하나라도 `UNKNOWN`이면 완전한 Platform alignment 또는 `COMPLETE_VERIFIED`를 주장하지 않는다.

## 3. 실증 Population

| Evidence 항목 | 검증된 상태 |
|---|---:|
| ER reviewer-ready records | 720 / 840 |
| Blind candidates | 360 / 420 |
| GRADED population | **0 / 120** |
| Human review records | **0** |
| 적법한 컬렉터 시장의 날짜가 확인되는 `SOLD` 관측치 | **0** |
| Active market claim | **NONE** |
| Provider redundancy | **0** |
| `snapshot-candidate.json` | **NONE** |
| Evidence Package | **NONE** |
| Track B Assessment | **NOT STARTED** |
| 최종 승인 workload replay | **NOT RUN** |
| 승인된 라이브 Projection | **NONE** |

720건의 reviewer-ready records와 360건의 blind candidates는 준비 상태를 입증하는 자료다. 이는 인간 검토 결과, 실증 `PASS`, Candidate/Evidence pair 또는 공개 가능한 시장 주장이 아니다.

## 4. Track별 상태

### Track A — Intelligence Factory

- 내부 ER 메커니즘: 완료.
- 현재 결손: 적법한 GRADED 120과 실제 인간 검토.
- 시장 Evidence: 적법하고 활성화된 dated-SOLD 경로가 여전히 부재함.
- Candidate/Evidence: 없음.
- Provider별 수집은 필요한 경우 서면 권리와 승인된 credential이 확보될 때까지 차단됨.

### Track B — Independent Validation Gate

- 방법론과 fail-closed 경계: 준비 완료.
- 공식 입력: 하나의 불변 `snapshot-candidate.json`과 이에 정확히 대응하는 Evidence Package.
- 현재 상태: 대기 중; 시작하지 않음.
- 어떠한 Confidence 문장도 Rankability로 해석해서는 안 됨.

### Track C — Portal and Customer Experience

- 내부 Projection-only 구조와 자동화된 경험 기반: #237에 따르면 상당 부분 완료됨.
- `NO_PROJECTION`이 계속해서 사실에 부합하는 렌더링 상태임.
- #1074는 Draft이며 현재 main보다 뒤처져 있음. 기존 check는 해당 Draft head만 입증함.
- 실제 render/API/export 경로를 대상으로 하는 #1080 executable semantic validation은 canonical repository에서 여전히 미완료 상태임.
- 별도로 배포된 Portal surface는 승인된 Projection을 생성하지 않으며 GitHub Gate 상태도 변경하지 않음.

### Track D — Runtime and Reliability

- 범용 DEV/STAGING 통제는 상당한 수준으로 구축됨.
- #921에는 실제 main 기준 STAGING 배포, `localhost` health 및 rollback receipt가 여전히 필요함.
- Provider별 PRIVATE ingestion은 계속해서 권리와 credential Gate의 적용을 받음.
- 최종 workload replay는 정확한 승인 pair와 Track B 완료를 기다리고 있음.

### Track E — IH Executive Operating System

- Foundation: 완료.
- Integration: Registry에 등록된 사실을 소비할 준비가 됨.
- 실제 Projection 데이터를 대상으로 하는 Founder Acceptance: 수행되지 않음.
- IH-EOS는 Intelligence를 생성하거나 Release를 자체 승인하지 않음.

## 5. ASI 상태

현재 Protected main에는 #1106, #1113, #1107, #1108, #1115, #1116과 #1117이 포함돼 있다. 검증된 현재 상태는 다음과 같다.

- 통제되는 Common Crawl public-index 탐색은 계속해서 Gate 1 이전의 discovery 단계에 머무름.
- 결정론적 256-shard metadata reserve와 100k **synthetic design-capacity** 검증은 통제 경로의 처리 규모를 입증할 뿐, 실제 source 또는 시장 coverage를 입증하지 않음.
- Common Crawl이 보강된 시간 단위 Gate 1→Gate 2→Gate 3 rolling-pool v2가 main에 반영됨.
- #1115는 32개 예약 scope에서 public-metadata 탐색을 수행하고 453개의 실제 public-metadata candidate와 84개 host를 관측했으며, rolling reserve를 654 candidates / 169 hosts / 240 non-empty shards로 확장했다. 이 수치는 Discovery control evidence이며 적법한 Market Evidence가 아니다.
- #1116은 서로 다른 두 건의 성공한 main-branch v2 cycle을 순차 실행하고 exact-pair readiness를 검증하는 workflow를 main에 배치했다.

#1115의 PR exact head는 8/8 workflow SUCCESS, #1116의 PR exact head는 6/6 workflow SUCCESS다. 다만 #1116이 main에서 생성해야 하는 두 개의 실제 cycle receipt와 최종 promotion-readiness artifact는 이 기준 시각에 아직 검증되지 않았다. 따라서 v1 retirement는 계속 차단된다. #1109–#1112는 병합되지 않은 채 각각 #1116 또는 #1115로 대체되어 종료됐다.

이러한 통제는 더 광범위하고 안전하며 Provider 독립적인 candidate preparation을 가능하게 한다. 그러나 다음을 생성하지는 않는다.

- 수집 또는 표시 권리
- 적법하게 admission된 시장 관측치
- 인간 검토를 거친 GRADED population
- 불변의 Candidate/Evidence pair
- Track B Assessment
- 승인된 라이브 Projection
- Production 권한

## 6. 권리 및 Provider 관련 사실

| Provider 경로 | 현재 검증된 상태 | 미확정 Decision/Evidence |
|---|---|---|
| PSA / grading | 담당자의 서면 판정 대기 | 허용되는 필드별 목적, 데이터 사용, population access 및 downstream rights |
| CLASSIC.COM | 추가 확인 대기 | Collect/store/derive/display/export, retention, termination, pricing 및 ROI |
| ALT/FNDATA | 실질적인 서면 조건이 검증되지 않음 | 동일한 필드 수준의 권리, delivery, derived-use, replacement 및 exit evidence |
| 기타 Provider | 활성 PoC 또는 commitment가 있다고 추론하지 않음 | 결손별 intake와 Owner 승인 |

계약 체결, credential 활성화, 비용 집행 또는 EULA 수락이 이루어졌다고 추론하지 않는다. Provider의 관측치는 입력으로 남으며, KIDULTS의 identity, normalization, evidence admission, confidence, rankability, derived analytics 및 Projection은 내부 Core로 유지한다.

## 7. Gate 상태

| Gate | 상태 | 종료에 필요한 Evidence |
|---|---|---|
| G0 — baseline and contracts | 구조 기준 `PASS` | 등록된 scope, methods, owners 및 재현 가능한 contracts |
| G1 — lawful evidence | **BLOCKED** | GRADED 120, 허용 가능한 시장 관측치, rights 및 정확한 Evidence Package |
| G2 — independent assessment | **NOT STARTED** | 정확한 pair에 바인딩된 Track B Assessment |
| G3 — assets/rights and governed Projection | **BLOCKED/PARTIAL** | 승인된 Projection, 권리가 정리된 fields/assets 및 immutable receipts |
| G4 — Portal/runtime/human acceptance | **PARTIAL** | 실제 STAGING, rollback receipts, 라이브·수동 usability 및 accessibility acceptance |
| G5 — Program Owner Production approval | **HOLD** | 완전한 Evidence chain과 John의 명시적 Decision |

## 8. 이 장에서 바로잡은 모순

1. 과거의 SHA reference는 해당 시점의 snapshot으로 유지한다. 현재 protected-main 기준은 #1117 이후 `1109a98c…`이다.
2. #1013 또는 #1074의 green check는 Draft-head Evidence이며 protected-main 또는 Release authorization의 증거가 아니다.
3. 자동화된 Portal QA는 최종 인간 acceptance가 아니다.
4. Candidate discovery와 admission-control machinery는 empirical admission이 아니다.
5. Missing data는 0이 아니며, 관측치의 부재는 시장 활동이 없다는 Evidence가 아니다.
6. Confidence는 Rankability가 아니다.

## 9. 해소해야 할 Evidence 결손

- 적법한 GRADED 120 및 등록된 workload에 대해 완료되고 책임 주체가 확인되는 human-review records
- 적법한 컬렉터 시장 dated-SOLD 경로
- 하나의 불변 Candidate/Evidence pair
- 정확한 pair를 대상으로 한 Track B Assessment
- 최종 실제 workload replay
- current-main 소비 경로에 바인딩된 Projection validation
- STAGING health 및 rollback receipts
- trust-root migration Decision과 protected-main 재입증
- 실제 인간 usability/accessibility acceptance
- 명시적 G5

## 10. Decision Mapping

- Positioning 및 Competitiveness Decision은 입증해야 할 대상을 정의하지만 실증 상태를 변경하지 않음.
- #235는 Evidence와 Candidate 생성을 담당함.
- #236은 독립 Assessment를 담당함.
- #237은 Projection-only Experience를 담당함.
- #240은 Runtime과 Rollback을 담당함.
- #256은 Founder Decision을 위해 등록된 상태를 소비함.
- #238은 계속해서 cross-track promotion Gate 역할을 수행함.

## 11. 원전 승계 상태

기존 `Enterprise_Baseline_Book_Chapter_01–03_KO.docx`의 세 장 전체—Baseline의 목적과 범위, 증거 기반 방법론, 기업 현황 진단—를 본 Baseline의 공식 선행 원전으로 승계한다. 현재 파일은 그 원전을 대체하는 새 출발점이 아니라, 원전의 기업 기준을 최신 canonical evidence에 결속한 한국어 개정 장이다. 특히 다음을 유지한다.

- Baseline은 회사를 좋게 보이게 하는 문서가 아니라 현재 사실을 확립하는 문서다.
- E1 직접 증거와 E2 승인된 문서 증거가 중대한 결론의 중심이다.
- Existing, Demonstrated, Production-ready와 Target State를 분리한다.
- 계획, Local 성공, 문서 존재와 구현·Production을 서로 승격하지 않는다.
- 모든 중대한 상태에는 기준일, 환경, 책임자, Evidence와 미해결 결손을 남긴다.

기존 원전의 Portfolio 또는 상태가 현재 Registry와 충돌하면 원전은 역사적 기록으로 보존하고 현재 Canonical Evidence를 적용한다. 원전은 폐기되지 않으며 각 후속 장의 Source lineage에 연결한다.

## 12. Book Sync Report

- **Master Book:** Intelligence Holdings의 존재 이유·Intelligence Economy·Knowledge Capital doctrine과 정렬하며, KIDULTS Value claim은 현재 C1/C2 경계 내로 제한됨.
- **Architecture Book:** EVIA 기업 Canon과 정렬하며, KIDULTS 구현 슬라이스는 Evidence, rights, freshness, Assessment 또는 approval이 부재하는 모든 경계에서 fail closed해야 함.
- **No Fourth Book:** 원칙 유지. 운영보고와 PR 기록은 Evidence reference이며 별도의 Book이 아님.
- **장 누적 상태:** Baseline 1/3. 세 Book 모두 3/3에 도달하기 전에는 종합 리뷰를 수행하지 않음.
- **동기화 상태:** `INHERITED ENTERPRISE BASELINE CANON; KIDULTS SLICE ALIGNED TO CANONICAL PROTECTED MAIN 1109a98c AT 2026-08-23 11:08 KST; PLATFORM CONSTITUTION v1.1 MERGED; PER-RUN EFFECT METADATA AND RECEIPT REQUIRED`.

## 13. Rollback

이 장의 파일을 revert한다. Source data, Runtime, Provider, Security control, Registry pointer, Public surface 또는 Production state는 변경되지 않는다.
