import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync('coordination/kidults/internalization/partner-pre-send-internalization-gate-v1.json','utf8'));
const errs=[];
const required=['latest_human_inbound_read','github_952_read','provider_specific_issue_read','company_analysis_complete','product_analysis_complete','portfolio_priority_complete','external_fact_internalization_split_complete','internalize_now_plan_complete','korean_internal_report_completed','outbound_necessary'];
for (const x of required) if (!p.required_checks?.includes(x)) errs.push(`missing check ${x}`);
if (p.fail_closed?.any_required_check_false !== 'DO_NOT_SEND') errs.push('failed check must DO_NOT_SEND');
if (p.fail_closed?.newer_human_inbound_unread !== 'DO_NOT_SEND') errs.push('unread inbound must DO_NOT_SEND');
if (p.fail_closed?.duplicate_followup !== 'DO_NOT_SEND') errs.push('duplicate followup must DO_NOT_SEND');
if (p.fail_closed?.provider_core_capture_requested !== 'DO_NOT_SEND') errs.push('core capture must DO_NOT_SEND');
if (p.written_negotiation?.preferred !== true) errs.push('written negotiation must be preferred');
for (const k of ['spend','contract','credential_activation']) if (p.non_bypass?.[k] !== 'EXPLICIT_APPROVAL_REQUIRED') errs.push(`${k} boundary drift`);
if (p.non_bypass?.production !== 'HOLD') errs.push('production boundary drift');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log(JSON.stringify({suite:'KIDULTS_PARTNER_PRE_SEND_INTERNALIZATION_GATE_V1',result:'PASS',required_checks:p.required_checks.length,written_negotiation:true,production:'HOLD'},null,2));
