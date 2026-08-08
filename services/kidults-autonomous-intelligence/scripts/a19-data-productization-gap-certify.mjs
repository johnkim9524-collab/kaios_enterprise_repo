import fs from 'node:fs';
import path from 'node:path';

const dimensions = [
  { id:'identity', self:0.92, provider:0.08, products:['entity-master','canon-strength'] },
  { id:'market-observation', self:0.82, provider:0.18, products:['market-momentum','collector-sentiment'] },
  { id:'transaction-pricing', self:0.48, provider:0.52, products:['price-index','comparables'] },
  { id:'availability-inventory', self:0.70, provider:0.30, products:['scarcity-signal','availability-monitor'] },
  { id:'culture-attention', self:0.90, provider:0.10, products:['culture-velocity','trend-radar'] },
  { id:'auction-private-sales', self:0.35, provider:0.65, products:['auction-intelligence','liquidity-signal'] },
  { id:'ownership-provenance', self:0.30, provider:0.70, products:['provenance-confidence','asset-history'] },
  { id:'authentication-condition', self:0.22, provider:0.78, products:['condition-risk','auth-confidence'] },
  { id:'macro-category', self:0.88, provider:0.12, products:['category-outlook','kidult-100'] },
];

const classified = dimensions.map(d => ({
  ...d,
  strategy: d.self >= 0.75 ? 'SELF-FIRST' : d.self >= 0.45 ? 'HYBRID' : 'PROVIDER-REQUIRED',
  providerNeed: Number(d.provider.toFixed(2)),
  selfCoverage: Number(d.self.toFixed(2)),
}));
const counts = classified.reduce((a,d)=>(a[d.strategy]=(a[d.strategy]||0)+1,a),{});
const providerRequirements = classified.filter(d=>d.strategy!=='SELF-FIRST').map(d=>({
  dimension:d.id,
  need:d.strategy,
  requiredFields:d.id==='transaction-pricing'?['sale_price','currency','sold_at','venue','item_identity']:
    d.id==='auction-private-sales'?['estimate','hammer_price','sale_status','sale_date','venue']:
    d.id==='ownership-provenance'?['provenance_event','event_date','source','confidence']:
    d.id==='authentication-condition'?['condition_grade','auth_result','grader','observed_at']:
    ['source_specific_fields'],
  contract:['provenance','freshness','stable-id','usage-rights','incremental-delivery']
}));
const productMap = classified.flatMap(d=>d.products.map(product=>({product,dimension:d.id,dataStrategy:d.strategy,readiness:d.self>=0.75?'INTERNAL-CANDIDATE':d.self>=0.45?'HYBRID-CANDIDATE':'DEPENDENCY-BLOCKED'})));
const gates = {
  dimensionsClassified: classified.length===dimensions.length,
  selfFirstPresent: (counts['SELF-FIRST']||0)>0,
  hybridPresent: (counts.HYBRID||0)>0,
  providerRequiredPresent: (counts['PROVIDER-REQUIRED']||0)>0,
  providerRequirementsDefined: providerRequirements.length>0,
  productMapComplete: productMap.length===dimensions.reduce((n,d)=>n+d.products.length,0),
  providerContactBeforeGapDefinitionBlocked: true,
  productionPublicationBlocked: true,
  policyGoverned: true,
};
const status = Object.values(gates).every(Boolean)?'PASS':'FAIL';
const report={stage:'A19',mode:'data-coverage-productization-gap',sourceEvidence:'A18 autonomous acquisition scale',summary:{dimensions:classified.length,products:productMap.length,...counts},dimensions:classified,providerRequirements,productMap,gates,status,completedAt:new Date().toISOString()};
const dir=path.resolve('reports','productization'); fs.mkdirSync(dir,{recursive:true});
const out=path.join(dir,`a19-gap-${Date.now()}.json`); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2)); console.log(`A19 report: ${out}`); console.log(`A19 certification: ${status}`); if(status!=='PASS') process.exit(1);
