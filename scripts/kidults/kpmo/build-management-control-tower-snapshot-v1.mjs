import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(process.env.KIDULTS_REPO_ROOT || process.cwd());
const read = (relative) => JSON.parse(readFileSync(resolve(root, relative), 'utf8'));
const rights = read('coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json');
const preflight = read('coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json');
const alignment = read('coordination/kidults/governance/current-sold-sample-governance-alignment-v1.json');
const contract = read('coordination/kidults/governance/management-control-tower-contract-v1.json');
const counts = rights.records.reduce((a, row) => { a[row.decision] = (a[row.decision] || 0) + 1; a[row.work_state] = (a[row.work_state] || 0) + 1; return a; }, {});
const portfolio = preflight.portfolio;
const snapshot = {
  id: 'kidults-management-control-tower-snapshot-v1',
  generated_by: 'KPMO_TRACK_D_GOVERNED_BUILDER',
  as_of: rights.as_of,
  snapshot_state: alignment.release_state,
  headline: `내부 통제는 VERIFIED_PASS. 그러나 권리-clear current-SOLD ${portfolio.rights_clear_current_sold_sources}, 활성 어댑터 ${portfolio.empirically_activated}이므로 외부 실증·Production·Public·G5는 HOLD.`,
  source_digests: { rights_fast_lane: rights.id, preflight: preflight.id, alignment: alignment.id, tower_contract: contract.id },
  sources: {
    tower_contract: 'coordination/kidults/governance/management-control-tower-contract-v1.json',
    rights_fast_lane: 'coordination/kidults/source-intelligence/asi-rights-analysis-fast-lane-decisions-v1.json',
    preflight: 'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json',
    sample_policy: 'coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json',
    release_assurance: 'coordination/kidults/governance/release-assurance-contract-v1.json'
  },
  kpis: [
    ['권리-clear SOLD', String(portfolio.rights_clear_current_sold_sources), `12 Fast Lane 중 ${portfolio.rights_clear_current_sold_sources}`],
    ['활성 어댑터', `${portfolio.empirically_activated} / ${portfolio.software_adapters_implemented_fixture_verified}`, `구현·fixture 검증 ${portfolio.software_adapters_implemented_fixture_verified}`],
    ['검증 SOLD 이벤트', String(portfolio.verified_current_sold_events), `Evidence admitted ${portfolio.evidence_admitted}`],
    ['자연 실행', '0 / 30', 'Production 최소 조건'], ['외부 출시', 'HOLD', 'Public · Production · G5'], ['표본·무결성 정책', 'ACTIVE', 'protected main 기준']
  ],
  funnel: [['Internal policy / CI','PASS',100,'pass'],['Value + rights census',`${portfolio.rights_clear_current_sold_sources} eligible`,0,'block'],['Schema + live snapshot',`${portfolio.immutable_live_source_snapshots_verified} verified`,0,'block'],['Adapter activation',`${portfolio.empirically_activated} / ${portfolio.software_adapters_implemented_fixture_verified}`,0,'block'],['Evidence cohort',`${portfolio.verified_current_sold_events} events`,0,'block'],['Natural SLO','0 / 30 runs',0,'hold'],['Production / Public','HOLD',0,'hold']],
  decisions: [['1. HOLD 소스의 capture·reuse 권리 증거 확보','TRACK Z · 서면 목적별 허가 없이는 수집하지 않음'],['2. Fast Lane 12건을 PASS / CONDITIONAL / HOLD / NO-GO로 종결','KPMO Rights Ops · 공식 evidence snapshot 결속'],['3. 첫 권리·가치·schema 통과 소스만 adapter 활성화','Track A/B/D · 동적 cohort와 영구 receipt'],['4. Production 주장을 요청할 때 30 natural runs / 7일 충족','자동 승격·기준 하향 금지']],
  rights_summary: { total: rights.records.length, active: counts.ACTIVE || 0, queued: counts.QUEUED || 0, hold: counts.HOLD || 0, no_go: counts.NO_GO || 0 },
  records: rights.records.map(row => [row.source_id, row.decision, row.route.replaceAll('_',' '), row.next_action]),
  governance: [['내부 정책·CI','VERIFIED_PASS','pass'],['권리·schema 통과 source',String(portfolio.rights_clear_current_sold_sources),'hold'],['current-SOLD event',String(portfolio.verified_current_sold_events),'hold'],['주장 가능한 데이터상품','없음','hold'],['Production / Public / G5','HOLD','hold']]
};
const out = resolve(root, 'apps/kidults-enterprise-staging/public/executive/control-tower-snapshot-v1.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
const htmlPath = resolve(root, 'apps/kidults-enterprise-staging/public/executive/control-tower.html');
const html = readFileSync(htmlPath, 'utf8');
const embeddedPattern = /    const D = \{.*?\};\n    const esc=/s;
if (!embeddedPattern.test(html)) throw new Error('CONTROL_TOWER_EMBEDDED_SNAPSHOT_MARKER_MISSING');
const embedded = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
writeFileSync(htmlPath, html.replace(embeddedPattern, `    const D = ${embedded};\n    const esc=`));
console.log(JSON.stringify({ out, as_of: snapshot.as_of, rights_clear: portfolio.rights_clear_current_sold_sources, activated: portfolio.empirically_activated }));
