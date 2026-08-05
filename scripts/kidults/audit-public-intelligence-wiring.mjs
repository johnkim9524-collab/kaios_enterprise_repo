#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const previewDir = path.join(
  root,
  'apps',
  'kidults-enterprise-staging',
  'public',
  'public-enterprise-preview'
);
const indexPath = path.join(previewDir, 'index.html');
const runtimePath = path.join(previewDir, 'intelligence.js');
const dataPath = path.join(previewDir, 'intelligence-data.json');

function fail(message) {
  console.error(`[B33-A4][FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[B33-A4][PASS] ${message}`);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${path.relative(root, filePath)}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

const html = read(indexPath);
const runtime = read(runtimePath);
const rawData = read(dataPath);

if (!html || !runtime || !rawData) process.exit(1);

let data;
try {
  data = JSON.parse(rawData);
  pass('Canonical intelligence JSON parses successfully.');
} catch (error) {
  fail(`Canonical intelligence JSON is invalid: ${error.message}`);
  process.exit(1);
}

const requiredBindings = [
  'data-k100',
  'data-change',
  'data-confidence',
  'data-coverage',
  'data-sources',
  'data-updated',
  'data-method',
  'data-sentiment',
  'data-canon',
  'data-velocity',
  'data-listings',
  'data-category-count',
  'data-status-label'
];

for (const binding of requiredBindings) {
  if (!html.includes(binding)) fail(`Missing HTML binding: ${binding}`);
  else pass(`HTML binding present: ${binding}`);
}

const requiredTargets = [
  'trend-chart',
  'category-bars',
  'signal-mix',
  'confidence-chart',
  'source-donut',
  'geography-chart',
  'movers-chart',
  'lifecycle-chart',
  'correlation-chart'
];

for (const target of requiredTargets) {
  if (!html.includes(`id="${target}"`)) fail(`Missing visualization target: ${target}`);
  else if (!runtime.includes(`#${target}`)) fail(`Visualization target is not wired in intelligence.js: ${target}`);
  else pass(`Visualization target wired: ${target}`);
}

if (!runtime.includes("fetch('intelligence-data.json'")) {
  fail('Runtime does not fetch the canonical intelligence asset.');
} else {
  pass('Runtime fetches intelligence-data.json.');
}

const forbiddenNumericLiterals = [
  data.headline.kidult100.toFixed(1),
  data.headline.sentiment.toFixed(1),
  data.headline.canonStrength.toFixed(1),
  data.headline.marketVelocity.toFixed(2),
  `${Math.round(data.headline.activeListings / 1000)}K`
];

for (const literal of forbiddenNumericLiterals) {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`);
  if (pattern.test(html)) fail(`Hard-coded intelligence value remains in index.html: ${literal}`);
  else pass(`No hard-coded index.html value: ${literal}`);
}

if (!runtime.includes("document.documentElement.dataset.dataReady = 'true'")) {
  fail('Runtime does not publish a successful data-ready state.');
} else {
  pass('Successful data-ready state is published.');
}

if (!runtime.includes("document.documentElement.dataset.dataReady = 'false'")) {
  fail('Runtime does not publish a fail-closed data state.');
} else {
  pass('Fail-closed data state is published.');
}

if (process.exitCode) {
  console.error('[B33-A4] UI wiring audit failed.');
} else {
  console.log('[B33-A4] PASS — public intelligence UI is wired to the canonical staging asset.');
}
