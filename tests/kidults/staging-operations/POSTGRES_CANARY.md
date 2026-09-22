# PostgreSQL 경계 실증 — #2289 / #481

이 실증은 로컬 Docker의 실제 Linux PostgreSQL과 자율운영 런타임을 연결한다. AWS, 운영 DB, 외부 Provider에는 연결하지 않는다. 승인 발급자는 시험용 대역이며 영속 저장소는 로컬 모의 저장소다. 따라서 이 결과로 독립 승인, AWS 영속성, 무인운영 전체 또는 PSA 실증 완료를 주장할 수 없다.

## 고정 실행환경

- PostgreSQL: `postgres@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652`
- Node: `node@sha256:22553920add6fb1fd909104346924cd30b4b3ac76ca2980f3b8dba8ede3cf945`
- PostgreSQL 클라이언트: `postgres-live-deps/npm-shrinkwrap.json`으로 고정한다.
- DB 이름: `kpmo_canary`, 호스트 별칭: `postgres`. 공개 포트 없이 별도 `--internal` Docker 네트워크를 사용한다.
- DB 데이터는 시험 전용 `tmpfs`에 둔다. 실제 자격증명·DSN·AWS 환경을 전달하지 않는다.

## 실행

`run-postgres-local-canary-v1.ps1 -ExpectedSha <검증할 정확한 커밋> -EvidenceRoot <저장소 밖의 신규 증거 폴더>`를 사용한다. 실행 스크립트는 이미지 자동 다운로드를 하지 않는다. 위 고정 이미지는 별도 설치되어 있어야 한다. 의존성 설치에는 잠금파일과 `--ignore-scripts`를 사용한다.

원장 변경, 실행 스크립트, 회귀시험 파일이 dirty 상태이면 실행하지 않는다. 종료 시 스크립트가 생성한 시험용 컨테이너·네트워크·작업 패킷만 정리하고, 증거 폴더는 보존한다.

## 검증 범위

임대 동시 경쟁, 반복 재시도 기록, 만료 후 쓰기, 호출자 시각 조작, 이전 세대의 쓰기·해제, 완료 기록 경쟁, 잠금 대기 중 만료, 기록 실패의 원자적 원복, 실제 원장과 런타임의 결합, 성공한 조회의 재호출 방지, 작업자 강제 종료 후 복구, 기존 스키마의 무단 변경 방지, 3회 런타임 완료 및 원장 재조회.

스키마가 이전 버전이면 `SCHEMA_MIGRATION_REQUIRED`로 중단한다. 초기화 함수가 기존 제약조건이나 이력을 삭제하지 않는다. 실환경 스키마 이행은 별도 검토·승인 대상이다.

## 판정 경계

`VERIFIED_PASS_LOCAL_POSTGRES_ONLY`는 PostgreSQL 경계의 제한된 실증 통과다. Production / Public / G5는 HOLD이며, #2289의 독립 승인 인증·재시작 후 승인 재사용 차단·외부 통신 경계·AWS 실환경 검증은 별도 미해결 항목이다.
