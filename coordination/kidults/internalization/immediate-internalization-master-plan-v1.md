# KIDULTS 즉시 내재화 실행 마스터 플랜 v1

## 목적
외부에는 비내재화 가능한 원천 사실만 남기고, 식별·정규화·권리판정·경제성·신뢰·이상징후·온톨로지·역사학습을 KIDULTS 내부 핵심역량으로 축적한다.

## 실행 원칙
1. 기존 #844–#854와 현재 provider-independent runtime을 재사용한다.
2. 외부업체 상품 기능은 `EXTERNAL_FACT / INTERNALIZE_NOW / INTERNALIZE_PHASED / COMMODITY_BUY / PROHIBITED_DEPENDENCY`로 분류한다.
3. 신규 파트너 협상은 #1166에서 내재화 판단과 동시에 수행한다.
4. 공급자 ID·분류·점수·방법론은 KIDULTS 기준계약이 될 수 없다.
5. 모든 외부비용·계약·자격증명·Production/G5는 별도 승인이다.

## Wave 순서
### Wave 1 — 권리·계약 정책
Issue #1154. 기존 #894를 상위 일반화한다. 계약/서면회신/공식약관/설정의 권리 근거를 field×purpose로 구조화하고 모순·만료·미확정을 자동 HOLD한다.

### Wave 2 — 공급자 경제성·한계가치
Issue #1155. 단순 호출가격이 아니라 증분 커버리지, 중복비용, 내부개발 회피비용, 집중도, 교체비용, 연간 확장비용으로 MAKE/BUY/PARTNER/FALLBACK 결정을 만든다.

### Wave 3 — 소스 평판
Issue #1156. 스키마 안정성, 가용성, 신선도, 정정, 모순, 출처완전성, 권리변경, 실제 기여도를 장기 누적한다.

### Wave 4 — 시장 무결성
Issue #1157. 재등록, 중복경매, 비정상 가격·입찰·무응찰, 상태불일치, 수수료·통화왜곡, 출처충돌, 의미변경을 내부 탐지한다.

### Wave 5 — 기준 온톨로지 진화
Issue #1158. 공급자 분류체계와 독립된 버전형 KIDULTS 온톨로지를 소유한다.

### Wave 6 — 역사 학습·의사결정 메모리
Issue #1160. 원시 공급자 데이터와 분리된 합법적 파생지식, 판단이력, 공급자 교체 전후 성능·비용 이력을 유지한다.

## 구현 상태
- Wave 1 권리·계약 정책 계약 + fail-closed 검증기: 구현 완료
- Wave 2 공급자 경제성·한계가치 계약 + 검증기: 구현 완료
- Wave 3 소스 평판·신뢰 메모리 계약 + 검증기: 구현 완료
- Wave 4 시장 무결성·이상징후 계약 + 검증기: 구현 완료
- Wave 5 기준 온톨로지·의미 진화 계약 + 검증기: 구현 완료
- Wave 6 역사 학습·의사결정 메모리 계약 + 검증기: 구현 완료
- 공급자 제거 시뮬레이션 계약 + 연속성 검증기: 구현 완료
- PSA / GemRate / CGC-CCG / ALT-FNDATA / CLASSIC.COM / LiveArt / Hagerty 내재화 매트릭스: 구현 완료
- 전체 내재화 기반 통합 검증: PASS
- 일반 CI / Coordination / Full Value Chain / Security / Owned Fabric / Phase 2 / Solo Owner 검증: PASS
- ASI SHADOW 추가 검증의 기존 고정 산출물 byte-diff는 별도 기존 산출물 동기화 문제로 분리 관리하며 내재화 필수 병합검사와 분리한다.

## 완료 기준
- 권리 미확정/충돌/만료가 자동 HOLD
- 가격 미확정은 0으로 처리되지 않음
- 단순 가격표나 마케팅이 공급자 우선순위를 결정하지 않음
- 공급자 제거 시 canonical identity/methodology/confidence/history가 지속
- Tier 2/3 편의·분석 기능은 내재화 우선
- 외부에는 실제 인증/등급/모집단/거래/낙찰/원천 기록과 법적 권한만 정당하게 잔존

## 현재 병합 판단
내재화 기반 자체는 병합 준비 상태다. protected main 병합은 repository required status checks를 우회하지 않고 통과한 정확한 PR head에서만 수행한다. Production/Public/G5는 계속 HOLD다.
