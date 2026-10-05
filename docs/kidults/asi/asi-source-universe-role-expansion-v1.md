# ASI Global Source Universe Role Expansion v1

## Decision

ASI의 현재 market-first commercial discovery는 중단하지 않는다. 대신 ASI의 목표를 **commercial-site enumeration**이 아니라 **role-complete Global Source Universe Discovery**로 확장한다.

이 문서는 현재 진행 중인 Autonomous Normal Operations closure와 PSA validation에 영향을 주지 않는 **SEPARATE_PROGRAM / DESIGN_ONLY** 구현이다. 이 브랜치에서는 runtime, workflow, AWS/STAGING, provider, credential, Production/Public/G5를 변경하지 않는다.

## Why

현재 authoritative ASI 계약은 이미 `MANUFACTURER`를 candidate type으로, `PRIMARY_AUTHORITY`를 source role로 포함하고 있다. 따라서 새 전략은 제조사를 별도 시스템으로 추가하는 것이 아니라, 기존 권위모델이 실제 discovery coverage에서 빠지지 않도록 **source-layer coverage**를 명시적으로 만든다.

## Source layers

- **L0 Authority** — government, regulator, official registry, standards body, institution
- **L1 Origin** — manufacturer, brand, publisher, mint, studio, IP owner, licensee, artist/atelier
- **L2 Distribution** — official distributor, authorized retailer, dealer, primary market
- **L3 Market** — marketplace, auction house, exchange, dealer market, private-sale venue
- **L4 Trust** — grading, authentication, certification, population/census, provenance
- **L5 Intelligence** — specialist DB, research, trade media, archive, community context

이 layer는 기존 ASI source roles를 대체하지 않는다. 기존 role을 **coverage 관점에서 묶는 orthogonal classification**이다.

## Core operating rule

`Category × Geography × Language × Source Layer × Source Role × Lifecycle × Evidence Class × Time`을 coverage cube로 사용한다.

사이트 수는 completion metric이 아니다. 제조사 수 역시 completion metric이 아니다. 중요한 것은 decision-relevant semantic/empirical coverage와 gap이다.

## Origin rule

Marketplace는 가격·거래 관측에는 중요하지만 canonical product identity의 기본 권위가 되어서는 안 된다. 합법적이고 추적 가능한 경우 manufacturer/brand/publisher/mint/studio/IP-owner/licensee 등 factual origin을 먼저 anchor로 사용한다.

Origin 발견은 collection/admission/claim 권한을 만들지 않는다.

## Non-conflict rule

현재 P0 동안:
1. 기존 commercial discovery는 계속한다.
2. 새 runtime code를 배포하지 않는다.
3. ASI workflow를 변경하지 않는다.
4. KPMO autonomous closure 파일을 변경하지 않는다.
5. PSA validation 파일·receipt·provider scope를 변경하지 않는다.
6. 새 provider call, credential, spend, EULA, collection을 만들지 않는다.
7. Production/Public/G5는 HOLD한다.

## PSA

PSA는 이 모델에서 **L4 Trust**의 실제 provider 사례다. 현재 PSA 실증 범위는 그대로 유지하며, 이 전략은 PSA 호출이나 scope 확대를 요구하지 않는다.

## Phase 1 after current P0

현재 autonomous closure와 PSA boundary가 live state에서 정리된 뒤 최소 구현만 수행한다.

- candidate compiler에 source-layer classification 추가
- Origin/Authority discovery query family 추가
- coverage cube ledger 추가
- role/layer gap report 추가
- discovery-only shadow validation

그 이후에만 canonical entity/evidence graph 및 event-lifecycle expansion으로 진행한다.

## Success

ASI가 상업 사이트를 계속 발견하면서도 manufacturer/brand/publisher/IP-owner/authority/trust source를 놓치지 않고, 어떤 category/region/language에서 어떤 source role이 비어 있는지를 자동으로 설명할 수 있으면 Phase 1의 목적을 달성한다.
