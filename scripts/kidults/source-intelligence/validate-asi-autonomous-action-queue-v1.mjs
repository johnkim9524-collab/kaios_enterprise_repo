import fs from 'node:fs';

const path = process.argv[2] || '/tmp/asi-autonomous-action-queue-v1.json';
const x = JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = m => { throw new Error(m); };
if (x.status !== 'SHADOW_AUTONOMOUS_ACTION_QUEUE_READY') fail('STATUS');
if (x.production !== 'HOLD' || x.public_release !== 'HOLD') fail('RELEASE_BOUNDARY');
if (!Array.isArray(x.control_loop) || x.control_loop.join('>') !== 'OBSERVE>PRIORITIZE>GATE>PLAN>EXECUTE_SAFE>VERIFY>RE_EVALUATE') fail('LOOP');
if (!Array.isArray(x.safe_execution_actions) || x.safe_execution_actions.length < 4) fail('SAFE_ACTIONS');
if (!Array.isArray(x.top_priority_actions) || x.top_priority_actions.length !== 100) fail('TOP_PRIORITY');
if (!Array.isArray(x.rights_review_queue) || x.rights_review_queue.length < 1) fail('RIGHTS_QUEUE');
if (x.total_deduped_acquisition_demands !== 2048) fail(`DEDUPE_COUNT:${x.total_deduped_acquisition_demands}`);
const allowed = new Set(['AUTO_EXECUTE_SAFE','AUTO_BUILD_RIGHTS_REVIEW_PACKET','WAIT_RIGHTS_OR_TERMS','WAIT_ACCOUNT_OR_CONTRACT','WAIT_HUMAN_REVIEW','BLOCKED_PRODUCTION_OR_PUBLIC','COMPLETE_BOUNDED']);
for (const a of x.top_priority_actions) {
  if (!allowed.has(a.decision_class)) fail(`DECISION_CLASS:${a.decision_class}`);
  if (a.production !== 'HOLD') fail('PRODUCTION_ACTION');
  if (a.decision_class === 'AUTO_EXECUTE_SAFE' && (a.rights_state !== 'ALLOW' || a.admission_state !== 'ADMITTED' || !['DEV','SHADOW','STAGING'].includes(a.runtime_state))) fail(`UNSAFE_AUTO_EXECUTE:${a.action_candidate_id}`);
}
for (const a of x.safe_execution_actions) {
  if (a.decision_class !== 'AUTO_EXECUTE_SAFE' || a.rights_state !== 'ALLOW' || a.reversible !== true || a.production !== 'HOLD') fail(`SAFE_REGISTRY_BOUNDARY:${a.action_id}`);
  if (/wrangler deploy|git push|npm publish|curl\s+-x\s+post|purchase|subscribe/i.test(a.command)) fail(`FORBIDDEN_COMMAND:${a.action_id}`);
}
for (const r of x.rights_review_queue) {
  if (r.decision_class !== 'AUTO_BUILD_RIGHTS_REVIEW_PACKET' || r.rights_state !== 'UNASSESSED') fail(`RIGHTS_PACKET_CLASS:${r.review_packet_id}`);
  const bad = (r.allowed_automatic_work || []).some(v => /ACCEPT|CREATE_ACCOUNT|CONTACT_PROVIDER|COLLECT_SOURCE_PAYLOAD/i.test(v));
  if (bad) fail(`RIGHTS_PACKET_OVERREACH:${r.review_packet_id}`);
}
console.log(JSON.stringify({status:'PASS',deduped_demands:x.total_deduped_acquisition_demands,top_priority:x.top_priority_actions.length,rights_review_packets:x.rights_review_queue.length,safe_execution_actions:x.safe_execution_actions.length,production:x.production}, null, 2));
