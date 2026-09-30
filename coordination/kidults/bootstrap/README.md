# KIDULTS A-B-C-D-E Collaboration Bootstrap

**Version:** 1.2.0
**Effective:** 2026-08-12 KST  
**Canonical integration board:** [Issue #234](https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/234)  
**Integration gate:** [Issue #238](https://github.com/johnkim9524-collab/kaios_enterprise_repo/issues/238)

## Purpose

This directory is the startup package for five KIDULTS workstreams.

- **Track A — 120 Intelligence Factory:** produces versioned intelligence snapshot candidates and Evidence Packages.
- **Track B — Rankability & Validation Gate:** independently validates one exact snapshot candidate.
- **Track C — Portal V502 & Experience Layer:** renders only released, versioned intelligence artifacts.
- **Track D — Data Platform & Production Reliability:** publishes and operates approved intelligence after all gates and G5 approval.
- **Track E — Executive OS & Cross-Vertical Portfolio:** governs executive operating decisions, cross-vertical reuse, capital/ROI gates, and portfolio-level evidence.

## Required reading order

Before using this reading order, every agent instance must execute the canonical GitHub bootstrap contract at `coordination/kidults/governance/ai-agent-github-bootstrap-contract-v1.json`:

```bash
export KIDULTS_BOOTSTRAP_NONCE='<unique-orchestrator-nonce-at-least-32-bytes>'
npm run agent:bootstrap -- \
  --agent-id <agent-id> --agent-class <governed-class> \
  --task-id <task-id> --session-id <session-id> \
  --expected-sha <externally-supplied-exact-checkout-sha>
```

Do not start track work after receipt creation alone. The orchestrator must independently run `npm run verify:agent-bootstrap -- ... --consume` and obtain `BOOTSTRAP_VERIFIED` for the same bindings.

The global GitHub bootstrap reads all contract-defined trust documents in a fixed order from committed Git blobs. After independent verification, continue with the track-specific reading order:

1. `coordination/kidults/README.md`
2. `coordination/kidults/registry/README.md`
3. `coordination/kidults/registry/catalog.json`
4. The track record under `coordination/kidults/registry/track/records/`
5. The role record under `coordination/kidults/registry/role/records/`
6. The track-specific bootstrap file in this directory
7. The applicable schemas, contracts and handoff records

## Track bootstrap files

- `TRACK_A_120_SCORE_BOOTSTRAP.md`
- `TRACK_B_RANKABILITY_BOOTSTRAP.md`
- `TRACK_C_PORTAL_V502_BOOTSTRAP.md`
- `TRACK_D_DATA_PLATFORM_BOOTSTRAP.md`
- `coordination/kidults/bootstrap/TRACK_E_EXECUTIVE_OS_BOOTSTRAP.md`

## Mandatory common keys

```text
snapshot_id
methodology_version
generated_at
source_mode
evidence_lineage_version
registry_version
```

A snapshot-ID mismatch blocks handoff and Production promotion.

## Official artifact chain

```text
Track A: snapshot-candidate.json + Evidence Package
        ↓ same snapshot_id
Track B: rankability-assessment.json
        ↓
Track C: portal-release-manifest.json + Portal QA
Track D: runtime-readiness-record.json + rollback verification
        ↓
Program Owner: production-decision.json
        ↓
Track D: published-snapshot.json + production-release-record.json
```

## Common rules

1. Generate, validate, approve and publish are separate responsibilities.
2. Portal renders intelligence and never computes ranking/readiness.
3. Rankability never edits Track A evidence.
4. Track D makes approved intelligence operational and cannot approve Production.
5. Current data does not establish absolute or permanent superiority.
6. The eight Core Verticals are stable; Featured Set is dynamic.
7. Missing data is never silently converted to zero.
8. No chat-only result becomes official without Registry entry.
9. Every release requires rollback.
10. Proof before procurement.

## Reporting cadence

- Track A: hourly plus material-event reports
- Track B: every material candidate plus gate-change reports
- Track C: every contract/release change plus rendering/asset failures
- Track D: every deployment/runtime/incident event plus health reports
- Track E: every material portfolio, ROI, reuse, authority, or cross-vertical decision
- Integrated digest: 06:00 KST daily
- Three-Book synchronization: Sunday and after material changes

## Startup acknowledgment

Post in the canonical issue:

```text
role accepted
bootstrap receipt id and path
canonical repository and origin
authority ref and SHA
working ref and exact HEAD SHA
worktree state
canonical issue
current snapshot_id or waiting state
inputs available
outputs committed
known blockers
next reporting time
```

Issues: Track A #235 · Track B #236 · Track C #237 · Track D #240 · Track E registry/issue binding required before execution

## 전략 우선 실행과 역할 분리 — 2026-09-30

모든 에이전트는 이미 필수 읽기에 포함된 `coordination/kidults/registry/roles-and-responsibilities.json`의 `mandatory_execution_strategy`와 자신의 직무를 읽고 수락한다. 착수 전 목표·최종 증거·현재 사실/가설/미확인·핵심 병목·선택 경로/제외 범위·결정적 선검증·시간/비용/재시도 한도·전환 기준·인수인계를 작업 위험에 비례해 준비한다. 같은 실패는 새 근거 없이 반복하지 않으며 계획 자체도 제한한다. 별도 일상 Owner 승인 대기열은 만들지 않는다. 읽기 receipt는 이해력·수행 능력·운영 완료를 입증하지 않는다.

Atlas는 통합·종결의 최종 책임을 유지한다. `DEPUTY_KPMO`는 `deputy-kpmo`, `TRACK_R`는 `track-r-red-team`에 결속되며 기존 `RED_TEAM`의 incident-manager 매핑을 새 Track R 선임으로 오인하지 않는다. Deputy와 Track R은 겸임하지 않는다. Track R은 John 직보이며 자신이 작성한 결과를 독립 검증하지 않는다. Track B 판정은 대체하지 않는다. 조건부 지정은 역할 수락·실제 실행·영구 적격 PASS가 아니다.

Track C의 2026-08-12 수락 이력은 보존하되 현재 세션 준비와 구분한다. 미전달·연결 장애는 거부가 아니다. 실제 전달과 실행 여건이 확인된 상태의 거부 또는 정당한 사유 없는 미이행만 증거 기반 교체 대상이다. 모든 기존 Production/Public/G5·지출·계약·활성화·trust-root 경계는 유지한다. 구현·수락·가동의 후속 기준은 #2431에서 추적한다.
