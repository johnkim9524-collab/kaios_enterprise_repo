# 자율운영과 업무 영역 준비도의 분리

자율운영 제어 체계의 검증은 공급자 미연결 업무 영역의 완료와 별개로 판정한다. 이 정책은 보호된 main에 반영된 이후 적용된다.

`whole-platform-operating-proof-v1.json`의 14개 영역과 기존 미충족 상태는 모두 보존한다. 전체 플랫폼 운영 완료는 계속 14/14 실제 영수증과 모든 운영 검증을 요구한다. 미연결 영역은 통과가 아니며, 공급자 권리나 업무 실행 권한을 부여하지 않는다.

Assurance의 자율운영 런타임 검증은 필수 `SECURITY_SUPPLY_CHAIN` 및 정확한 main의 `runtime_domain_sources`에 연결된 모든 영역을 요구한다. 새 영역이 보호된 등록부에 연결되면 즉시 필수 검증 대상이 된다. 연결된 영역의 실패·누락·위조·오래된 입력을 미연결로 취급할 수 없다. 등록부 누락, 중복, 알 수 없는 영역 및 필수 보안 영역 제거는 차단한다.

14개 영역 전수 분류:

| 영역 | 자율운영 검증 적용 | 업무 활성화 조건 |
|---|---|---|
| SECURITY_SUPPLY_CHAIN | 항상 필수 | 실제 보안 생산자 영수증 |
| VALUE_TRACEABILITY | 연결 시 필수 | 실제 출처·가치 계보 |
| SOURCE_RIGHTS | 연결 시 필수 | 공급자별 권리 승인 |
| ENTITY_RESOLUTION | 연결 시 필수 | 실제 엔티티 입력·정합성 |
| MARKET_EVIDENCE | 연결 시 필수 | 실제 시장·유동성 입력 |
| ASI_EXECUTION | 연결 시 필수 | 실제 취득·가공 실행 |
| IMMUTABLE_CANDIDATE | 연결 시 필수 | 불변 객체 쌍 |
| TRACK_B_VALIDATION | 연결 시 필수 | 실제 Track B 업무 검증 |
| PROJECTION_TRUTH | 연결 시 필수 | 실제 투영·원장 정합성 |
| PORTAL_TRANSPARENCY_ACCESSIBILITY | 연결 시 필수 | 해당 Portal 실행·접근성 |
| EOS_FOUNDER_WORKFLOW | 연결 시 필수 | 해당 Founder 업무 수용 |
| RUNTIME_RELIABILITY | 업무 생산자 연결 시 필수 | 업무 런타임 신뢰성; 제어 체계의 자연 실행·재개 검증은 계속 필수 |
| PRIVACY_RETENTION | 실제 개인정보 취득 전에 필수 | 저장·보관·삭제 검증; PSA 실증의 선행 조건 유지 |
| INTEGRATION_GATE | 업무 통합 연결 시 필수 | 해당 업무 통합; 제어 체계의 승인·dispatch·최종화 검증은 계속 필수 |

자율운영 완료는 런타임 준비도만으로 성립하지 않는다. `WHOLE_VALUE_CHAIN_RUNTIME`을 제외한 기존 8개 제어 검증: core 내용, 두 개의 서로 다른 자연 세대, 자연 체인 종결, 보호된 병합, AWS 구성·불변성, native dispatch, native resume reuse, finalizer 예약·불변 종결이 모두 실제 검증돼야 한다. Assurance Gate는 그 체인의 한 노드이며 자체 성공으로 완료·승격 권한을 발급하지 않는다.

권리·저장·보관·감사 검증을 확보하기 전 PSA 취득을 시작할 수 없다. Production/Public/G5, 새 자격증명·IAM·지출·공급자 활성화 경계는 유지한다. 기존 완료 단계를 반복하지 않고 실제 외부 상태를 재조회한다.
