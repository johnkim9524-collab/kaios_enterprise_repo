#!/usr/bin/env node
import fs from 'node:fs';
const p=process.argv[2]||'coordination/kidults/track-b/provider-necessity-assessment-v1.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
if(x.status!=='INDEPENDENT_ASSESSMENT_COMPLETE') throw Error('STATUS');
if(x.official_inputs.length!==2) throw Error('INPUT_BOUNDARY');
if(x.cross_platform_assessment.platform_wide_provider_required!==false) throw Error('NO_PLATFORM_WIDE_PROVIDER');
if(x.provider_contact_recommendation.broad_contact!=='REJECT') throw Error('BROAD_CONTACT_MUST_REJECT');
if(x.provider_contact_recommendation.targeted_contact_now!=='HOLD') throw Error('TARGETED_CONTACT_HOLD');
if(!x.domain_assessment.some(d=>d.domain==='toys_models'&&d.scope_capabilities.some(s=>s.state==='SELF_COLLECTABLE_CREDENTIAL_REQUIRED'))) throw Error('SELF_COLLECTION_PATH_REQUIRED');
if(!x.domain_assessment.some(d=>d.scope_capabilities.some(s=>s.state==='EXTERNAL_LICENSE_JUSTIFIED'))) throw Error('TARGETED_EXTERNAL_CAPABILITY_EXPECTED');
if(x.provider_contact!=='HOLD'||x.production!=='HOLD') throw Error('GATE');
console.log(JSON.stringify({status:'PASS',domains:x.domain_assessment.length,platform_wide_provider:x.cross_platform_assessment.platform_wide_provider_required,broad_contact:x.provider_contact_recommendation.broad_contact,targeted_contact:x.provider_contact_recommendation.targeted_contact_now},null,2));
