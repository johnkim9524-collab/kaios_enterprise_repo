import fs from 'node:fs';
const path='coordination/kidults/governance/collectibles-only-scope-boundary-v1.json';
const doc=JSON.parse(fs.readFileSync(path,'utf8'));
const requiredExcluded=['real_estate','land','general_financial_assets','stocks','bonds','funds','derivatives'];
const errors=[];
if(doc.principle!=='COLLECTIBLES_ONLY') errors.push('principle must be COLLECTIBLES_ONLY');
if(doc.source_admission_rules?.out_of_scope_discovery_action!=='FAIL_CLOSED_EXCLUDE') errors.push('out-of-scope must fail closed');
if(doc.source_admission_rules?.market_cell_direct_relevance_required!==true) errors.push('market-cell direct relevance required');
if(doc.source_admission_rules?.source_platform_is_not_scope!==true) errors.push('source platform must not define scope');
for(const key of requiredExcluded) if(!doc.excluded_asset_classes?.includes(key)) errors.push(`missing excluded class ${key}`);
if(doc.production!=='HOLD') errors.push('Production must remain HOLD');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Collectibles Only scope boundary: PASS');
