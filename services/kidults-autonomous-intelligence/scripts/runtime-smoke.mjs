import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pkg = JSON.parse(readFileSync(resolve(cwd,'package.json'),'utf8'));
const wrangler = resolve(cwd,'node_modules','.bin',process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
const persistTo = process.env.KIDULTS_RUNTIME_SMOKE_PERSIST_TO || mkdtempSync(join(tmpdir(),'kidults-runtime-smoke-'));
const common = ['--local','--persist-to',persistTo];
const env = {
  ...process.env,
  CI:process.env.CI || '1',
  XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME || join(tmpdir(),'kidults-wrangler-config'),
  WRANGLER_SEND_METRICS:'false',
};

function run(args, capture = false) {
  return execFileSync(wrangler,args,{
    cwd,
    stdio:capture ? ['ignore','pipe','inherit'] : 'inherit',
    encoding:capture ? 'utf8' : undefined,
    env,
  });
}

function query(sql) {
  const output = run(['d1','execute','DB',...common,'--command',sql,'--json'],true);
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.some((entry) => entry.success !== true)) throw new Error(`D1_QUERY_FAILED:${sql}`);
  return parsed.flatMap((entry) => entry.results || []);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`KIDULTS autonomous intelligence runtime smoke — ${pkg.version}`);
run(['d1','migrations','apply','DB',...common]);

const methodology = query('SELECT COUNT(*) AS methodology_count FROM methodology_registry;')[0];
assert(Number(methodology?.methodology_count) >= 1,'METHODOLOGY_REGISTRY_EMPTY');

const visual = query("SELECT value_json FROM autonomous_checkpoints WHERE key='visual_baseline';")[0];
assert(JSON.parse(visual?.value_json || '{}').locked === true,'VISUAL_BASELINE_NOT_LOCKED');

const tables = query("SELECT COUNT(*) AS asi_table_count FROM sqlite_master WHERE type='table' AND name LIKE 'asi_%';")[0];
assert(Number(tables?.asi_table_count) === 26,'ASI_DURABLE_TABLE_COUNT_MISMATCH');

const taskLeaseFence = query("SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name='asi_task_lease_write_fences';")[0];
assert(Number(taskLeaseFence?.table_count) === 1,'ASI_TASK_LEASE_ATOMIC_FENCE_TABLE_MISSING');

const recoveryTables = query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('asi_relay_fairness','asi_replay_attempts','asi_transport_attempts','asi_transport_control_holds','asi_terminal_dlq_receipts') ORDER BY name;");
assert(recoveryTables.length === 5,'ASI_RECOVERY_DURABLE_TABLES_MISSING');

const recoveryView = query("SELECT COUNT(*) AS view_count FROM sqlite_master WHERE type='view' AND name='asi_runtime_recovery_holds';")[0];
assert(Number(recoveryView?.view_count) === 1,'ASI_RECOVERY_HOLD_VIEW_MISSING');

const processorRequirements = query("SELECT g.stage,COUNT(*) AS required_count FROM asi_processor_fan_in_requirements r JOIN asi_processor_fan_in_groups g ON g.group_id=r.group_id GROUP BY g.stage ORDER BY g.stage;");
assert(processorRequirements.length === 0,'PROCESSOR_FAN_IN_REQUIREMENTS_MUST_START_EMPTY_BEFORE_SOURCE_EVENTS');

const processorViews = query("SELECT COUNT(*) AS view_count FROM sqlite_master WHERE type='view' AND name IN ('asi_processor_fan_in_readiness','asi_source_pool_current');")[0];
assert(Number(processorViews?.view_count) === 2,'ASI_PROCESSOR_VIEWS_MISSING');

const admission = query("SELECT admission_id,decision,rights_state,policy_version,required_assertion_count,satisfied_assertion_count FROM asi_purpose_admissions WHERE admission_id='admission-staging-golden-path-v1';")[0];
assert(admission?.decision === 'PASS' && admission?.rights_state === 'ALLOW','FIXTURE_ADMISSION_NOT_PASS_ALLOW');
assert(admission?.policy_version === 'kidults-asi-purpose-specific-admission-policy-v1@1.0.0','FIXTURE_ADMISSION_POLICY_VERSION_DRIFT');
assert(Number(admission?.required_assertion_count) === 9 && Number(admission?.satisfied_assertion_count) === 9,'FIXTURE_ADMISSION_ASSERTION_COUNTS_INVALID');

const assertions = query("SELECT COUNT(DISTINCT ea.assertion_type) AS admission_assertion_count FROM asi_admission_assertions aa JOIN asi_engine_assertions ea ON ea.assertion_id=aa.assertion_id WHERE aa.admission_id='admission-staging-golden-path-v1' AND ea.decision='PASS' AND ea.rights_state='ALLOW';")[0];
assert(Number(assertions?.admission_assertion_count) === 9,'FIXTURE_ADMISSION_ASSERTION_LINKS_INVALID');

const evidenceForeignKeys = query('PRAGMA foreign_key_list(evidence_ledger);');
assert(evidenceForeignKeys.some((row) => row.from === 'admission_id' && row.table === 'asi_purpose_admissions'),'EVIDENCE_ADMISSION_FOREIGN_KEY_MISSING');

console.log('KIDULTS autonomous runtime smoke PASS');
