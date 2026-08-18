#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/scope/final-market-source-discovery-8-domain-v1.json';const x=JSON.parse(fs.readFileSync(p,'utf8'));
if((x.domains||[]).length!==8) throw new Error('EXPECTED_8_DOMAINS');
if(x.cross_domain_findings.platform_wide_provider_required!==false) throw new Error('NO_PLATFORM_WIDE_PROVIDER_ASSUMPTION');
if(x.cross_domain_findings.universal_rights_clear_sold_source_found!==false) throw new Error('UNIVERSAL_SOLD_SOURCE_MUST_BE_FALSE');
if(x.cross_domain_findings.scope_specific_self_collected_sold_candidate_found!==true) throw new Error('MISSING_SCOPE_SPECIFIC_SELF_COLLECTION_FINDING');
const toys=x.domains.find(d=>d.domain==='toys_models');if(!toys?.self_collection_candidates?.some(s=>s.source==='BRICKLINK_PRICE_GUIDE')) throw new Error('MISSING_BRICKLINK');
if(!String(x.recommendation).startsWith('DO_NOT_CONTACT_BROAD_PROVIDER_SET')) throw new Error('CONTACT_GATE');
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw new Error('HOLD_GATE');
console.log(JSON.stringify({status:'PASS',domains:x.domains.length,platform_provider_required:x.cross_domain_findings.platform_wide_provider_required,universal_sold_source:x.cross_domain_findings.universal_rights_clear_sold_source_found,scope_specific_self_collectable:x.cross_domain_findings.scope_specific_self_collected_sold_candidate_found},null,2));
