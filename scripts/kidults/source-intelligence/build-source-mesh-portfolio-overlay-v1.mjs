import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const files={
  identity:'coordination/kidults/source-intelligence/rights-admitted-pilot-source-pool-r1.json',
  historical:'coordination/kidults/source-intelligence/rights-admitted-transaction-source-pool-r1.json',
  declarations:'coordination/kidults/source-intelligence/global-rights-source-pool-expansion-r2.json',
  contract:'coordination/kidults/source-intelligence/global-source-mesh-contract-v1.json'
};
const out=process.argv[2]||'/tmp/kidults-source-mesh-portfolio-overlay-v1.json';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const [identity,historical,declarations,contract]=await Promise.all(Object.values(files).map(read));
if(identity.production!=='HOLD'||historical.production!=='HOLD'||declarations.production!=='HOLD'||contract.production!=='HOLD') throw new Error('PRODUCTION_BOUNDARY_INVALID');

const strict=[];
for(const source of identity.sources||[]) if(source.admission_state==='ADMITTED') strict.push({
  source_id:source.source_id, owner:source.owner, admission_basis:'STRICT_R1_RIGHTS_ADMITTED_POOL', evidence_classes:['IDENTITY_CANONICAL_REFERENCE'],
  applicability:'CANDIDATE_LANE_ONLY__ENTITY_MATCH_REQUIRED_PER_MARKET_CELL', allowed_claim_classes:source.allowed_claim_classes,
  prohibited_claim_classes:source.prohibited_claim_classes, purpose_rights:source.purpose_rights, technical_state:source.technical_state,
  named_provider_global_truth:false, cell_evidence_admitted:false, production:'HOLD'
});
for(const source of historical.sources||[]) if(source.admission_state==='ADMITTED') strict.push({
  source_id:source.source_id, owner:source.owner, admission_basis:'STRICT_R1_RIGHTS_ADMITTED_POOL', evidence_classes:['HISTORICAL_TRANSACTION_PROVENANCE'],
  applicability:'CANDIDATE_LANE_ONLY__OBJECT_AND_PROVENANCE_MATCH_REQUIRED_PER_MARKET_CELL', allowed_claim_classes:source.allowed_claim_classes,
  prohibited_claim_classes:source.prohibited_claim_classes, purpose_rights:source.purpose_rights, technical_state:source.technical_state,
  named_provider_global_truth:false, cell_evidence_admitted:false, production:'HOLD'
});

const conditional=(declarations.sources||[]).filter(s=>s.admission_state!=='ADMITTED'||declarations.evidence_assurance?.strict_r1_evidence_bound_revalidation_complete!==true).map(s=>({
  source_id:s.source_id, owner:s.owner, declared_state:s.admission_state, admission_basis:'DECLARATION_OR_CONDITIONAL_NOT_STRICT_R1',
  candidate_evidence_classes:(s.semantic_capability||[]).some(x=>/SOLD/.test(x))?['CURRENT_SOLD_TRANSACTION']:['IDENTITY_CANONICAL_REFERENCE'],
  runtime_admitted:false, current_market_claim_authorized:false, cell_evidence_admitted:false, production:'HOLD'
}));

if(strict.some(x=>x.named_provider_global_truth||x.cell_evidence_admitted||x.production!=='HOLD')) throw new Error('STRICT_SOURCE_FAIL_CLOSED_INVALID');
if(conditional.some(x=>x.runtime_admitted||x.current_market_claim_authorized||x.cell_evidence_admitted||x.production!=='HOLD')) throw new Error('CONDITIONAL_SOURCE_FAIL_CLOSED_INVALID');
const currentSoldStrict=strict.filter(x=>x.evidence_classes.includes('CURRENT_SOLD_TRANSACTION')).length;
const report={
  id:'kidults-source-mesh-portfolio-overlay-v1',version:'1.0.0',parent_issue:549,production:'HOLD',
  strict_rights_admitted_source_count:strict.length,
  strict_rights_admitted_sources:strict,
  conditional_or_declaration_sources:conditional,
  current_sold_strict_source_count:currentSoldStrict,
  current_sold_gap_state:currentSoldStrict===0?'OPEN_NO_STRICT_R1_CURRENT_SOLD_SOURCE':'COVERED_BOUNDED_ONLY',
  global_provider_selected:false,
  cell_binding_rule:'A source may be a candidate lane across eligible cells, but rights/evidence admission for a cell remains false until an actual source record is entity-resolved, technically validated, fresh, and sufficient for that exact claim.',
  claim_guard:['HISTORICAL_TRANSACTION_NOT_CURRENT_PRICE','LISTING_NOT_SOLD','SCARCITY_NOT_LIQUIDITY','MISSING_NOT_ZERO','PROVIDER_NOT_TRUTH'],
  source_hash_sha256:crypto.createHash('sha256').update(JSON.stringify({strict,conditional,contract_version:contract.version})).digest('hex'),
  truth_boundary:'This overlay binds already-proven source-pool states to Global Source Mesh evidence classes. It does not promote any provider globally, does not admit evidence into a market cell, and does not close the current-SOLD gap unless a strict rights-admitted source exists for that exact claim.'
};
await fs.writeFile(out,JSON.stringify(report,null,2));
console.log(`Source Mesh Portfolio Overlay PASS: strict=${strict.length}, conditional=${conditional.length}, currentSoldStrict=${currentSoldStrict}`);
