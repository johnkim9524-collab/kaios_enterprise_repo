import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('coordination/kidults/internalization/market-integrity-contract-v1.json','utf8'));
const errs=[];
for(const s of ['PRICE_SPIKE','RELIST_CHAIN','DUPLICATE_SYNDICATION','ABNORMAL_BID_NO_SALE','GRADE_CONDITION_MISMATCH','CURRENCY_FEE_DISTORTION','VENUE_CONCENTRATION','STALE_EVENT','FUTURE_DATED_EVENT','IDENTITY_COLLISION','SOURCE_CONFLICT','SCHEMA_SEMANTICS_DRIFT']) if(!c.signal_types?.includes(s)) errs.push(`missing ${s}`);
if(c.requirements?.evidence_reference_required!==true) errs.push('evidence required');
if(c.requirements?.provenance_required!==true) errs.push('provenance required');
if(c.requirements?.provider_native_flag_required!==false) errs.push('provider flag dependency prohibited');
if(c.requirements?.unsupported_intent_claim!=='PROHIBITED') errs.push('unsupported intent claim must be prohibited');
if(c.requirements?.unknown_state_supported!==true) errs.push('unknown state required');
if(c.requirements?.false_positive_containment_required!==true) errs.push('false positive containment required');
if(errs.length){console.error(errs.join('\n'));process.exit(1);} 
console.log(JSON.stringify({suite:'KIDULTS_MARKET_INTEGRITY_V1',result:'PASS',signals:c.signal_types.length,provider_independent:true},null,2));
