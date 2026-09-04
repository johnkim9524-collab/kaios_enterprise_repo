# KPMO + Red-Team Holistic Review — Current-SOLD End-to-End V1

**기준 protected main:** `f46bdcd9003eb5c4b58208789956644f4ba19fe2`  
**기준 Atomic Landing:** Run `33712093506`  
**주관:** KPMO + Red Team  
**업무 귀속:** TRACK A / runtime ASI  
**검증된 코어:** Current-SOLD post-landing `56/56 PASS`  
**Production / Public / G5:** HOLD

## 1. 핵심 결론

Current-SOLD의 **코어 소프트웨어는 완료**됐지만, **실제 합법 데이터가 영구 원장과 Track B까지 흐르는 제품 운영 체인은 미완료**다.

```text
CORE ENGINE                           = COMPLETE / CONTROL-VALIDATED
GOVERNED RECEIPT AUTHORITY            = CONTROL IMPLEMENTATION ADDED HERE
LAWFUL EMPIRICAL CURRENT-SOLD         = 0
POSTGRES MIGRATION / ROWS             = false / 0
TRACK A CANDIDATE / EVIDENCE          = NONE / NONE
OFFICIAL TRACK B                      = NOT_STARTED
APPROVED PROJECTION                   = NONE
PUBLIC / PRODUCTION / G5              = HOLD / HOLD / HOLD
```

이번 변경은 보고서만 추가하지 않는다. 발견된 내부 결함 중 승인 범위에서 즉시 고칠 수 있는 항목은 코드·계약·negative test·workflow로 함께 교정한다.

## 2. 전후방 체인 진단

| 단계 | Owner | 현재 판정 | 핵심 리스크 | 이번 즉시 조치 |
|---|---|---|---|---|
| Source·Provider·Rights | Track Z | 외부 권한 대기 | 공개 표시·fixture·자기서명을 lawful acquisition으로 오인 | Track A JD에서 자기증명 금지, authority contract에 독립 issuer 요구 |
| Receipt Authority | KPMO | 기존 미구현 | exact digest는 있으나 issuer·signature·validity·record set 권위 없음 | **Ed25519 외부 keyring 기반 authority adapter 구현** |
| Observation·Admission | Track A / ASI | 코어 완료 | low-level classifier를 canonical admission처럼 직접 호출할 가능성 | **canonical atomic entrypoint static guard 구현** |
| Event·Evidence | Track A / ASI | 코어 완료 | partial batch·identity conflict·correction drift | 기존 atomic withholding·digest·correction 통제 유지 |
| Private Candidate | Track A / ASI | 완료(후보 전용) | candidate PASS를 lawful empirical로 오인 | claim ceiling과 0 empirical invariant를 JD·validator에 결속 |
| PostgreSQL Ledger | Track D | 코드 완료·미활성 | migration/write/PITR 미실증 | 별도 gate 유지; 이번 변경 write 0 |
| Candidate/Evidence Pair | Track A | 미생성 | lawful ledger row 없이 Track B 입력을 꾸밀 위험 | exact pair only JD·readiness gate 고정 |
| Rankability | Track B | 미시작 | HOLD/diagnostic output의 promotable 오인 | Track B는 immutable exact pair만 수용 |
| Projection·Portal | Track C | HOLD | 엔진 성공을 Public readiness로 오인 | approved Projection 이전 렌더링 금지 |

## 3. 즉시 교정한 결함

### P1 — Current-SOLD 업무 귀속 불명확

기존 문서에는 Track A가 Evidence/Snapshot을 소유한다고만 적혀 있었고, Current-SOLD 엔진 자체의 Accountable Track이 machine-readable JD로 고정되지 않았다.

**교정**

- `track-a-current-sold-job-description-v1.json`
- Track A human JD
- README와 Track Alignment Directive
- ownership drift validator와 negative tests

이제 Track A가 엔진·Event·Evidence·Candidate/Evidence를 소유하고, ASI/KPMO/Z/D/B/C의 역할이 분리된다.

### P1 — Governed Receipt Registry Authority Adapter 부재

