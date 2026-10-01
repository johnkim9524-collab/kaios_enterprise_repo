#!/usr/bin/env node
import fs from 'node:fs';

const token = process.env.KIDULTS_GITHUB_APP_INSTALLATION_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const requestPath = process.argv[2];
if (!token || !repository || !requestPath) throw new Error('APP_DISPATCH_INPUT_REQUIRED');
const body = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
const response = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
  method: 'POST', redirect: 'error',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'kidults-autonomous-app-dispatch-v1',
  },
  body: JSON.stringify(body),
});
if (!response.ok) throw new Error(`APP_DISPATCH_HTTP_${response.status}`);
console.log(JSON.stringify({ state: 'APP_DISPATCH_ACCEPTED', repository, event_type: body.event_type }));
