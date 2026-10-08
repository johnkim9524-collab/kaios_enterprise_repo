#!/usr/bin/env node
import fs from 'node:fs';
import {verifyNaturalClockDispatch, NATURAL_CLOCK_MAX_SKEW_MS} from './lib/natural-clock-dispatch-v1.mjs';

const required=name=>{const value=process.env[name];if(!value)throw new Error(`NATURAL_CLOCK_ENV_REQUIRED:${name}`);return value;};
const event=JSON.parse(fs.readFileSync(required('GITHUB_EVENT_PATH'),'utf8'));
const expectedSlot=required('KIDULTS_NATURAL_CLOCK_SLOT');
const expectedAction=`kidults.natural.clock.${expectedSlot.toLowerCase()}.v1`;
if(required('GITHUB_EVENT_NAME')!=='repository_dispatch'||event.action!==expectedAction) throw new Error('NATURAL_CLOCK_EVENT_INVALID');
if(event.repository?.full_name!==required('GITHUB_REPOSITORY')) throw new Error('NATURAL_CLOCK_REPOSITORY_INVALID');
const expectedSender=required('KIDULTS_NATURAL_CLOCK_APP_LOGIN');
if(event.sender?.type!=='Bot'||event.sender?.login!==expectedSender) throw new Error('NATURAL_CLOCK_SENDER_INVALID');
if(event.client_payload?.slot!==expectedSlot) throw new Error('NATURAL_CLOCK_SLOT_ROUTE_INVALID');
let authenticatedRunCreatedAt;
if (Date.now() - Date.parse(event.client_payload.issued_at) > NATURAL_CLOCK_MAX_SKEW_MS) {
  const runId = required('GITHUB_RUN_ID');
  if (!/^[1-9][0-9]*$/.test(runId)) throw new Error('NATURAL_CLOCK_RUN_ID_INVALID');
  const response = await fetch(`https://api.github.com/repos/${required('GITHUB_REPOSITORY')}/actions/runs/${runId}`, {
    headers: {Accept:'application/vnd.github+json', Authorization:`Bearer ${required('GH_TOKEN')}`},
    redirect:'error', signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('NATURAL_CLOCK_RUN_READ_FAILED');
  const run = await response.json();
  if (String(run.id) !== runId || run.repository?.full_name !== process.env.GITHUB_REPOSITORY
    || run.event !== 'repository_dispatch' || run.head_branch !== 'main'
    || run.head_sha !== event.client_payload.exact_main_sha
    || run.head_sha !== required('GITHUB_SHA') || run.run_attempt !== 1
    || required('GITHUB_RUN_ATTEMPT') !== '1' || typeof run.created_at !== 'string') {
    throw new Error('NATURAL_CLOCK_RUN_BINDING_INVALID');
  }
  authenticatedRunCreatedAt = run.created_at;
}
const receipt=verifyNaturalClockDispatch({payload:event.client_payload,liveMainSha:required('KIDULTS_LIVE_MAIN_SHA'),authenticatedRunCreatedAt});
const output=process.env.GITHUB_OUTPUT;
if(output) fs.appendFileSync(output,`exact_main_sha=${receipt.exact_main_sha}\nreceipt_digest=${receipt.receipt_digest}\ndispatch_id=${receipt.dispatch_id}\n`);
const path=process.env.KIDULTS_NATURAL_CLOCK_RECEIPT_PATH||'/tmp/kidults-natural-clock-receipt-v1.json';
fs.writeFileSync(path,`${JSON.stringify(receipt,null,2)}\n`,{flag:'wx',mode:0o600});
process.stdout.write(`${JSON.stringify(receipt)}\n`);
