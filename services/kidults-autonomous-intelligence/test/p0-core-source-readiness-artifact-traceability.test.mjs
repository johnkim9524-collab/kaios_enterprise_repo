import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = process.cwd();
const auditSource = fs.readFileSync(
  path.join(root, 'scripts', 'p0-engineering-quality-audit.mjs'),
  'utf8',
);
const workflowSource = fs.readFileSync(
  path.join(root, '..', '..', '.github', 'workflows', 'kidults-p0-speed-quality.yml'),
  'utf8',
);

test('core-source readiness diagnostic is retained in the always-uploaded quality audit', () => {
  assert.match(auditSource, /stage2-core-source-readiness-latest\.json/);
  assert.match(auditSource, /stage2CoreSourceReadiness: coreSourceReadiness/);
  assert.match(auditSource, /diagnosticsAreProductionEvidence: false/);
  assert.match(auditSource, /diagnosticsCanRelaxProductionGate: false/);
  assert.match(workflowSource, /- name: Engineering quality audit after validation\n\s+if: always\(\)/);
  assert.match(workflowSource, /- name: Upload engineering audits\n\s+if: always\(\)/);
  assert.match(workflowSource, /quality-audit-latest\.json/);
});

test('malformed core-source diagnostic is surfaced instead of silently trusted', () => {
  assert.match(auditSource, /INVALID_CORE_SOURCE_READINESS_DIAGNOSTIC/);
  assert.match(auditSource, /JSON\.parse\(await fs\.readFile\(coreSourceReadinessPath, 'utf8'\)\)/);
});
