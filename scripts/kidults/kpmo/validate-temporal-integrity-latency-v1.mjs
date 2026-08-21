import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const control = JSON.parse(fs.readFileSync(path.join(root,'coordination','kidults','kpmo','temporal-integrity-latency-controls-v1.json'),'utf8'));
let failed = false;
const fail = m => { console.error(`FAIL: ${m}`); failed = true; };
const req = (c,m) => { if (!c) fail(m); };

for (const p of ['AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT']) req(control.operating_principles?.includes(p), `missing principle ${p}`);
const byId = new Map((control.controls||[]).map(x=>[x.id,x]));
for (const id of ['STALE_BUT_VALID','DECISION_LATENCY','CLOCK_SKEW_AND_TIMEZONE','MIXED_FRESHNESS_SURFACE','LATE_ARRIVING_CORRECTION','OUT_OF_ORDER_EVENT','FRESHNESS_LAUNDERING']) req(byId.has(id), `missing control ${id}`);
const has = (id,token) => byId.get(id)?.rules?.some(r=>r.includes(token));
req(has('STALE_BUT_VALID','VALID_AT_SOURCE_TIME_NE_VALID_FOR_CURRENT_DECISION'),'stale-valid separation missing');
req(has('DECISION_LATENCY','LATE_BUT_CORRECT_NE_ACTIONABLE'),'late-but-correct actionability rule missing');
req(has('CLOCK_SKEW_AND_TIMEZONE','UNKNOWN_OR_CONFLICTING_TIMEZONE'),'timezone fail-close missing');
req(has('MIXED_FRESHNESS_SURFACE','WEAKEST_MATERIAL_DEPENDENCY'),'weakest freshness binding missing');
req(has('LATE_ARRIVING_CORRECTION','AS_KNOWN_AT_STATE_MUST_NOT_BE_SILENTLY_REWRITTEN'),'bitemporal correction truth rule missing');
req(has('OUT_OF_ORDER_EVENT','OUT_OF_ORDER_ARRIVAL_CANNOT_BYPASS_SNAPSHOT_CUTOFF'),'out-of-order cutoff rule missing');
req(has('FRESHNESS_LAUNDERING','RECENT_REPUBLICATION_NE_RECENT_FACT'),'freshness laundering rule missing');
req(control.activation_ceiling?.synthetic_empirical_promotion==='PROHIBITED','synthetic promotion ceiling missing');
req(control.activation_ceiling?.production==='HOLD','Production HOLD missing');
req(control.activation_ceiling?.g5==='EXPLICIT_APPROVAL_REQUIRED','G5 gate missing');
if (failed) process.exit(1);
console.log('PASS: temporal integrity and latency controls validated');
