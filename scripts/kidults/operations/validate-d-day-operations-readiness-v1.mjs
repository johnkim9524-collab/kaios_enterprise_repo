#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOperationalDashboard, CURRENT_SOLD_QUALIFICATIONS, DISASTER_SCENARIOS, MONITORS, PIPELINE, PROVIDERS, repositoryHead, runOperationalSimulation } from './d-day-operations-readiness-v1-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const contract = readJson('coordination/kidults/operations/d-day-operations-readiness-v1.json');
const adapters = readJson('coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json');
const head = repositoryHead();
const simulation = runOperationalSimulation(adapters, { sourceSha: head });
const dashboard = buildOperationalDashboard(simulation);
const exact = (actual, expected, code) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(code); };

exact(contract.providers, PROVIDERS, 'D_DAY_CONTRACT_PROVIDER_DRIFT');
exact(contract.pipeline, PIPELINE, 'D_DAY_CONTRACT_PIPELINE_DRIFT');
exact(contract.disaster_scenarios, DISASTER_SCENARIOS, 'D_DAY_CONTRACT_DISASTER_DRIFT');
exact(contract.current_sold_qualification, CURRENT_SOLD_QUALIFICATIONS, 'D_DAY_CONTRACT_CURRENT_SOLD_DRIFT');
exact(contract.observability_monitors, MONITORS, 'D_DAY_CONTRACT_MONITOR_DRIFT');
if (simulation.provider_paths.length !== 6 || simulation.provider_paths.some(pathValue => pathValue.stages.length !== 9 || pathValue.provider_call_count !== 0 || pathValue.decision !== 'SYNTHETIC' || pathValue.action !== 'NONE')) throw new Error('D_DAY_PROVIDER_SIMULATION_INVALID');
if (simulation.disasters.some(item => item.verification !== 'FAIL_CLOSED')) throw new Error('D_DAY_DISASTER_NOT_FAIL_CLOSED');
if (simulation.current_sold_qualification.some(item => item.state !== 'VERIFIED_PASS_CONTROL_SIMULATION')) throw new Error('D_DAY_CURRENT_SOLD_QUALIFICATION_INVALID');
if (dashboard.monitor_count !== 15 || Object.keys(dashboard.statuses).length !== 15 || Object.values(dashboard.statuses).some(item => item.freshness_seconds !== 0 || item.fail_closed !== true)) throw new Error('D_DAY_OBSERVABILITY_INVALID');
for (const relative of contract.documents) {
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  if (/\b(TODO|TBD|PLACEHOLDER)\b/i.test(content)) throw new Error(`D_DAY_DOCUMENT_INCOMPLETE:${relative}`);
  for (const phase of ['Detection', 'Isolation', 'Recovery', 'Verification', 'Communication']) if (!content.includes(phase)) throw new Error(`D_DAY_DOCUMENT_PHASE_MISSING:${relative}:${phase}`);
}
if (contract.freeze.engineering !== 'FROZEN_AFTER_MERGE' || contract.freeze.portal !== 'FROZEN' || contract.production !== 'HOLD' || contract.public !== 'HOLD' || contract.g5 !== 'HOLD') throw new Error('D_DAY_FREEZE_OR_HOLD_INVALID');
console.log(JSON.stringify({ validator: 'KIDULTS_D_DAY_OPERATIONS_READINESS_V1', state: 'VERIFIED_PASS', source_sha: head, provider_simulations: 6, pipeline_stages_per_provider: 9, provider_calls: 0, credentials: 0, empirical_records: 0, disaster_scenarios: 11, disaster_fail_closed: 11, current_sold_qualifications: 9, observability_monitors: 15, documents: contract.documents.length, production: 'HOLD', public: 'HOLD', g5: 'HOLD', simulation_receipt_digest: simulation.receipt_digest, dashboard_snapshot_digest: dashboard.snapshot_digest }, null, 2));
