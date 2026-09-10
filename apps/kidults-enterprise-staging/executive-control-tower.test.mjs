import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import {
  buildControlTowerModel,
  loadControlTowerSources
} from '../../scripts/kidults/kpmo/lib/management-control-tower-model-v1.mjs';

const file = path.join(import.meta.dirname, 'public/executive/control-tower.html');
const html = fs.readFileSync(file, 'utf8');
const snapshot = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'public/executive/control-tower-snapshot-v1.json'), 'utf8'));
const root = path.resolve(import.meta.dirname, '../..');
const refreshWorkflow = fs.readFileSync(path.join(root, '.github/workflows/kidults-management-control-tower-refresh-v1.yml'), 'utf8');
const inlineScript = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
const localProducerEnv = { ...process.env, GITHUB_ACTIONS: 'false' };

function uiSnapshot({ generatedAt, staleAfter, headline }) {
  const value = structuredClone(snapshot);
  value.as_of = generatedAt;
  value.generated_at = generatedAt;
  value.stale_after = staleAfter;
  value.freshness.stale_after = staleAfter;
  value.freshness.state_at_build = 'TRANSPORT_FRESH';
  value.freshness.transport.generated_at = generatedAt;
  value.freshness.transport.stale_after = staleAfter;
  value.freshness.evidence.oldest_material_age_minutes_at_build =
    (Date.parse(generatedAt) - Date.parse(value.source_as_of)) / 60_000;
  value.headline = headline;
  return value;
}

function canonicalUiSnapshot(value) {
  const result = structuredClone(value);
  const sourceSha = 'b'.repeat(40);
  result.producer = {
    ...result.producer,
    generation_class: 'CANONICAL_MAIN',
    workflow_ref: 'johnkim9524-collab/kaios_enterprise_repo/.github/workflows/kidults-management-control-tower-refresh-v1.yml@refs/heads/main',
    event_name: 'push',
    trigger_ref: 'refs/heads/main',
    source_ref: 'refs/heads/main',
    source_sha: sourceSha,
    run_id: '123456',
    run_attempt: '1',
    artifact_name: `kidults-management-control-tower-canonical-${sourceSha}-123456-1`
  };
  return result;
}

async function runDashboardUi({ initial, incoming, fetchError = false, observedAt }) {
  assert.ok(inlineScript, 'inline dashboard script is required');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', innerHTML: '', dataset: {} });
    return elements.get(id);
  };
  const intervals = [];
  class ControlledDate extends Date {
    static now() { return observedAt; }
  }
  const script = inlineScript.replace(
    /const D = \{.*?\};\n    const esc=/s,
    `const D = ${JSON.stringify(initial)};\n    const esc=`
  );
  assert.notEqual(script, inlineScript, 'test snapshot must replace the embedded fallback');
  const fetch = fetchError
    ? () => Promise.reject(new Error('TEST_FETCH_FAILURE'))
    : () => Promise.resolve({ ok: true, json: () => Promise.resolve(structuredClone(incoming)) });
  vm.runInNewContext(script, {
    Date: ControlledDate,
    document: { getElementById: element },
    fetch,
    setInterval: callback => { intervals.push(callback); return intervals.length; }
  }, { filename: 'control-tower-inline-script.js' });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { element, tick: () => intervals.forEach(callback => callback()) };
}

test('management control tower is a governed read-only surface', () => {
  assert.match(html, /INTERNAL · READ-ONLY · GOVERNED SNAPSHOT/);
  assert.match(html, /권리-clear current-SOLD 0/);
  assert.match(html, /Production \/ Public \/ G5/);
  assert.match(html, /no live provider payloads/);
  assert.match(html, /WHAT MANAGEMENT SEES/);
  assert.match(html, /WHAT MANAGEMENT DECIDES/);
});

