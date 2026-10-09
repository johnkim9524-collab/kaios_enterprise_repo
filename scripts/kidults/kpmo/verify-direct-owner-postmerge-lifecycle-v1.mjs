#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {verifyDirectOwnerPostmergeLifecycle} from './lib/direct-owner-postmerge-lifecycle-v1.mjs';

const token = process.env.GH_TOKEN || '';
const repository = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
const receiptPath = process.env.HANDOFF_RECEIPT_PATH || 'out/direct-owner-landing-handoff-v1/receipt.json';
const fail = code => { throw new Error(code); };
if (!token || !/^[^/]+\/[^/]+$/.test(repository)) fail('DIRECT_OWNER_POSTMERGE_ENVIRONMENT_INVALID');

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kidults-direct-owner-postmerge-lifecycle-v1',
};
const request = async apiPath => {
  const response = await fetch(`https://api.github.com/repos/${repository}${apiPath}`, {headers, redirect: 'error'});
  const payload = await response.json().catch(() => null);
  if (!response.ok) fail(`DIRECT_OWNER_POSTMERGE_GITHUB_API_${response.status}`);
  return payload;
};
const pages = async apiPath => {
  const output = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = apiPath.includes('?') ? '&' : '?';
    const values = await request(`${apiPath}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(values)) fail('DIRECT_OWNER_POSTMERGE_PAGINATION_SHAPE_INVALID');
    output.push(...values);
    if (values.length < 100) return output;
  }
  fail('DIRECT_OWNER_POSTMERGE_PAGINATION_BOUND_EXCEEDED');
};
const writeReceipt = receipt => {
  const temporary = `${receiptPath}.lifecycle-${process.pid}`;
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true, mode: 0o700});
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
  fs.renameSync(temporary, receiptPath);
  fs.chmodSync(receiptPath, 0o600);
};

const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
try {
  const metadata = await request('');
  const repositoryOwner = metadata?.owner?.login;
  const [pullRequest, timeline, comments] = await Promise.all([
    request(`/pulls/${receipt.pull_request}`),
    pages(`/issues/${receipt.pull_request}/timeline`),
    pages(`/issues/${receipt.pull_request}/comments`),
  ]);
  const proof = verifyDirectOwnerPostmergeLifecycle({receipt, pullRequest, timeline, comments, repositoryOwner});
  writeReceipt({...receipt, post_merge_lifecycle_verified: true, post_merge_lifecycle: proof});
  console.log(JSON.stringify(proof));
} catch (error) {
  const failureCode = String(error?.message || 'DIRECT_OWNER_POSTMERGE_LIFECYCLE_FAILED').slice(0, 140);
  writeReceipt({
    ...receipt,
    state: 'VERIFIED_FAIL',
    prior_merge_terminal_state: receipt.state,
    failure_code: failureCode,
    post_merge_lifecycle_verified: false,
    promotion_eligible: false,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  });
  throw error;
}
