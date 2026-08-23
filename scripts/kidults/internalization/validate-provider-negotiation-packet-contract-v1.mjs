import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('coordination/kidults/internalization/provider-negotiation-packet-contract-v1.json','utf8'));
const errs=[];
for(const s of ['company_and_product_role','portfolio_priority','external_fact_scope_only','internalize_now','internalize_phased','rights_open_questions','cost_and_roi_state','termination_and_portability','provider_removal_state','recommended_action','written_outbound_scope']) if(!c.required_sections?.includes(s)) errs.push(`missing section ${s}`);
for(const [k,v] of Object.entries({github_pre_read_required:true,latest_human_inbound_required:true,analysis_report_before_outbound:true,written_negotiation_default:true,native_language_explanation_when_call_proposed:true,duplicate_question_prohibited:true})) if(c.outbound_rules?.[k]!==v) errs.push(`outbound rule drift ${k}`);
if(c.outbound_rules?.proprietary_methodology_disclosure!=='PROHIBITED') errs.push('methodology disclosure must be prohibited');
if(c.negotiation_priority?.[0]!=='non_internalizable_external_facts') errs.push('external facts must be first negotiation priority');
if(c.negotiation_priority?.[1]!=='internal_storage_normalization_analysis_rights') errs.push('internal-use rights must be second priority');
for(const [k,v] of Object.entries({contract:'EXPLICIT_APPROVAL_REQUIRED',spend:'EXPLICIT_APPROVAL_REQUIRED',credential_activation:'EXPLICIT_APPROVAL_REQUIRED',production:'HOLD',g5:'EXPLICIT_APPROVAL_REQUIRED'})) if(c.non_bypass?.[k]!==v) errs.push(`boundary drift ${k}`);
if(errs.length){console.error(JSON.stringify({suite:'KIDULTS_PROVIDER_NEGOTIATION_PACKET_V1',result:'FAIL',errs},null,2));process.exit(1);}
console.log(JSON.stringify({suite:'KIDULTS_PROVIDER_NEGOTIATION_PACKET_V1',result:'PASS',sections:c.required_sections.length,production:c.non_bypass.production},null,2));
