import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildControlTowerModel,
  loadControlTowerSources,
  resolveControlTowerProducer,
  resolveControlTowerRoot,
  sha256Text
} from './lib/management-control-tower-model-v1.mjs';

const root = resolveControlTowerRoot();
const sources = loadControlTowerSources(root);
if (process.env.KIDULTS_CONTROL_TOWER_GENERATED_AT && process.env.KIDULTS_ALLOW_TEST_CLOCK !== '1') {
  throw new Error('CONTROL_TOWER_GENERATED_AT_OVERRIDE_FORBIDDEN');
}
const generatedAt = process.env.KIDULTS_CONTROL_TOWER_GENERATED_AT || new Date().toISOString();
const producer = resolveControlTowerProducer(root);
const snapshot = buildControlTowerModel(sources, generatedAt, producer);

const snapshotOut = resolve(process.env.KIDULTS_CONTROL_TOWER_SNAPSHOT_OUT || resolve(root, 'apps/kidults-enterprise-staging/public/executive/control-tower-snapshot-v1.json'));
const htmlPath = resolve(process.env.KIDULTS_CONTROL_TOWER_HTML_OUT || resolve(root, 'apps/kidults-enterprise-staging/public/executive/control-tower.html'));
mkdirSync(dirname(snapshotOut), { recursive: true });
mkdirSync(dirname(htmlPath), { recursive: true });
const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
writeFileSync(snapshotOut, snapshotText);
const html = readFileSync(htmlPath, 'utf8');
const embeddedPattern = /    const D = \{.*?\};\n    const esc=/s;
if (!embeddedPattern.test(html)) throw new Error('CONTROL_TOWER_EMBEDDED_SNAPSHOT_MARKER_MISSING');
const embedded = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
const renderedHtml = html.replace(embeddedPattern, `    const D = ${embedded};\n    const esc=`);
writeFileSync(htmlPath, renderedHtml);
console.log(JSON.stringify({
  id: 'kidults-management-control-tower-build-receipt-v1',
  version: '1.0.0',
  snapshot_out: snapshotOut,
  html_out: htmlPath,
  generated_at: generatedAt,
  stale_after: snapshot.stale_after,
  source_as_of: snapshot.source_as_of,
  source_as_of_by_input: snapshot.source_as_of_by_input,
  evidence_freshness: {
    state_at_build: snapshot.freshness.evidence.state_at_build,
    threshold: snapshot.freshness.evidence.threshold,
    oldest_material_age_minutes_at_build: snapshot.freshness.evidence.oldest_material_age_minutes_at_build
  },
  producer,
  output_digests: {
    snapshot_sha256: sha256Text(snapshotText),
    html_sha256: sha256Text(renderedHtml)
  },
  source_digests: snapshot.source_digests,
  rights_clear: sources.preflight.json.portfolio.rights_clear_current_sold_sources,
  activated: sources.preflight.json.portfolio.empirically_activated,
  production: 'HOLD',
  public: 'HOLD'
}));
