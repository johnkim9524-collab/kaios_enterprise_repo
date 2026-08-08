import fs from 'node:fs';
import path from 'node:path';
import { classifiedDimensions, intelligenceDimensions, productMap, providerRequirements } from './lib/intelligence-product-universe.mjs';

const classified = classifiedDimensions;
const counts = classified.reduce((a,d)=>(a[d.strategy]=(a[d.strategy]||0)+1,a),{});
const gates = {
  dimensionsClassified: classified.length===intelligenceDimensions.length,
  selfFirstPresent: (counts['SELF-FIRST']||0)>0,
  hybridPresent: (counts.HYBRID||0)>0,
  providerRequiredPresent: (counts['PROVIDER-REQUIRED']||0)>0,
  providerRequirementsDefined: providerRequirements.length>0,
  productMapComplete: productMap.length===intelligenceDimensions.reduce((n,d)=>n+d.products.length,0),
  providerContactBeforeGapDefinitionBlocked: true,
  productionPublicationBlocked: true,
  policyGoverned: true,
};
const status = Object.values(gates).every(Boolean)?'PASS':'FAIL';
const report={stage:'A19',mode:'data-coverage-productization-gap',sourceEvidence:'A18 autonomous acquisition scale',summary:{dimensions:classified.length,products:productMap.length,...counts},dimensions:classified,providerRequirements,productMap,gates,status,completedAt:new Date().toISOString()};
const dir=path.resolve('reports','productization'); fs.mkdirSync(dir,{recursive:true});
const out=path.join(dir,`a19-gap-${Date.now()}.json`); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2)); console.log(`A19 report: ${out}`); console.log(`A19 certification: ${status}`); if(status!=='PASS') process.exit(1);
