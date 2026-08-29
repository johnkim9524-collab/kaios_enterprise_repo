#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PUBLIC_VERTICAL_METRIC_FIELDS,
  enforcePublicVerticalMetricBoundary,
  publicVerticalProjectionReady,
} from '../../../apps/kidults-enterprise-staging/public/portal/components/public-metric-boundary.js';
import {formatPct} from '../../../apps/kidults-enterprise-staging/public/portal/components/renderers.js';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const registry = read('apps/kidults-enterprise-staging/public/portal/data/registry-view.json');
const manifest = read('apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json');
const verticalData = read('apps/kidults-enterprise-staging/public/portal/data/verticals.json');
const canonical = read('coordination/kidults/registry/snapshot/records/baseline-provider-independent-v1.json');
const detailSource = fs.readFileSync('apps/kidults-enterprise-staging/public/portal/detail.js', 'utf8');

const portalRoot = 'apps/kidults-enterprise-staging/public/portal';
const portalRuntimeFiles = [];
const collectPortalRuntimeFiles = directory => {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectPortalRuntimeFiles(entryPath);
    else if (/\.(?:html|js|mjs)$/.test(entry.name)) portalRuntimeFiles.push(entryPath);
  }
};
collectPortalRuntimeFiles(portalRoot);
const inlineStyleEmission = /(?:\bstyle\s*=\s*["'`]|\.style\s*(?:\.|\[)|setAttribute\s*\(\s*['"]style['"]|\bcssText\b)/;
const inlineStyleFiles = portalRuntimeFiles.filter(file => inlineStyleEmission.test(fs.readFileSync(file, 'utf8')));
assert.deepEqual(inlineStyleFiles, [], `portal runtime must not emit inline styles under style-src 'self': ${inlineStyleFiles.join(', ')}`);

assert.equal(publicVerticalProjectionReady({registry, manifest, verticalData}), false);
for (const vertical of verticalData.verticals) {
  for (const field of PUBLIC_VERTICAL_METRIC_FIELDS) assert.equal(vertical[field], null, `${vertical.id}:${field}`);
}
assert.ok(canonical.vertical_metrics.some(vertical => Number.isFinite(vertical.right_data_coverage_pct)));
assert.equal(formatPct(null), 'NOT REGISTERED');
assert.equal(formatPct(undefined), 'NOT REGISTERED');
assert.equal(formatPct(''), 'NOT REGISTERED');
assert.equal(formatPct(0), '0%');
assert.equal(formatPct(50.13), '50.13%');
assert.match(detailSource, /enforcePublicVerticalMetricBoundary/);
assert.match(detailSource, /CONFIDENCE WITHHELD/);

const drifted = structuredClone(verticalData);
drifted.verticals[0].right_data_coverage_pct = 50.13;
drifted.verticals[0].demand_evidence_pct = 50.9;
const redacted = enforcePublicVerticalMetricBoundary({registry, manifest, verticalData: drifted});
assert.equal(redacted.projectionReady, false);
assert.equal(redacted.state, 'WITHHELD_PENDING_APPROVED_PROJECTION');
assert.equal(redacted.withheldFieldCount, 2);
assert.equal(redacted.verticalData.verticals[0].right_data_coverage_pct, null);
assert.equal(redacted.verticalData.verticals[0].demand_evidence_pct, null);

const candidateId = 'candidate-approved-r2';
const assessmentId = 'assessment-approved-r2';
const approvedRegistry = structuredClone(registry);
approvedRegistry.snapshot.candidate_id = candidateId;
approvedRegistry.snapshot.candidate_publication_eligible = true;
approvedRegistry.assessment.current_id = assessmentId;
approvedRegistry.assessment.overall_rankability = true;
approvedRegistry.assessment.publication_eligible = true;
approvedRegistry.publication.public_index_projection = 'projection-approved-public-r2';
const approvedManifest = {...manifest, candidate_snapshot_id:candidateId, assessment_id:assessmentId};
const approvedVerticals = {...drifted, source_snapshot_id:candidateId, metric_publication_state:'APPROVED_PROJECTION'};
assert.equal(publicVerticalProjectionReady({registry:approvedRegistry,manifest:approvedManifest,verticalData:approvedVerticals}), true);
const admitted = enforcePublicVerticalMetricBoundary({registry:approvedRegistry,manifest:approvedManifest,verticalData:approvedVerticals});
assert.equal(admitted.projectionReady, true);
assert.equal(admitted.withheldFieldCount, 0);
assert.equal(admitted.verticalData.verticals[0].right_data_coverage_pct, 50.13);

const negativeMutations = [
  ['candidate publication false', value => { value.registry.snapshot.candidate_publication_eligible=false; }],
  ['assessment missing', value => { value.registry.assessment.current_id=null; }],
  ['rankability false', value => { value.registry.assessment.overall_rankability=false; }],
  ['assessment publication false', value => { value.registry.assessment.publication_eligible=false; }],
  ['projection missing', value => { value.registry.publication.public_index_projection='NOT_AVAILABLE'; }],
  ['candidate sentinel', value => { value.registry.snapshot.candidate_id='WAITING'; value.manifest.candidate_snapshot_id='WAITING'; value.verticalData.source_snapshot_id='WAITING'; }],
  ['projection sentinel', value => { value.registry.publication.public_index_projection='PENDING'; }],
  ['manifest candidate mismatch', value => { value.manifest.candidate_snapshot_id='other'; }],
  ['manifest assessment mismatch', value => { value.manifest.assessment_id='other'; }],
  ['vertical source mismatch', value => { value.verticalData.source_snapshot_id='baseline-provider-independent-v1'; }],
  ['metric state withheld', value => { value.verticalData.metric_publication_state='WITHHELD_PENDING_APPROVED_PROJECTION'; }],
];
for (const [name, mutate] of negativeMutations) {
  const value={registry:structuredClone(approvedRegistry),manifest:structuredClone(approvedManifest),verticalData:structuredClone(approvedVerticals)};
  mutate(value);
  assert.equal(publicVerticalProjectionReady(value), false, name);
  assert.equal(enforcePublicVerticalMetricBoundary(value).verticalData.verticals[0].right_data_coverage_pct, null, name);
}

console.log(JSON.stringify({
  suite:'KIDULTS_PORTAL_PUBLIC_METRIC_BOUNDARY_V1',
  result:'PASS',
  public_percentages_without_approved_projection:'WITHHELD',
  canonical_internal_baseline_preserved:true,
  negative_mutations_rejected:negativeMutations.length,
  public_release:'HOLD',production:'HOLD',g5:'HOLD'
}, null, 2));
