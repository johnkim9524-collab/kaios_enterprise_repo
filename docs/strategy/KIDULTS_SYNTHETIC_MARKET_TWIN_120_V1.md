# KIDULTS Synthetic Market Twin 120 V1

## 목적

외부 또는 고객용 데이터가 아니라 ASI부터 Portal까지 내부 통제 밸류체인을 검증하는 비승격 합성 시장 리허설이다. 실제 공급자·URL·식별자·권리·시장가격을 주장하거나 모사하지 않는다.

## 표본

8개 vertical에 각각 15건을 배정한다. 각 vertical은 정상 9건, 경계값 3건, 의도적 결함 3건으로 구성되어 총 정상 72건, 경계 24건, 결함 24건이다. 정상·경계 96건은 실제 KIR 및 Atomic Current-SOLD/Evidence 구현을 통과하며 결함 24건은 실제 gate에서 차단된다. 결함 레코드는 권리 누락·만료·결정 drift, stale SOLD, namespace escape, acquisition provenance drift, content tamper의 7종 mutation으로 재평가하여 총 56개 negative assertion을 수행한다.

## 밸류체인 판정

| 단계 | 내부 검증 | 허용되지 않는 주장 |
|---|---|---|
| ASI·Rights·Entity | 합성 namespace, 권리 receipt, 객체 고유성 | 실공급자 발견·권리 확보 |
| Current-SOLD·Evidence | 실제 atomic admission과 evidence digest | 실거래·시장 증거 |
| Ledger | receipt/digest 및 deterministic replay | 원격 PostgreSQL write |
| Candidate·Track B | 비승격 control record 결속 | 실제 rankability 또는 Track B PASS |
| Projection·Portal | WAITING control과 NO_PROJECTION 격리 | 고객 노출·시장 지표·Public |

ASI discovery와 Entity Resolution은 deterministic control harness로 검증하고, Rights·Current-SOLD·Evidence는 실제 admission 구현을 실행한다. Candidate·Track B·Projection은 현재 실데이터 승격 엔진이 아니라 digest-bound 비승격 control model로 검증하며, Portal 격리는 실제 `readPortalProjection` adapter를 96회 실행해 확인한다. 따라서 본 프로젝트는 플랫폼 통제 통합검증이지 실증 Track B 판정이나 시장 Projection 검증이 아니다.

## 합격 기준

정상·경계 96건 통과, 결함 24건 차단, red-team mutation 56건 정확 거부, 고유 lineage 120건, downstream digest 충돌 0건, 고객 노출 0건, empirical delta 0건, PostgreSQL write 0건이어야 한다. Candidate → Track B → Projection은 인라인 결과 조립이 아니라 재사용 가능한 strict synthetic control runtime을 96회 실행한다. 재실행 digest가 달라지거나 어떤 합성 레코드라도 승격 권한을 얻으면 전체 실행은 실패한다.

Production, Public, G5, 실제 데이터 수집, 공급자 접촉, 지출 및 credential 사용은 모두 HOLD이다.

## 복원력 검증

동반 복원력 스위트는 실제 Current-SOLD 엔진을 대상으로 미래 clock skew,
관측시각 역전, hammer/all-in 수수료 의미 불일치, 정상·비정상 정정 계보,
중복 replay, 취소·재등록 비-SOLD 차단, 부분 실패 시 zero-admission을 검증한다.
또한 병렬 control 실행의 결정성·불변성, 중복 fan-in 차단과 downstream batch
상한을 검증한다.

로컬 실행만으로 PostgreSQL 트랜잭션 또는 재시작 검증을 주장하지 않는다.
별도의 pinned PostgreSQL 16 CI가 동일 exact head에서 명시적 rollback,
강제 연결 종료 rollback과 컨테이너 재시작 후 영속성을 검증해야만 해당
항목을 통과한 것으로 판정한다. 이는 원격 또는 Production DB 권한이 아니다.