test('dashboard exposes decision queue and source truth boundaries', () => {
  assert.equal(snapshot.rights_summary.hold, 3);
  assert.equal(snapshot.rights_summary.no_go, 9);
  assert.equal(snapshot.rights_summary.pass, 0);
  assert.equal(snapshot.rights_summary.conditional, 0);
  assert.equal('active' in snapshot.rights_summary, false);
  assert.equal('queued' in snapshot.rights_summary, false);
  assert.match(html, /HOLD 소스의 capture·reuse 권리 증거 확보/);
  assert.match(html, /30 natural runs/);
  assert.match(html, /current-sold-sample-governance-v1\.json/);
  assert.match(html, /management-control-tower-contract-v1\.json/);
  assert.match(html, /unknown.*추정|추정하지 않습니다/);
  assert.match(html, /state==='NO_GO'\?'nog'/);
  assert.doesNotMatch(html, /active 조사|queued \$\{/);
  assert.equal(snapshot.production_evidence_producer.contract_id, 'KIDULTS_CONTROLLED_PRODUCTION_PROMOTION_V1');
  assert.equal(snapshot.production_evidence_producer.canonical_policy_version, '1.1.0');
  assert.equal(snapshot.production_evidence_producer.availability, 'IMPLEMENTED_FAIL_CLOSED_AWAITING_ROOT_HELPER_INSTALL_AND_EVIDENCE');
  assert.equal(snapshot.production_evidence_producer.certification_state, 'HOLD');
  assert.equal(snapshot.production_evidence_producer.production_authority, 'HARD_DISABLED');
  assert.match(html, /Production evidence producer/);
  assert.match(html, /HARD_DISABLED/);
  assert.match(html, /ROOT HELPER INSTALL PENDING/);
});

test('control tower rejects forged Production evidence producer authority', () => {
  const sources = loadControlTowerSources(root);
  sources.production_promotion.json = structuredClone(sources.production_promotion.json);
  sources.production_promotion.json.evidence_producer.availability = 'IMPLEMENTED';
  sources.production_promotion.json.evidence_producer.production_authority = 'ENABLED';
  assert.throws(
    () => buildControlTowerModel(sources, snapshot.generated_at, snapshot.producer),
    /CONTROL_TOWER_PRODUCTION_EVIDENCE_PRODUCER_STATE/
  );
  const sourcePolicyForgery = loadControlTowerSources(root);
  sourcePolicyForgery.tower_contract.json = structuredClone(sourcePolicyForgery.tower_contract.json);
  sourcePolicyForgery.tower_contract.json.source_contracts = sourcePolicyForgery.tower_contract.json.source_contracts.slice(0, -1);
  assert.throws(
    () => buildControlTowerModel(sourcePolicyForgery, snapshot.generated_at, snapshot.producer),
    /CONTROL_TOWER_SOURCE_CONTRACT_POLICY/
  );
});

test('dashboard supports latest governed snapshot refresh', () => {
  assert.match(html, /control-tower-snapshot-v1\.json/);
  assert.match(html, /cache:'no-store'/);
  assert.doesNotMatch(html, /PR #1655|protected landing 대기/);
  const embedded = html.match(/const D = (\{.*?\});\n\s+const esc=/s);
  assert.ok(embedded, 'embedded governed fallback snapshot is required');
  assert.deepEqual(JSON.parse(embedded[1]), snapshot);
  assert.match(html, /freshnessBanner/);
  assert.match(html, /SNAPSHOT_STALE/);
  assert.match(html, /SNAPSHOT_STALE_FETCH_ERROR/);
  assert.match(html, /SNAPSHOT_FETCH_ERROR/);
  assert.match(html, /SNAPSHOT_OLDER_IGNORED/);
  assert.match(html, /SNAPSHOT_STALE_OLDER_IGNORED/);
  assert.match(html, /SNAPSHOT_CONFLICT_IGNORED/);
  assert.match(html, /SNAPSHOT_STALE_CONFLICT_IGNORED/);
  assert.match(html, /SNAPSHOT_UNATTESTED_LOCAL_FALLBACK/);
  assert.match(html, /SNAPSHOT_STALE_UNATTESTED_LOCAL_FALLBACK/);
  assert.match(html, /evidenceFreshnessBanner/);
  assert.match(html, /EVIDENCE_FRESHNESS_UNASSESSED/);
  assert.match(html, /classifySnapshotUiState/);
  assert.doesNotMatch(html, /\.catch\(\(\)=>\{\}\)/);
});

test('stale fallback plus fetch failure is classified jointly and persists across freshness ticks', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T07:00:00Z',
    staleAfter: '2026-08-31T08:30:00Z',
    headline: 'CURRENT STALE FALLBACK'
  });
  const ui = await runDashboardUi({ initial, fetchError: true, observedAt });
  const banner = ui.element('freshnessBanner');
  assert.equal(banner.dataset.state, 'SNAPSHOT_STALE_FETCH_ERROR');
  assert.equal(banner.hidden, false);
  assert.match(banner.innerHTML, /불러오지 못했고.*freshness SLO/);
  assert.equal(ui.element('headline').textContent, 'CURRENT STALE FALLBACK');
  ui.tick();
  assert.equal(banner.dataset.state, 'SNAPSHOT_STALE_FETCH_ERROR');
});

