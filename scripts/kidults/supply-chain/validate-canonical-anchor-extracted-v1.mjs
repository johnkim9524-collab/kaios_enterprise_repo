#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const inputDir = process.argv[2];
const manifestPath = process.env.KIDULTS_ANCHOR_MANIFEST ||
  'coordination/kidults/product/representative-anchor-input-manifest-v1.json';
if (!inputDir) throw new Error('CANONICAL_ANCHOR_INPUT_DIR_REQUIRED');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const allFiles = walk(inputDir);
for (const officialName of manifest.official_input_files) {
  const matches = allFiles.filter((file) => path.basename(file) === officialName);
  if (matches.length !== 1) throw new Error(`CANONICAL_ANCHOR_FILE_CARDINALITY:${officialName}:${matches.length}`);
  JSON.parse(fs.readFileSync(matches[0], 'utf8'));
}

console.log(JSON.stringify({
  state: 'VERIFIED_PASS',
  official_file_count: manifest.official_input_files.length,
  exact_file_cardinality: true,
  json_parseable: true,
  authority: 'STRUCTURAL_PREFLIGHT_ONLY',
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
