#!/usr/bin/env node
import fs from 'node:fs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('USAGE: extract-github-comment-body-byte-exact-v1.mjs <comment-json-path>');
  process.exit(64);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch {
  console.error('GITHUB_COMMENT_JSON_INVALID');
  process.exit(65);
}

if (typeof payload?.body !== 'string') {
  console.error('GITHUB_COMMENT_BODY_STRING_REQUIRED');
  process.exit(66);
}

// Deliberately do not use console.log() or jq -r: both append a record separator.
// GitHub's body string, including its exact terminal-LF count, is authoritative.
process.stdout.write(payload.body);
