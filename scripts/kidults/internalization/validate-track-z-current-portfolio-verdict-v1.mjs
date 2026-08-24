#!/usr/bin/env node
import fs from 'node:fs';
const path = process.argv[2] || 'coordination/kidults/internalization/track-z-current-portfolio-verdict-v1.json';
const x = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = message => { throw new Error(message); };
if (x.id !== 'kidults-track-z-current-portfolio-verdict-v1') fail('ID');
if (x.state !== 'TRACK_Z_REVIEW_COMPLETE_KPMO_REPORT_REQUIRED') fail('STATE');
if (JSON.stringify(x.route) !== JSON.stringify(['TRACK_Z_REVIEW','KPMO_INTEGRATED_REPORT','FOUNDER_DECISION'])) fail('ROUTE');
if (x.external_action_executed !== false || x.contract_spend_credentials_data_acquisition !== 'HOLD') fail('EXTERNAL_BOUNDARY');
if (!Array.isArray(x.verdicts) || x.verdicts.length !== 7) fail('PORTFOLIO_COUNT');
for (const item of x.verdicts) {
  if (!item.provider_id || !['HOLD','REVISE','WAIT','NO_GO','INTERNALIZE_FIRST','PASS_FOR_BOUNDED_PILOT_REVIEW','SEND'].includes(item.track_z_verdict)) fail(`VERDICT:${item.provider_id}`);
  if (item.track_z_verdict === 'SEND' || item.track_z_verdict === 'PASS_FOR_BOUNDED_PILOT_REVIEW') fail(`UNAUTHORIZED_ACTIVATION_VERDICT:${item.provider_id}`);
  if (!Array.isArray(item.reason_codes) || item.reason_codes.length < 1 || !item.next_gate) fail(`REASON_OR_GATE:${item.provider_id}`);
}
if (x.current_sold_activation_candidates.length !== 0) fail('CURRENT_SOLD_ACTIVATION_OVERCLAIM');
if (x.production !== 'HOLD' || x.public_release !== 'HOLD' || x.g5 !== 'EXPLICIT_FOUNDER_APPROVAL_REQUIRED') fail('RELEASE_BOUNDARY');
console.log(JSON.stringify({suite:'KIDULTS_TRACK_Z_CURRENT_PORTFOLIO_VERDICT_V1',result:'PASS',providers:x.verdicts.length,activation_candidates:0,external_action_executed:false,production:x.production},null,2));
