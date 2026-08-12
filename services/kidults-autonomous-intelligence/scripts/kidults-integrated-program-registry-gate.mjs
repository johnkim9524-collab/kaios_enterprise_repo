import fs from 'node:fs';
import path from 'node:path';

const SERVICE_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVICE_ROOT, '..', '..');
const DEFAULT_COORDINATION_ROOT = path.join(REPO_ROOT, 'coordination', 'kidults');
const COORDINATION_ROOT = path.resolve(process.env.KIDULTS_COORDINATION_ROOT || DEFAULT_COORDINATION_ROOT);
const REGISTRY_DIR = path.join(COORDINATION_ROOT, 'registry');
const GOVERNANCE_PATH = path.join(COORDINATION_ROOT, 'governance', 'final-shared-operating-document-v1.json');
const OUTPUT_PATH = path.resolve(process.env.KIDULTS_INTEGRATED_PROGRAM_GATE_OUTPUT || path.join(SERVICE_ROOT, 'reports', 'engineering-hardening', 'integrated-program-registry-gate-latest.json'));

const REQUIRED_REGISTRIES = [
  'program-registry.json',
  'people-ai-registry.json',
  'track-registry.json',
  'snapshot-registry.json',
  'evidence-registry.json',
  'decision-registry.json',
  'risk-registry.json',
  'handoff-registry.json',
  'object-registry.json',
  'asset-registry.json',
  'rights-registry.json',
  'signal-registry.json',
  'provider-registry.json',
  'release-registry.json',
];

const REQUIRED_RELEASE_GATES = [
  'G0_BASELINE_LOCKED',
  'G1_SNAPSHOT_VALID',
  'G2_RANKABILITY_COMPLETE',
  'G3_ASSET_RIGHTS_READY',
  'G4_PORTAL_QA_PASS',
  'G5_PROGRAM_OWNER_APPROVAL',
];

function readJson(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`MISSING_FILE:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireCondition(condition, code, failures) {
  if (!condition) failures.push(code);
}

const failures = [];
const registries = {};
let governance = null;

try {
  for (const fileName of REQUIRED_REGISTRIES) registries[fileName] = readJson(path.join(REGISTRY_DIR, fileName));
  governance = readJson(GOVERNANCE_PATH);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (governance && Object.keys(registries).length === REQUIRED_REGISTRIES.length) {
  const program = registries['program-registry.json'];
  const tracks = registries['track-registry.json'];
  const snapshots = registries['snapshot-registry.json'];
  const providers = registries['provider-registry.json'];
  const releases = registries['release-registry.json'];
  const trackIds = Array.isArray(tracks?.tracks) ? tracks.tracks.map((row) => row?.track_id) : [];
  const registeredSnapshotIds = new Set(Array.isArray(snapshots?.records) ? snapshots.records.map((row) => row?.snapshot_id).filter(Boolean) : []);

  requireCondition(governance.version === 'v1.0', 'GOVERNANCE_VERSION_MISMATCH', failures);
  requireCondition(governance.status === 'FINAL_SHARED_OPERATING_BASELINE_REGISTRY_BOOTSTRAPPING', 'GOVERNANCE_STATUS_INVALID', failures);
  requireCondition(governance.principle === 'One Program. One Language. One Registry. One Source of Truth.', 'PROGRAM_PRINCIPLE_MISMATCH', failures);
  requireCondition(program?.status === 'ACTIVE_BOOTSTRAPPING', 'PROGRAM_STATUS_INVALID', failures);
  requireCondition(program?.phase === 'PHASE_0_OPERATING_FRAMEWORK_LAUNCH', 'PROGRAM_PHASE_INVALID', failures);
  requireCondition(program?.production_state === 'FAIL_CLOSED_UNTIL_G0_G5_COMPLETE', 'PRODUCTION_FAIL_CLOSED_STATE_INVALID', failures);
  requireCondition(JSON.stringify(trackIds) === JSON.stringify(['A', 'B', 'C']), 'TRACK_TOPOLOGY_INVALID', failures);
  requireCondition(program?.current_snapshot_id === snapshots?.current_snapshot_id, 'CURRENT_SNAPSHOT_ID_MISMATCH', failures);
  requireCondition(program?.current_snapshot_id == null || registeredSnapshotIds.has(program.current_snapshot_id), 'CURRENT_SNAPSHOT_NOT_REGISTERED', failures);
  requireCondition(Array.isArray(releases?.required_gates) && JSON.stringify(releases.required_gates) === JSON.stringify(REQUIRED_RELEASE_GATES), 'RELEASE_GATE_TOPOLOGY_INVALID', failures);
  requireCondition(releases?.production_default === 'FAIL_CLOSED', 'RELEASE_DEFAULT_NOT_FAIL_CLOSED', failures);
  requireCondition(providers?.policy === 'Proof before Procurement', 'PROVIDER_POLICY_INVALID', failures);
  requireCondition(providers?.safety?.auto_procurement === false && providers?.safety?.auto_contract_execution === false && providers?.safety?.unauthorized_scraping === false && providers?.safety?.baseline_overwrite === false, 'PROVIDER_SAFETY_BOUNDARY_INVALID', failures);
}

const report = {
  schema_version: '1.0.0',
  mode: 'KIDULTS_INTEGRATED_PROGRAM_REGISTRY_GATE',
  generated_at: new Date().toISOString(),
  status: failures.length === 0 ? 'PASS_BOOTSTRAPPING' : 'FAIL_CLOSED',
  coordination_root: path.relative(REPO_ROOT, COORDINATION_ROOT) || '.',
  required_registry_count: REQUIRED_REGISTRIES.length,
  loaded_registry_count: Object.keys(registries).length,
  current_snapshot_id: registries['program-registry.json']?.current_snapshot_id ?? null,
  failures,
  claims: {
    operating_baseline_loaded: failures.length === 0,
    registry_is_single_source_of_truth: failures.length === 0,
    production_ready: false,
    g0_g5_complete: false,
    snapshot_id_inferred_or_synthesized: false,
    provider_procured: false,
    contract_executed: false,
    unauthorized_scraping_used: false,
    rights_or_provenance_weakened: false,
    production_gate_weakened: false,
  },
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(`Integrated Program registry gate: ${report.status}; registries=${report.loaded_registry_count}/${report.required_registry_count}; snapshot=${report.current_snapshot_id ?? 'null'}; failures=${failures.length}`);
if (failures.length > 0) process.exitCode = 1;