기존 private candidate path는 registry digest가 exact하다는 사실만 확인할 수 있었고, 누가 발급했는지와 key·issuer·validity·receipt-set authority를 증명할 수 없었다.

**교정**

새 adapter는 다음을 검증한다.

- candidate 변경과 분리된 외부 trusted keyring digest
- Ed25519 signature
- issuer와 active key exact binding
- repository·source SHA·canonical run·purpose
- complete registry digest
- acquisition/rights receipt set digest
- record count와 source coverage
- issued/not-before/expiry 및 24시간 lifetime ceiling
- sanitized digest-only receipt
- 0700 private nonce directory와 0600 exclusive one-use consumption receipt
- replay rejection

이 adapter의 PASS만으로 lawful empirical admission을 허용하지 않는다. Atomic admission, ledger gate와 exact Track A pair가 추가로 필요하다.

### P1 — Low-level classifier 우회 위험

`normalizeCurrentSoldObservation`과 `admitCurrentSoldBatch`는 내부 primitive다. 다른 production consumer가 이를 직접 호출하면 canonical whole-batch entrypoint와 strict controls를 우회할 수 있다.

**교정**

repository static guard가 production source 전체를 검사하여 허용된 엔진·batch·atomic·ledger 파일 외의 직접 호출을 RED로 만든다. Private dry-run은 반드시 `buildAtomicCurrentSoldBatchBundle`을 사용해야 한다.

### P1 — Empirical false-green 전파 위험

Seattle fixture, committed reference snapshots, replay output 등은 deterministic control proof일 수 있지만 live acquisition을 스스로 증명하지 못한다. 관련 source-specific producer는 자연 실행 증거가 필요하다.

**조치**

- JD와 readiness registry에 fixture/replay empirical promotion 금지
- authority adapter가 independent signature와 exact external digest를 요구
- lawful count, Candidate/Evidence, Track B를 모두 0/NONE/NOT_STARTED로 유지

이 리스크는 **containment 강화**됐지만 외부 lawful acquisition이 없으므로 종료 판정하지 않는다.

## 4. 추가 구현 상태

| 구현 | 결과 |
|---|---|
| Track A Current-SOLD machine JD | 완료 |
| Cross-Track RACI | 완료 |
| JD drift validator | 완료 |
| Governed receipt authority contract | 완료 |
| Ed25519 authority verification adapter | 완료 |
| Exact receipt-set/source/run/count binding | 완료 |
| Private nonce one-use receipt | 완료 |
| Signature·digest·time·replay negative tests | 완료 |
| Canonical atomic entrypoint guard | 완료 |
| End-to-end readiness registry | 완료 |
| 전용 GitHub control workflow | 완료 |
| 실제 external keyring provisioning | 미실행·별도 runtime gate |
| 실제 lawful source acquisition | 0·Track Z gate |
| PostgreSQL migration/write | 0·별도 승인 gate |
| Track A Candidate/Evidence pair | NONE |
| Track B assessment | NOT_STARTED |

## 5. 남은 실행 순서

```text
1. 이번 repository-only 교정을 governed landing
2. 외부 private trusted keyring + exact digest provision
3. lawful source 1개와 acquisition/rights receipt set 확보
4. signed authority envelope verify + nonce consume
5. Track A/ASI Current-SOLD 1건 atomic canary
6. 동일 source 5건 whole-batch canary
7. Track D 별도 승인 PostgreSQL migration + first append-only write/read-back/PITR
8. Track A exact Candidate/Evidence pair
9. Track B independent assessment
10. Projection 및 별도 Public/Production/G5 gate
```

## 6. 진실 경계

이번 변경은 repository-only reversible internal correction이다.

- provider/API call: `0`
- credential resolution: `0`
- PostgreSQL migration/write: `false / 0`
- external acquisition: `0`
- empirical admission: `0`
- deployment: `false`
- Public/Production/G5: `HOLD/HOLD/HOLD`

따라서 이번 PR이 병합되면 “코어와 authority control이 강화됐다”고 보고할 수 있지만, “실제 Current-SOLD 제품 운영이 완료됐다”고 보고할 수는 없다.
