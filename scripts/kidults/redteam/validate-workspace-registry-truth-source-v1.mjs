import fs from 'node:fs';

const workspacePagePath = 'apps/kidults-enterprise-staging/public/portal/workspace-page.js';
const registryPath = 'apps/kidults-enterprise-staging/public/portal/data/registry-view.json';
const redirectsPath = 'apps/kidults-enterprise-staging/public/portal/_redirects';

const workspacePage = fs.readFileSync(workspacePagePath, 'utf8');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const redirects = fs.readFileSync(redirectsPath, 'utf8').trim();
const errors = [];

function requireTrue(condition, message) {
  if (!condition) errors.push(message);
}

for (const marker of [
  'registrySnapshotContext(data.registry)',
  'registryEvidenceContext(data.registry)',
  'data.registry?.assessment?.current_id',
  'data.registry?.release?.status',
  'candidateSnapshotId: data.registry?.snapshot?.candidate_id ?? null',
  'evidencePackageId: data.registry?.evidence?.current_package_id ?? null',
]) {
  requireTrue(workspacePage.includes(marker), `Workspace Registry truth marker missing: ${marker}`);
}

for (const prohibited of [
  'data.summary?.operations',
  'item.label === "EVIDENCE OBJECTS"',
  'snapshotId: data.manifest?.snapshot_id',
  '417 · PREVIEW',
]) {
  requireTrue(!workspacePage.includes(prohibited), `Workspace status must not use preview fallback: ${prohibited}`);
}

requireTrue(
  redirects === '/ /index.html 200\n/workspace /workspace.html 200',
  'Enterprise staging must serve the original responsive Portal at / and keep Workspace at /workspace.',
);

requireTrue(registry?.publication?.candidate_publication === 'PROHIBITED', 'Registry candidate publication must remain fail-closed.');
requireTrue(registry?.release?.status === 'HOLD', 'Registry release must remain HOLD before G5.');

if (registry?.snapshot?.candidate_id == null) {
  requireTrue(registry?.snapshot?.candidate_status, 'Registry without candidate_id must expose candidate_status.');
}
if (registry?.evidence?.current_package_id == null) {
  requireTrue(registry?.evidence?.status, 'Registry without evidence package must expose evidence status.');
}

if (errors.length) {
  console.error(JSON.stringify({
    suite: 'KIDULTS_WORKSPACE_REGISTRY_TRUTH_SOURCE_V1',
    result: 'FAIL',
    errors,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_WORKSPACE_REGISTRY_TRUTH_SOURCE_V1',
  result: 'PASS',
  candidate_id: registry.snapshot?.candidate_id ?? null,
  evidence_package_id: registry.evidence?.current_package_id ?? null,
  assessment: registry.assessment?.status ?? 'NOT_AVAILABLE',
  release: registry.release?.status ?? 'NOT_AVAILABLE',
  enterprise_root: 'ORIGINAL_RESPONSIVE_PORTAL',
  workspace_route: '/workspace',
}, null, 2));
