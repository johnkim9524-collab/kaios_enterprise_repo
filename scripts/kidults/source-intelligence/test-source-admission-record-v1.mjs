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
    ['conditional_collect', r => { r.rights.collect = 'CONDITIONAL'; }],
    ['conditional_store', r => { r.rights.store = 'CONDITIONAL'; }],
    ['conditional_derive', r => { r.rights.derive = 'CONDITIONAL'; }],
    ['denied_collect', r => { r.rights.collect = 'DENY'; }],
    ['unknown_store', r => { r.rights.store = 'UNKNOWN'; }],
    ['unknown_derive', r => { r.rights.derive = 'UNKNOWN'; }],
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

  const conditionalHold = structuredClone(base);
  conditionalHold.state = 'CONDITIONAL';
  conditionalHold.rights.collect = 'CONDITIONAL';
  const conditionalHoldResult = execute(conditionalHold, 'conditional-hold-representable');
  if (conditionalHoldResult.status !== 0) throw new Error(`conditional HOLD record should remain representable:\n${conditionalHoldResult.stderr}`);

  const archival = structuredClone(base);
  archival.state = 'BLOCKED';
  archival.expires_at = '2026-08-19T00:00:00Z';
  const archivalResult = execute(archival, 'blocked-expired-archive');
  if (archivalResult.status !== 0) throw new Error(`blocked archival record should remain representable:\n${archivalResult.stderr}`);

  console.log(JSON.stringify({
    suite: 'KIDULTS_SOURCE_ADMISSION_TEMPORAL_RIGHTS_SELFTEST_V1',
    result: 'PASS',
    baseline_admitted: true,
    admitted_execution_rights_exact_allow_required: true,
    conditional_execution_rights_hold_representable: true,
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