test('fresh local fallback remains visibly unattested', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T09:30:00Z',
    staleAfter: '2026-08-31T11:00:00Z',
    headline: 'LOCAL FALLBACK'
  });
  const ui = await runDashboardUi({ initial, incoming: structuredClone(initial), observedAt });
  const banner = ui.element('freshnessBanner');
  assert.equal(banner.dataset.state, 'SNAPSHOT_UNATTESTED_LOCAL_FALLBACK');
  assert.equal(banner.hidden, false);
  assert.match(banner.innerHTML, /protected-main CI.*attestation/);
  const evidenceBanner = ui.element('evidenceFreshnessBanner');
  assert.equal(evidenceBanner.dataset.state, 'EVIDENCE_FRESHNESS_UNASSESSED');
  assert.equal(evidenceBanner.hidden, false);
  assert.match(evidenceBanner.innerHTML, /임계값이 정의되지 않아 최신성을 판정하지 않습니다/);
});

test('fresh canonical transport still displays evidence freshness as unassessed', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = canonicalUiSnapshot(uiSnapshot({
    generatedAt: '2026-08-31T09:30:00Z',
    staleAfter: '2026-08-31T11:00:00Z',
    headline: 'FRESH TRANSPORT UNASSESSED EVIDENCE'
  }));
  const ui = await runDashboardUi({ initial, incoming: structuredClone(initial), observedAt });
  assert.equal(ui.element('freshnessBanner').hidden, true);
  const evidenceBanner = ui.element('evidenceFreshnessBanner');
  assert.equal(evidenceBanner.dataset.state, 'EVIDENCE_FRESHNESS_UNASSESSED');
  assert.equal(evidenceBanner.hidden, false);
  assert.match(evidenceBanner.innerHTML, /가장 오래된 material evidence/);
});

test('fetched snapshot cannot self-declare evidence freshness', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T09:30:00Z',
    staleAfter: '2026-08-31T11:00:00Z',
    headline: 'VALID UNASSESSED EVIDENCE'
  });
  const incoming = uiSnapshot({
    generatedAt: '2026-08-31T09:45:00Z',
    staleAfter: '2026-08-31T11:15:00Z',
    headline: 'SELF DECLARED FRESH MUST NOT RENDER'
  });
  incoming.freshness.evidence.state_at_build = 'FRESH';
  const ui = await runDashboardUi({ initial, incoming, observedAt });
  assert.equal(ui.element('headline').textContent, 'VALID UNASSESSED EVIDENCE');
  assert.equal(ui.element('freshnessBanner').dataset.state, 'SNAPSHOT_FETCH_ERROR');
  assert.equal(ui.element('evidenceFreshnessBanner').dataset.state, 'EVIDENCE_FRESHNESS_UNASSESSED');
});

test('fetched snapshot cannot self-enable the missing Production evidence producer', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T09:30:00Z',
    staleAfter: '2026-08-31T11:00:00Z',
    headline: 'PRODUCER HARD DISABLED'
  });
  const incoming = uiSnapshot({
    generatedAt: '2026-08-31T09:45:00Z',
    staleAfter: '2026-08-31T11:15:00Z',
    headline: 'FORGED PRODUCER ENABLED'
  });
  incoming.production_evidence_producer.availability = 'IMPLEMENTED';
  incoming.production_evidence_producer.production_authority = 'ENABLED';
  const ui = await runDashboardUi({ initial, incoming, observedAt });
  assert.equal(ui.element('headline').textContent, 'PRODUCER HARD DISABLED');
  assert.equal(ui.element('freshnessBanner').dataset.state, 'SNAPSHOT_FETCH_ERROR');
});

