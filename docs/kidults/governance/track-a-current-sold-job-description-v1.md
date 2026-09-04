# TRACK A Job Description — KIDULTS Current-SOLD Engine V1

**상태:** protected `main`에 존재할 때 발효  
**Program Owner:** John  
**주관 Track:** **TRACK A — Intelligence / Evidence Factory**  
**실행 주체:** ASI  
**거버넌스:** KPMO  
**Canonical issue:** #235  
**Production / Public / G5:** HOLD

## 1. 공식 귀속

KIDULTS `Current-SOLD Engine`의 제품·데이터·Evidence 생산 책임은 **TRACK A**에 귀속한다.

TRACK A는 합법적으로 취득되고 권리가 승인된 판매 관측치를 받아 다음 산출물로 변환하는 업무의 Accountable Owner다.

```text
Observation
→ Atomic Current-SOLD Admission
→ Current-SOLD Event
→ Canonical Evidence
→ Append-only Ledger Receipt
→ Immutable Snapshot Candidate + Evidence Package
→ Track B
```

ASI는 TRACK A의 runtime executor이며, KPMO는 승인·권한·receipt·fail-closed·레드팀 통제를 담당한다. 외부 provider나 source는 대체 가능한 Evidence source layer일 뿐 Current-SOLD의 canonical identity나 제품 진실을 소유하지 않는다.

## 2. TRACK A의 책임

TRACK A는 다음을 직접 소유한다.

| 책임 | 필수 결과 |
|---|---|
| Current-SOLD 제품 계약 | SOLD 의미, 7일 freshness, 가격·통화·수수료·correction 규칙 |
| Atomic admission | 한 건의 결함도 전체 admission·Event·Evidence를 보류 |
| Canonical identity | stable source transaction identity와 content digest 분리 |
| Receipt 결속 | acquisition·rights·source URL·SHA·run·digest exact binding |
| Canonical Evidence | Event와 exact source/run/receipt lineage가 결속된 Evidence |
| 품질 통제 | 회귀·negative test, exact-head 및 post-landing 검증 |
| Track A handoff | 동일 세대의 immutable Candidate/Evidence pair |
| 진실 경계 | CONTROL / PRIVATE CANDIDATE / LAWFUL EMPIRICAL 분리 |

TRACK A는 source-first로 작업하지 않는다. 고객 의사결정 → 필요한 주장 → Evidence → 데이터 요구 → source 순서로 설계한다.

## 3. Cross-Track RACI

| 주체 | 역할 | 책임 |
|---|---|---|
| **TRACK A** | **A/R** | 엔진, admission, Event, Evidence, Candidate/Evidence |
| **ASI** | R | 승인된 범위에서 adapter와 엔진 workload 실행, run receipt 생산 |
| **KPMO** | A(거버넌스) | 권한 검증, 승인, fail-closed, 레드팀, truth sync |
| **TRACK Z** | Upstream R | provider/source, field×purpose rights, credential·activation, lawful acquisition |
| **TRACK D** | Support R | private runtime, PostgreSQL append-only ledger, PITR·restore, 관측성 |
| **TRACK B** | Independent V | exact Candidate/Evidence pair의 독립 rankability·대표성 검증 |
| **TRACK C** | Consumer | 승인된 Projection만 표시; admission·ranking 계산 금지 |

## 4. TRACK A가 하지 않는 일

TRACK A는 다음 권한을 갖지 않는다.

- provider 권리나 acquisition receipt를 스스로 발급 또는 자기증명
- CONTROL/Synthetic/fixture/repository replay를 empirical Current-SOLD로 승격
- PostgreSQL migration 또는 원격 write를 별도 승인 없이 실행
- Track B의 독립 평가를 대신하거나 스스로 rankability를 승인
- Portal/Public/Production/G5를 승인 또는 직접 배포
- listing, asking price, aggregate index를 개별 SOLD transaction으로 변환

## 5. 완료 기준

Current-SOLD 업무를 “완료”라고 보고하려면 아래 체인이 모두 성립해야 한다.

1. Track Z가 lawful source와 field×purpose rights를 확정한다.
2. KPMO가 writer-independent governed receipt authority를 검증한다.
3. TRACK A/ASI가 실제 1건, 이어서 동일 source 5건을 whole-batch atomic PASS로 처리한다.
4. TRACK D가 별도 승인된 append-only PostgreSQL migration·write·read-back·PITR를 증명한다.
5. TRACK A가 exact immutable Candidate/Evidence pair를 만든다.
6. TRACK B가 그 exact pair를 독립 평가한다.
7. Projection/Public/Production/G5는 각각의 별도 gate를 통과한다.

현재 코어 엔진은 내부 통제 기준으로 검증됐지만 lawful empirical admission은 `0`, PostgreSQL write는 `0`, Candidate/Evidence는 `NONE/NONE`, Track B는 `NOT_STARTED`다.
