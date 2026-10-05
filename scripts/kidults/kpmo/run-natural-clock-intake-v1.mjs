#!/usr/bin/env node
import fs from 'node:fs';
import {verifyNaturalClockDispatch} from './lib/natural-clock-dispatch-v1.mjs';

const required=name=>{const value=process.env[name];if(!value)throw new Error(`NATURAL_CLOCK_ENV_REQUIRED:${name}`);return value;};
const event=JSON.parse(fs.readFileSync(required('GITHUB_EVENT_PATH'),'utf8'));
const expectedSlot=required('KIDULTS_NATURAL_CLOCK_SLOT');
const expectedAction=`kidults.natural.clock.${expectedSlot.toLowerCase()}.v1`;
if(required('GITHUB_EVENT_NAME')!=='repository_dispatch'||event.action!==expectedAction) throw new Error('NATURAL_CLOCK_EVENT_INVALID');
if(event.repository?.full_name!==required('GITHUB_REPOSITORY')) throw new Error('NATURAL_CLOCK_REPOSITORY_INVALID');
const expectedSender=required('KIDULTS_NATURAL_CLOCK_APP_LOGIN');
if(event.sender?.type!=='Bot'||event.sender?.login!==expectedSender) throw new Error('NATURAL_CLOCK_SENDER_INVALID');
if(event.client_payload?.slot!==expectedSlot) throw new Error('NATURAL_CLOCK_SLOT_ROUTE_INVALID');
const receipt=verifyNaturalClockDispatch({payload:event.client_payload,liveMainSha:required('KIDULTS_LIVE_MAIN_SHA')});
const output=process.env.GITHUB_OUTPUT;
if(output) fs.appendFileSync(output,`exact_main_sha=${receipt.exact_main_sha}\nreceipt_digest=${receipt.receipt_digest}\ndispatch_id=${receipt.dispatch_id}\n`);
const path=process.env.KIDULTS_NATURAL_CLOCK_RECEIPT_PATH||'/tmp/kidults-natural-clock-receipt-v1.json';
fs.writeFileSync(path,`${JSON.stringify(receipt,null,2)}\n`,{flag:'wx',mode:0o600});
process.stdout.write(`${JSON.stringify(receipt)}\n`);