test('older fetched snapshot is visibly ignored without replacing the active snapshot', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T09:30:00Z',
    staleAfter: '2026-08-31T11:00:00Z',
    headline: 'CURRENT NEWER SNAPSHOT'
  });
  const incoming = uiSnapshot({
    generatedAt: '2026-08-31T09:00:00Z',
    staleAfter: '2026-08-31T10:30:00Z',
    headline: 'OLDER SNAPSHOT MUST NOT RENDER'
  });
  const ui = await runDashboardUi({ initial, incoming, observedAt });
  const banner = ui.element('freshnessBanner');
  assert.equal(banner.dataset.state, 'SNAPSHOT_OLDER_IGNORED');
  assert.equal(banner.hidden, false);
  assert.match(banner.innerHTML, /현재 검증본보다 오래되어 적용하지 않았습니다/);
  assert.equal(ui.element('headline').textContent, 'CURRENT NEWER SNAPSHOT');
});

test('older response against an already stale active snapshot retains both conditions', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T07:00:00Z',
    staleAfter: '2026-08-31T08:30:00Z',
    headline: 'STALE BUT NEWER ACTIVE SNAPSHOT'
  });
  const incoming = uiSnapshot({
    generatedAt: '2026-08-31T06:00:00Z',
    staleAfter: '2026-08-31T07:30:00Z',
    headline: 'OLDER STALE SNAPSHOT MUST NOT RENDER'
  });
  const ui = await runDashboardUi({ initial, incoming, observedAt });
  const banner = ui.element('freshnessBanner');
  assert.equal(banner.dataset.state, 'SNAPSHOT_STALE_OLDER_IGNORED');
  assert.equal(banner.hidden, false);
  assert.equal(ui.element('headline').textContent, 'STALE BUT NEWER ACTIVE SNAPSHOT');
});

test('same-timestamp conflicting snapshot is visibly rejected without replacing the active snapshot', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T09:30:00Z',
    staleAfter: '2026-08-31T11:00:00Z',
    headline: 'TRUSTED ACTIVE SNAPSHOT'
  });
  const incoming = structuredClone(initial);
  incoming.headline = 'CONFLICTING SNAPSHOT MUST NOT RENDER';
  const ui = await runDashboardUi({ initial, incoming, observedAt });
  const banner = ui.element('freshnessBanner');
  assert.equal(banner.dataset.state, 'SNAPSHOT_CONFLICT_IGNORED');
  assert.equal(banner.hidden, false);
  assert.match(banner.innerHTML, /동일 생성시각의 상충 governed snapshot/);
  assert.equal(ui.element('headline').textContent, 'TRUSTED ACTIVE SNAPSHOT');
});

test('fetched snapshot cannot extend its own freshness window', async () => {
  const observedAt = Date.parse('2026-08-31T10:00:00Z');
  const initial = uiSnapshot({
    generatedAt: '2026-08-31T09:30:00Z',
    staleAfter: '2026-08-31T11:00:00Z',
    headline: 'VALID ACTIVE SNAPSHOT'
  });
  const incoming = uiSnapshot({
    generatedAt: '2026-08-31T09:45:00Z',
    staleAfter: '2099-01-01T00:00:00Z',
    headline: 'FORGED FRESHNESS MUST NOT RENDER'
  });
  const ui = await runDashboardUi({ initial, incoming, observedAt });
  const banner = ui.element('freshnessBanner');
  assert.equal(banner.dataset.state, 'SNAPSHOT_FETCH_ERROR');
  assert.equal(banner.hidden, false);
  assert.equal(ui.element('headline').textContent, 'VALID ACTIVE SNAPSHOT');
});

