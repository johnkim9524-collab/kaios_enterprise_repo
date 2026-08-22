import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const validator = 'scripts/kidults/source-intelligence/validate-source-admission-record-v1.mjs';
const asOf = '2026-08-21T00:00:00Z';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-source-admission-'));

const base = {
  source_id: 'synthetic-source-001',
  scope: { category: 'collectibles', geography: 'US', language: 'en' },
  source_type: 'PARTNER_FIXTURE',
  access_channel: 'API',
  rights: {
    discover: 'ALLOW',
    collect: 'ALLOW',
    store: 'ALLOW',
    derive: 'ALLOW',
    display_internal: 'ALLOW',
    display_public: 'DENY'
  },
  technical_validity: 'PASS',
  evidence_validity: 'LIMITED',
  state: 'ADMITTED',
  assessed_at: '2026-08-20T00:00:00Z',
  expires_at: '2026-08-22T00:00:00Z',
  publication_eligible: false
};

function execute(record, name) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(record));
  return spawnSync(process.execPath, [validator, file, asOf], { encoding: 'utf8' });
}

try {
  const baseline = execute(base, 'baseline');
  if (baseline.status !== 0) throw new Error(`baseline rejected:\n${baseline.stdout}\n${baseline.stderr}`);

  const rejected = [
    ['missing_scope', r => { delete r.scope; }],
    ['null_scope', r => { r.scope = null; }],
    ['array_scope', r => { r.scope = []; }],
    ['missing_scope_category', r => { delete r.scope.category; }],
    ['malformed_scope_category', r => { r.scope.category = 42; }],
    ['missing_scope_geography', r => { delete r.scope.geography; }],
    ['malformed_scope_geography', r => { r.scope.geography = { region: 'US' }; }],
    ['malformed_scope_language', r => { r.scope.language = 7; }],
    ['missing_source_type', r => { delete r.source_type; }],
    ['malformed_source_type', r => { r.source_type = ['PARTNER_FIXTURE']; }],
    ['missing_access_channel', r => { delete r.access_channel; }],
    ['invalid_access_channel', r => { r.access_channel = 'UNDECLARED_TRANSPORT'; }],
    ['expired_rights', r => { r.expires_at = '2026-08-20T23:59:59Z'; }],
    ['malformed_expiry', r => { r.expires_at = 'not-a-date'; }],
    ['timezone_less_expiry', r => { r.expires_at = '2099-01-01T00:00:00'; }],
    ['invalid_calendar_expiry', r => { r.expires_at = '2099-02-30T00:00:00Z'; }],
    ['malformed_assessed_at', r => { r.assessed_at = 'invalid'; }],
    ['future_assessment', r => { r.assessed_at = '2026-08-22T00:00:00Z'; }]
  ];

  for (const [name, mutate] of rejected) {
    const record = structuredClone(base);
    mutate(record);
    const result = execute(record, name);
    if (result.status === 0) throw new Error(`mutation ${name} failed open`);
  }

  const archival = structuredClone(base);
  archival.state = 'BLOCKED';
  archival.expires_at = '2026-08-19T00:00:00Z';
  const archivalResult = execute(archival, 'blocked-expired-archive');
  if (archivalResult.status !== 0) throw new Error(`blocked archival record should remain representable:\n${archivalResult.stderr}`);

  console.log(JSON.stringify({
    suite: 'KIDULTS_SOURCE_ADMISSION_TEMPORAL_RIGHTS_SELFTEST_V1',
    result: 'PASS',
    baseline_admitted: true,
    source_context_schema_required: true,
    source_context_schema_fail_closed_mutations: 12,
    fail_closed_mutations_detected: rejected.length,
    blocked_expired_archival_record_supported: true,
    external_partner_data_ingestion: 'HOLD',
    empirical_gate_effect: 'NONE',
    production: 'HOLD',
    public: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED'
  }, null, 2));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
