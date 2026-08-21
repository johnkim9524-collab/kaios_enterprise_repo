import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contractPath = path.join(root, 'coordination/kidults/audit/unified-audit-control-plane-v1.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

const requiredTop = ['version','status','governing_issue','rule','principles','audit_event_envelope','partner_data_lifecycle','control_layers','immutability','downstream_isolation','exit_criteria'];
for (const key of requiredTop) {
  if (!(key in contract)) throw new Error(`missing top-level key: ${key}`);
}
if (contract.governing_issue !== 881) throw new Error('governing_issue must be #881');
if (contract.rule !== 'NO_PARTNER_DATA_INGESTION_BEFORE_PRE_INTAKE_GATE_PASS') throw new Error('pre-intake rule mismatch');

const mustPrinciples = ['APPEND_ONLY','FAIL_CLOSED','EVIDENCE_BEFORE_METRICS','RIGHTS_BEFORE_USE','NO_PROVIDER_EQUALS_TRUTH','ONLY_EVIDENCED_PASS_COUNTS_AS_COMPLETE'];
for (const p of mustPrinciples) if (!contract.principles.includes(p)) throw new Error(`missing principle: ${p}`);

const requiredEvent = ['audit_event_id','event_time','actor_type','actor_id','action','object_type','object_id','source_id','decision','reason','result','correlation_id','event_digest'];
for (const f of requiredEvent) if (!contract.audit_event_envelope.required.includes(f)) throw new Error(`missing audit event field: ${f}`);

for (const forbidden of ['secret','credential','api_key','raw_token']) {
  if (!contract.audit_event_envelope.forbidden.includes(forbidden)) throw new Error(`missing forbidden secret field: ${forbidden}`);
}

const lifecycle = ['RECEIVED','QUARANTINED','RIGHTS_CHECKED','SCHEMA_CHECKED','SEMANTICS_CHECKED','IDENTITY_CHECKED','NORMALIZED','EVIDENCE_ELIGIBLE','PROMOTED_OR_REJECTED'];
if (JSON.stringify(contract.partner_data_lifecycle) !== JSON.stringify(lifecycle)) throw new Error('partner data lifecycle must remain ordered and fail-closed');

if (contract.immutability.ledger_mode !== 'APPEND_ONLY') throw new Error('ledger must be APPEND_ONLY');
if (contract.immutability.mutation_policy !== 'NO_IN_PLACE_UPDATE_OR_DELETE') throw new Error('in-place mutation must be prohibited');
if (contract.immutability.correction_policy !== 'SUPERSEDING_EVENT_ONLY') throw new Error('corrections must be superseding events');
if (contract.downstream_isolation.raw_partner_data_to_market_claim !== 'PROHIBITED') throw new Error('raw partner data must not create market claims');
if (contract.downstream_isolation.raw_partner_data_to_metric !== 'PROHIBITED') throw new Error('raw partner data must not create metrics');
if (contract.downstream_isolation.portal_eos_production_bypass !== 'PROHIBITED') throw new Error('downstream bypass must be prohibited');

const requiredLayers = ['SOURCE_AUDIT','RIGHTS_AUDIT','INGESTION_AUDIT','SCHEMA_SEMANTIC_AUDIT','IDENTITY_AUDIT','PROVENANCE_LINEAGE_AUDIT','QUALITY_ANOMALY_AUDIT','METRIC_AUDIT','DECISION_AUDIT','HUMAN_AUTHORITY_AUDIT','RUNTIME_OPERATIONAL_AUDIT','PUBLICATION_AUDIT','RECOVERY_AUDIT'];
for (const layer of requiredLayers) if (!contract.control_layers.includes(layer)) throw new Error(`missing audit layer: ${layer}`);

console.log('PASS unified-audit-control-plane-v1');
console.log(`layers=${contract.control_layers.length} event_required=${contract.audit_event_envelope.required.length} lifecycle_states=${contract.partner_data_lifecycle.length}`);