test('scheduled refresh is exact-head, bounded and repository read-only', () => {
  assert.match(refreshWorkflow, /cron: '52 \* \* \* \*'/);
  assert.match(refreshWorkflow, /KIDULTS_EXACT_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(refreshWorkflow, /ref: \$\{\{ env\.KIDULTS_EXACT_SOURCE_SHA \}\}/);
  assert.match(refreshWorkflow, /test "\$\(git rev-parse HEAD\)" = "\$KIDULTS_EXACT_SOURCE_SHA"/);
  assert.match(refreshWorkflow, /fetch-depth: 0/);
  assert.match(refreshWorkflow, /KIDULTS_CONTROL_TOWER_SNAPSHOT_OUT: \/tmp\/kidults-management-control-tower\/control-tower-snapshot-v1\.json/);
  assert.match(refreshWorkflow, /KIDULTS_CONTROL_TOWER_GENERATION_CLASS: \$\{\{ github\.event_name == 'pull_request' && 'CANDIDATE_PR' \|\| 'CANONICAL_MAIN' \}\}/);
  assert.match(refreshWorkflow, /kidults-management-control-tower-candidate-\$\{KIDULTS_EXACT_SOURCE_SHA\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(refreshWorkflow, /kidults-management-control-tower-canonical-\$\{KIDULTS_EXACT_SOURCE_SHA\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(refreshWorkflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(refreshWorkflow, /\[\[ "\$KIDULTS_CONTROL_TOWER_ARTIFACT_NAME" != \*canonical\* \]\]/);
  assert.match(refreshWorkflow, /name: \$\{\{ env\.KIDULTS_CONTROL_TOWER_ARTIFACT_NAME \}\}/);
  assert.match(refreshWorkflow, /validate-management-control-tower-snapshot-v1\.mjs[\s\\\S]*--require-fresh/);
  assert.match(refreshWorkflow, /git status --porcelain=v1 --untracked-files=all/);
  assert.match(refreshWorkflow, /git diff --exit-code HEAD --/);
  assert.doesNotMatch(refreshWorkflow, /contents:\s*write/);
  assert.doesNotMatch(refreshWorkflow, /workflow_run:/);
});

test('builder regenerates exact source digests and validates a fresh artifact without repository mutation', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-control-tower-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const generatedSnapshotPath = path.join(directory, 'control-tower-snapshot-v1.json');
  const generatedHtmlPath = path.join(directory, 'control-tower.html');
  fs.copyFileSync(file, generatedHtmlPath);
  const build = spawnSync(process.execPath, ['scripts/kidults/kpmo/build-management-control-tower-snapshot-v1.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...localProducerEnv,
      KIDULTS_CONTROL_TOWER_SNAPSHOT_OUT: generatedSnapshotPath,
      KIDULTS_CONTROL_TOWER_HTML_OUT: generatedHtmlPath
    }
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const generated = JSON.parse(fs.readFileSync(generatedSnapshotPath, 'utf8'));
  assert.equal(generated.as_of, generated.generated_at);
  assert.equal(Date.parse(generated.stale_after) - Date.parse(generated.generated_at), 90 * 60_000);
  assert.equal(generated.freshness.state_at_build, 'TRANSPORT_FRESH');
  assert.equal(generated.freshness.evidence.state_at_build, 'UNASSESSED');
  assert.equal(generated.freshness.evidence.threshold, 'NOT_DEFINED');
  assert.equal(generated.freshness.evidence.oldest_material_age_minutes_at_build,
    (Date.parse(generated.generated_at) - Date.parse(generated.source_as_of)) / 60_000);
  for (const [name, sourcePath] of Object.entries(generated.sources)) {
    const expected = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, sourcePath), 'utf8')).digest('hex')}`;
    assert.equal(generated.source_digests[name], expected, `source digest drift: ${name}`);
  }
  const validate = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs', generatedSnapshotPath, generatedHtmlPath], {
    cwd: root,
    encoding: 'utf8',
    env: localProducerEnv
  });
  assert.equal(validate.status, 0, validate.stderr || validate.stdout);
});

test('snapshot digest mutation is rejected', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-control-tower-negative-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const badSnapshotPath = path.join(directory, 'bad-snapshot.json');
  const generatedHtmlPath = path.join(directory, 'control-tower.html');
  fs.copyFileSync(file, generatedHtmlPath);
  const build = spawnSync(process.execPath, ['scripts/kidults/kpmo/build-management-control-tower-snapshot-v1.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...localProducerEnv, KIDULTS_CONTROL_TOWER_SNAPSHOT_OUT: badSnapshotPath, KIDULTS_CONTROL_TOWER_HTML_OUT: generatedHtmlPath }
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const bad = JSON.parse(fs.readFileSync(badSnapshotPath, 'utf8'));
  bad.source_digests.rights_fast_lane = `sha256:${'0'.repeat(64)}`;
  fs.writeFileSync(badSnapshotPath, `${JSON.stringify(bad, null, 2)}\n`);
  const validate = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs', badSnapshotPath, generatedHtmlPath], {
    cwd: root,
    encoding: 'utf8',
    env: localProducerEnv
  });
  assert.notEqual(validate.status, 0);
  assert.match(validate.stderr, /SNAPSHOT_SOURCE_DIGEST_MISMATCH:rights_fast_lane/);
});

test('self-consistent semantic forgery is rejected after source digest verification', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-control-tower-semantic-negative-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotPath = path.join(directory, 'snapshot.json');
  const htmlPath = path.join(directory, 'control-tower.html');
  fs.copyFileSync(file, htmlPath);
  const build = spawnSync(process.execPath, ['scripts/kidults/kpmo/build-management-control-tower-snapshot-v1.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...localProducerEnv, KIDULTS_CONTROL_TOWER_SNAPSHOT_OUT: snapshotPath, KIDULTS_CONTROL_TOWER_HTML_OUT: htmlPath }
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const forged = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  forged.headline = 'FORGED RIGHTS CLEAR 999';
  fs.writeFileSync(snapshotPath, `${JSON.stringify(forged, null, 2)}\n`);
  const embedded = JSON.stringify(forged).replaceAll('<', '\\u003c');
  const forgedHtml = fs.readFileSync(htmlPath, 'utf8').replace(/    const D = \{.*?\};\n    const esc=/s, `    const D = ${embedded};\n    const esc=`);
  fs.writeFileSync(htmlPath, forgedHtml);
  const validate = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs', snapshotPath, htmlPath], {
    cwd: root,
    encoding: 'utf8',
    env: localProducerEnv
  });
  assert.notEqual(validate.status, 0);
  assert.match(validate.stderr, /SNAPSHOT_SEMANTIC_RECOMPUTATION_MISMATCH/);
});

test('self-declared fresh evidence state is rejected even with matching embedded fallback', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-control-tower-evidence-freshness-negative-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotPath = path.join(directory, 'snapshot.json');
  const htmlPath = path.join(directory, 'control-tower.html');
  fs.copyFileSync(file, htmlPath);
  const build = spawnSync(process.execPath, ['scripts/kidults/kpmo/build-management-control-tower-snapshot-v1.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...localProducerEnv, KIDULTS_CONTROL_TOWER_SNAPSHOT_OUT: snapshotPath, KIDULTS_CONTROL_TOWER_HTML_OUT: htmlPath }
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const forged = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  forged.freshness.evidence.state_at_build = 'FRESH';
  fs.writeFileSync(snapshotPath, `${JSON.stringify(forged, null, 2)}\n`);
  const embedded = JSON.stringify(forged).replaceAll('<', '\\u003c');
  const forgedHtml = fs.readFileSync(htmlPath, 'utf8').replace(/    const D = \{.*?\};\n    const esc=/s, `    const D = ${embedded};\n    const esc=`);
  fs.writeFileSync(htmlPath, forgedHtml);
  const validate = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs', snapshotPath, htmlPath], {
    cwd: root,
    encoding: 'utf8',
    env: localProducerEnv
  });
  assert.notEqual(validate.status, 0);
  assert.match(validate.stderr, /SNAPSHOT_EVIDENCE_FRESHNESS_STATE/);
});

test('repository root substitution is rejected outside explicit test mode', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-control-tower-root-negative-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const validate = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...localProducerEnv, KIDULTS_REPO_ROOT: directory }
  });
  assert.notEqual(validate.status, 0);
  assert.match(validate.stderr, /CONTROL_TOWER_REPO_ROOT_OVERRIDE_FORBIDDEN/);
});

test('stale fallback remains integrity-valid while fresh refresh gate fails closed', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-control-tower-stale-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotPath = path.join(directory, 'snapshot.json');
  const htmlPath = path.join(directory, 'control-tower.html');
  fs.copyFileSync(file, htmlPath);
  const build = spawnSync(process.execPath, ['scripts/kidults/kpmo/build-management-control-tower-snapshot-v1.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...localProducerEnv, KIDULTS_CONTROL_TOWER_SNAPSHOT_OUT: snapshotPath, KIDULTS_CONTROL_TOWER_HTML_OUT: htmlPath }
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const built = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const validationAt = new Date(Date.parse(built.stale_after) + 1_000).toISOString();
  const env = { ...localProducerEnv, KIDULTS_ALLOW_TEST_CLOCK: '1', KIDULTS_CONTROL_TOWER_VALIDATION_AT: validationAt };
  const integrity = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs', snapshotPath, htmlPath], {
    cwd: root,
    encoding: 'utf8',
    env
  });
  assert.equal(integrity.status, 0, integrity.stderr || integrity.stdout);
  assert.equal(JSON.parse(integrity.stdout).freshness_state_at_validation, 'STALE');
  const freshnessGate = spawnSync(process.execPath, ['scripts/kidults/kpmo/validate-management-control-tower-snapshot-v1.mjs', snapshotPath, htmlPath, '--require-fresh'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...env, KIDULTS_ALLOW_TEST_PRODUCER: '1' }
  });
  assert.notEqual(freshnessGate.status, 0);
  assert.match(freshnessGate.stderr, /SNAPSHOT_FRESH_AT_VALIDATION_REQUIRED/);
});

test('evidence freshness terminal gate preserves governed UNASSESSED visibility without inventing an age threshold', t => {
  const gatePath = path.join(root, 'scripts/kidults/kpmo/enforce-management-control-tower-evidence-freshness-v1.mjs');
  const gateSource = fs.readFileSync(gatePath, 'utf8');
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'coordination/kidults/governance/management-control-tower-contract-v1.json'), 'utf8'));
  assert.equal(policy.snapshot_integrity.evidence_freshness_threshold, 'NOT_DEFINED');
  assert.equal(policy.snapshot_integrity.evidence_freshness_state, 'UNASSESSED_AND_VISIBLE');
  assert.match(gateSource, /management-control-tower-contract-v1\.json/);
  assert.match(gateSource, /snapshot_integrity\.evidence_freshness_threshold/);
  assert.match(gateSource, /CONTROL_TOWER_EVIDENCE_FRESHNESS_POLICY_UNSUPPORTED/);
  assert.match(gateSource, /CONTROL_TOWER_EVIDENCE_SELF_DECLARED_CLASSIFICATION/);
  assert.match(gateSource, /CONTROL_TOWER_EVIDENCE_SOURCE_IN_FUTURE/);
  assert.match(gateSource, /CONTROL_TOWER_EVIDENCE_AGE_BINDING_MISMATCH/);
  assert.doesNotMatch(gateSource, /current-sold-admission-contract-v1\.json/);
  assert.doesNotMatch(gateSource, /empirical_evidence_freshness_minutes/);
  assert.doesNotMatch(gateSource, /CONTROL_TOWER_EVIDENCE_STALE/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-control-tower-evidence-gate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotPath = path.join(directory, 'snapshot.json');
  const receiptPath = path.join(directory, 'validation-receipt.json');

  const runGate = value => {
    fs.writeFileSync(snapshotPath, `${JSON.stringify(value, null, 2)}\n`);
    const result = spawnSync(process.execPath, [gatePath, snapshotPath, receiptPath], {
      cwd: root,
      encoding: 'utf8',
      env: localProducerEnv
    });
    return { result, receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')) };
  };

  const generatedAt = '2026-09-04T00:00:00.000Z';
  const unassessed = structuredClone(snapshot);
  unassessed.generated_at = generatedAt;
  unassessed.source_as_of = '2026-08-27T00:00:00.000Z';
  unassessed.freshness.evidence.state_at_build = 'UNASSESSED';
  unassessed.freshness.evidence.threshold = 'NOT_DEFINED';
  unassessed.freshness.evidence.aggregate_as_of = unassessed.source_as_of;
  unassessed.freshness.evidence.oldest_material_age_minutes_at_build = 8 * 24 * 60;
  const unassessedResult = runGate(unassessed);
  assert.equal(unassessedResult.result.status, 0, unassessedResult.result.stderr || unassessedResult.result.stdout);
  assert.equal(unassessedResult.receipt.state, 'VERIFIED_HOLD');
  assert.equal(unassessedResult.receipt.operational_outcome, 'SUCCESS_WITH_GOVERNED_HOLD');
  assert.deepEqual(unassessedResult.receipt.failed_check_ids, ['CONTROL_TOWER_EVIDENCE_FRESHNESS_UNASSESSED']);
  assert.equal(unassessedResult.receipt.evidence_freshness.state_at_validation, 'UNASSESSED');
  assert.equal(unassessedResult.receipt.evidence_freshness.freshness_claim, 'NONE');
  assert.equal(unassessedResult.receipt.evidence_freshness.threshold, 'NOT_DEFINED');
  assert.equal(unassessedResult.receipt.evidence_freshness.threshold_minutes, null);
  assert.equal(unassessedResult.receipt.promotion_eligible, false);
  assert.equal(unassessedResult.receipt.evidence_admission, 'NONE');
  assert.notEqual(unassessedResult.receipt.state, 'VERIFIED_PASS');
  assert.match(gateSource, /SUCCESS_WITH_GOVERNED_HOLD/);
  assert.match(gateSource, /CONTROL_TOWER_EVIDENCE_FRESHNESS_UNASSESSED/);

  const selfDeclaredFresh = structuredClone(unassessed);
  selfDeclaredFresh.freshness.evidence.state_at_build = 'FRESH';
  const selfDeclaredFreshResult = runGate(selfDeclaredFresh);
  assert.notEqual(selfDeclaredFreshResult.result.status, 0);
  assert.deepEqual(selfDeclaredFreshResult.receipt.failed_check_ids, ['CONTROL_TOWER_EVIDENCE_SELF_DECLARED_CLASSIFICATION']);

  const future = structuredClone(unassessed);
  future.source_as_of = '2026-09-05T00:00:00.000Z';
  future.freshness.evidence.aggregate_as_of = future.source_as_of;
  future.freshness.evidence.oldest_material_age_minutes_at_build = -24 * 60;
  const futureResult = runGate(future);
  assert.notEqual(futureResult.result.status, 0);
  assert.deepEqual(futureResult.receipt.failed_check_ids, ['CONTROL_TOWER_EVIDENCE_SOURCE_IN_FUTURE']);

  const mismatched = structuredClone(unassessed);
  mismatched.freshness.evidence.oldest_material_age_minutes_at_build = 1;
  const mismatchedResult = runGate(mismatched);
  assert.notEqual(mismatchedResult.result.status, 0);
  assert.deepEqual(mismatchedResult.receipt.failed_check_ids, ['CONTROL_TOWER_EVIDENCE_AGE_BINDING_MISMATCH']);
});

test('control tower workflow preserves the evidence terminal receipt on failure', () => {
  assert.equal((refreshWorkflow.match(/enforce-management-control-tower-evidence-freshness-v1\.mjs/g) || []).length, 4);
  assert.equal((refreshWorkflow.match(/coordination\/kidults\/governance\/management-control-tower-contract-v1\.json/g) || []).length, 2);
  assert.equal((refreshWorkflow.match(/coordination\/kidults\/market\/current-sold-admission-contract-v1\.json/g) || []).length, 0);
  assert.match(refreshWorkflow, /transport-validation-receipt\.json/);
  assert.match(refreshWorkflow, /enforce-management-control-tower-evidence-freshness-v1\.mjs[\s\S]*validation-receipt\.json/);
  assert.match(refreshWorkflow, /Upload exact-head governed terminal packet\n\s+if: always\(\)/);
  assert.ok(refreshWorkflow.indexOf('transport-validation-receipt.json')
    < refreshWorkflow.indexOf('enforce-management-control-tower-evidence-freshness-v1.mjs \\'));
});
