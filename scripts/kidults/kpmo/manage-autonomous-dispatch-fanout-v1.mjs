#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDispatchRequest,
  transitionDispatchReceipt,
  writeJsonAtomic,
} from './lib/autonomous-dispatch-fanout-v1.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((entries, value, index, all) => {
  if (!value.startsWith('--')) return entries;
  entries.push([value.slice(2), all[index + 1]]);
  return entries;
}, []));

if (args.phase === 'initialize') {
  const results = JSON.parse(fs.readFileSync(args.results, 'utf8'));
  const pullRequest = Number(args.pull_request);
  const candidate = results.find(value => value.state === 'ELIGIBLE' && Number(value.envelope?.pull_request) === pullRequest);
  if (!candidate) throw new Error('AUTONOMOUS_DISPATCH_ELIGIBLE_ENVELOPE_MISSING');
  const built = buildDispatchRequest({
    envelope: candidate.envelope,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  const directory = args.output_dir;
  const receiptPath = path.join(directory, `pr-${pullRequest}-receipt.json`);
  const requestPath = path.join(directory, `pr-${pullRequest}-request.json`);
  writeJsonAtomic(receiptPath, built.receipt);
  writeJsonAtomic(requestPath, built.request);
  process.stdout.write(JSON.stringify({receipt_path: receiptPath, request_path: requestPath}));
} else if (args.phase === 'accepted' || args.phase === 'failed') {
  const receipt = JSON.parse(fs.readFileSync(args.receipt, 'utf8'));
  const transitioned = transitionDispatchReceipt(receipt, {
    state: args.phase === 'accepted' ? 'DISPATCH_ACCEPTED' : 'DISPATCH_FAILED',
    failureCode: args.failure_code,
  });
  writeJsonAtomic(args.receipt, transitioned);
  process.stdout.write(JSON.stringify({receipt_path: args.receipt, state: transitioned.state}));
} else {
  throw new Error('AUTONOMOUS_DISPATCH_PHASE_INVALID');
}
