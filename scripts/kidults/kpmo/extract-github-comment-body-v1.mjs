#!/usr/bin/env node
import fs from 'node:fs';

const [input] = process.argv.slice(2);
if (!input || process.argv.length !== 3) {
  process.stderr.write('GITHUB_COMMENT_BODY_EXTRACT_FAIL:ARGUMENT_SET\n');
  process.exit(64);
}
let value;
try {
  value = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch {
  process.stderr.write('GITHUB_COMMENT_BODY_EXTRACT_FAIL:JSON\n');
  process.exit(65);
}
if (typeof value.body !== 'string') {
  process.stderr.write('GITHUB_COMMENT_BODY_EXTRACT_FAIL:BODY_TYPE\n');
  process.exit(66);
}
process.stdout.write(value.body);
