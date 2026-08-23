# Track F — 핵심역량 내재화·공급자 독립성 v1

Canonical issue: #1164
Master: #1153
Parents: #945 #951 #952 #344

## 목적
외부에는 실제 원천 사실과 법적 권한만 남기고, 해석·연결·정규화·평가·기억·교체 가능성을 KIDULTS가 소유한다.

## 역할 경계
- Track A: Evidence/Candidate
- Track B: Independent validation
- Track C: Portal/Experience
- Track D: Runtime/Reliability
- Track E: Executive OS
- Track F: Internalization / Provider Independence / Exit Continuity

## 6개 실행 웨이브
1. Rights Intelligence & Contract Policy
2. Provider Economics & Marginal Intelligence
3. Source Reputation & Reliability Memory
4. Market Integrity / Anomaly
5. Canonical Ontology / Semantic Evolution
6. Historical Learning / Decision Memory

## 강제 분류
모든 외부 기능은 아래 중 하나로 분류한다.
- EXTERNAL_FACT
- INTERNALIZE_NOW
- INTERNALIZE_PHASED
- COMMODITY_BUY
- PROHIBITED_DEPENDENCY

## 불변조건
- provider_id != canonical_id
- provider_score != kidults_score
- provider_taxonomy != kidults_ontology
- Provider→Portal direct path = prohibited
- Provider→Index direct path = prohibited
- unknown rights = HOLD
- provider removal must not break canonical identity or downstream contracts

## Wave 1 출력계약
권리판정기는 provider/field/purpose/context별로 아래를 반환한다.

```json
{
  "decision": "PASS|HOLD|DENY",
  "reason_codes": [],
  "matched_grants": [],
  "conflicts": [],
  "effective_at": null,
  "expires_at": null
}
```

HOLD 조건:
- 권리 미확정
- 계약/이메일/config 충돌
- 만료
- 목적/지역/환경/법인 범위 미충족

## 승인 경계
내부 코드/fixture/검증/DEV/SHADOW 실행만 포함한다. 외부 계약, EULA, 비용, 자격증명, 실데이터 취득, Production/Public/G5는 포함하지 않는다.
