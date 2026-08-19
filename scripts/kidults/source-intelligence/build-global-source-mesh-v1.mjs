import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const [scopePath='coordination/kidults/scope-data/collection-scope-data-requirement-matrix-v1.1.json', contractPath='coordination/kidults/source-intelligence/global-source-mesh-contract-v1.json', output='/tmp/kidults-global-source-mesh-v1.json'] = process.argv.slice(2);
const scopes = JSON.parse(await fs.readFile(scopePath,'utf8'));
const contract = JSON.parse(await fs.readFile(contractPath,'utf8'));

if (scopes.status !== 'CANDIDATE_FOR_CANONICAL' || scopes.scope_count !== 32 || scopes.scopes?.length !== 32) throw new Error('SCOPE_MATRIX_BINDING_INVALID');
if (contract.production !== 'HOLD' || contract.evidence_classes?.length !== 8) throw new Error('SOURCE_MESH_CONTRACT_INVALID');

const cells=[];
for (const scope of scopes.scopes) {
  if (!Array.isArray(scope.regions) || scope.regions.length !== 3) throw new Error(`REGION_SET_INVALID:${scope.scope_id}`);
  for (const region of scope.regions) {
    for (const evidenceClass of contract.evidence_classes) {
      const t=contract.lane_templates[evidenceClass];
      const priorityRaw=(t.decision_utility*t.evidence_strength*t.rights_clarity*t.autonomy)/Math.max(1,t.dependency_risk);
      const blockedClaim=t.claim_ceiling.startsWith('NO_') ? t.claim_ceiling : null;
      cells.push({
        market_cell_id:`${scope.scope_id}::${region}::${evidenceClass}`,
        scope_id:scope.scope_id,
        scope_name:scope.name,
        domain:scope.domain,
        archetype:scope.archetype,
        region,
        language_rule:scope.language_rule,
        evidence_class:evidenceClass,
        source_lane_class:t.source_lane_class,
        source_lane_state:t.default_state,
        claim_ceiling:t.claim_ceiling,
        cannot_yet_claim:blockedClaim,
        freshness_days:evidenceClass==='IDENTITY_CANONICAL_REFERENCE' ? scope.freshness?.authority_days ?? null : scope.freshness?.market_days ?? null,
        execution_priority_score:Number(priorityRaw.toFixed(3)),
        dependency_concentration_risk:t.dependency_risk,
        named_provider_selected:false,
        rights_admitted:false,
        evidence_admitted:false,
        production:'HOLD'
      });
    }
  }
}

if (cells.length !== 32*3*8) throw new Error(`CELL_COUNT_INVALID:${cells.length}`);
const ids=new Set(cells.map(x=>x.market_cell_id));
if (ids.size !== cells.length) throw new Error('CELL_ID_COLLISION');
if (cells.some(x=>x.named_provider_selected || x.rights_admitted || x.evidence_admitted || x.production!=='HOLD')) throw new Error('FAIL_CLOSED_DEFAULT_INVALID');

const evidenceSummary=Object.fromEntries(contract.evidence_classes.map(e=>[e,{
  cells:cells.filter(x=>x.evidence_class===e).length,
  gap_cells:cells.filter(x=>x.evidence_class===e && /GAP|DISCOVERY_ONLY/.test(x.source_lane_state)).length,
  max_claim_ceiling:contract.lane_templates[e].claim_ceiling
}]));
const rankedEvidenceClasses=[...contract.evidence_classes].sort((a,b)=>{
  const A=contract.lane_templates[a],B=contract.lane_templates[b];
  const sa=(A.decision_utility*A.evidence_strength*A.rights_clarity*A.autonomy)/Math.max(1,A.dependency_risk);
  const sb=(B.decision_utility*B.evidence_strength*B.rights_clarity*B.autonomy)/Math.max(1,B.dependency_risk);
  return sb-sa;
});

const report={
  id:'kidults-global-source-mesh-v1',
  version:'1.0.0',
  parent_issue:549,
  production:'HOLD',
  scope_matrix_status:scopes.status,
  scope_count:32,
  region_slots_per_scope:3,
  evidence_class_count:8,
  market_cell_count:cells.length,
  named_provider_global_selection:false,
  market_cells:cells,
  evidence_class_summary:evidenceSummary,
  execution_wave_order:rankedEvidenceClasses,
  cannot_yet_claim_summary:[...new Set(cells.map(x=>x.cannot_yet_claim).filter(Boolean))].sort(),
  rules:contract.hard_rules,
  source_hash_sha256:crypto.createHash('sha256').update(JSON.stringify({scope_version:scopes.version,contract_version:contract.version,cells})).digest('hex'),
  truth_boundary:'This is a deterministic zero-base market-cell/source-lane selection map. It does not admit a named provider or evidence source. Every source must still pass field-by-purpose rights, technical validation, evidence sufficiency and entity-resolution admission before a claim can advance.'
};
await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(`Global Source Mesh PASS: ${report.market_cell_count} cells, ${report.scope_count} scopes, ${report.evidence_class_count} evidence classes.`);
console.log(`Execution waves: ${report.execution_wave_order.join(' > ')}`);
console.log(`Cannot-yet-claim classes: ${report.cannot_yet_claim_summary.join(' | ')}`);
