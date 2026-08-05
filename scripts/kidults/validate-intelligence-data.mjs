#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataPath = path.resolve(
  __dirname,
  '../../apps/kidults-enterprise-staging/public/public-enterprise-preview/intelligence-data.json'
);

const dataPath = path.resolve(process.cwd(), process.argv[2] || defaultDataPath);
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertNumber(value, label, min = -Infinity, max = Infinity) {
  if (!isFiniteNumber(value)) {
    fail(`${label} must be a finite number.`);
    return;
  }
  if (value < min || value > max) {
    fail(`${label} must be between ${min} and ${max}; received ${value}.`);
  }
}

function assertRequiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
    return false;
  }
  return true;
}

function assertArray(value, label, minimum = 1) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
    return false;
  }
  if (value.length < minimum) {
    fail(`${label} must contain at least ${minimum} item(s).`);
  }
  return true;
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item?.[key];
    if (seen.has(value)) fail(`${label} contains duplicate ${key}: ${String(value)}.`);
    seen.add(value);
  }
}

function assertPercentageTotal(items, label, key = 'value') {
  if (!Array.isArray(items)) return;
  const total = items.reduce((sum, item) => sum + (isFiniteNumber(item?.[key]) ? item[key] : 0), 0);
  if (Math.abs(total - 100) > 0.0001) {
    fail(`${label} must total 100; received ${total}.`);
  }
}

function assertCorrelation(correlation) {
  if (!assertRequiredObject(correlation, 'correlation')) return;
  const { labels, values } = correlation;
  if (!assertArray(labels, 'correlation.labels', 2)) return;
  if (!assertArray(values, 'correlation.values', 2)) return;

  if (labels.length !== values.length) {
    fail(`correlation.values row count must equal label count (${labels.length}); received ${values.length}.`);
  }

  values.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      fail(`correlation.values[${rowIndex}] must be an array.`);
      return;
    }
    if (row.length !== labels.length) {
      fail(`correlation.values[${rowIndex}] must contain ${labels.length} values; received ${row.length}.`);
    }
    row.forEach((value, columnIndex) => {
      assertNumber(value, `correlation.values[${rowIndex}][${columnIndex}]`, -1, 1);
      if (rowIndex === columnIndex && value !== 1) {
        fail(`correlation diagonal at [${rowIndex}][${columnIndex}] must equal 1.`);
      }
    });
  });

  for (let row = 0; row < values.length; row += 1) {
    for (let column = row + 1; column < values.length; column += 1) {
      const a = values[row]?.[column];
      const b = values[column]?.[row];
      if (isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) > 0.0001) {
        fail(`correlation matrix must be symmetric at [${row}][${column}] and [${column}][${row}].`);
      }
    }
  }
}

async function main() {
  let data;
  try {
    data = JSON.parse(await readFile(dataPath, 'utf8'));
  } catch (error) {
    console.error(`[B33] Unable to read or parse ${dataPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const allowedStatuses = new Set(['illustrative', 'staging', 'validated', 'production']);
  if (!allowedStatuses.has(data.status)) fail(`Unsupported status: ${String(data.status)}.`);
  if (typeof data.label !== 'string' || data.label.trim() === '') fail('label must be a non-empty string.');
  if (Number.isNaN(Date.parse(data.updated))) fail(`updated must be a valid ISO date-time; received ${String(data.updated)}.`);
  if (typeof data.methodologyVersion !== 'string' || !/^v\d+(?:\.\d+){1,2}$/.test(data.methodologyVersion)) {
    fail(`methodologyVersion must match vN.N or vN.N.N; received ${String(data.methodologyVersion)}.`);
  }

  if (assertRequiredObject(data.headline, 'headline')) {
    assertNumber(data.headline.kidult100, 'headline.kidult100', 0, 100);
    assertNumber(data.headline.change30d, 'headline.change30d', -100, 100);
    assertNumber(data.headline.confidence, 'headline.confidence', 0, 100);
    assertNumber(data.headline.coverageBrands, 'headline.coverageBrands', 0);
    assertNumber(data.headline.sourceFamilies, 'headline.sourceFamilies', 0);
    assertNumber(data.headline.categories, 'headline.categories', 0);
    assertNumber(data.headline.sentiment, 'headline.sentiment', 0, 100);
    assertNumber(data.headline.canonStrength, 'headline.canonStrength', 0, 100);
    assertNumber(data.headline.marketVelocity, 'headline.marketVelocity', 0);
    assertNumber(data.headline.activeListings, 'headline.activeListings', 0);
  }

  if (assertArray(data.trend, 'trend', 2)) {
    data.trend.forEach((item, index) => {
      if (typeof item?.period !== 'string' || item.period.trim() === '') fail(`trend[${index}].period must be non-empty.`);
      assertNumber(item?.value, `trend[${index}].value`, 0, 100);
    });
    const current = data.trend.at(-1)?.value;
    if (isFiniteNumber(current) && isFiniteNumber(data.headline?.kidult100) && current !== data.headline.kidult100) {
      fail(`headline.kidult100 (${data.headline.kidult100}) must equal the final trend value (${current}).`);
    }
  }

  if (assertArray(data.categoriesData, 'categoriesData')) {
    assertUnique(data.categoriesData, 'name', 'categoriesData');
    data.categoriesData.forEach((item, index) => {
      if (typeof item?.name !== 'string' || item.name.trim() === '') fail(`categoriesData[${index}].name must be non-empty.`);
      assertNumber(item?.score, `categoriesData[${index}].score`, 0, 100);
      assertNumber(item?.confidence, `categoriesData[${index}].confidence`, 0, 100);
      assertNumber(item?.velocity, `categoriesData[${index}].velocity`, 0);
      assertNumber(item?.liquidity, `categoriesData[${index}].liquidity`, 0, 100);
    });
    if (isFiniteNumber(data.headline?.categories) && data.headline.categories > data.categoriesData.length) {
      warn(`headline.categories tracks ${data.headline.categories}, while ${data.categoriesData.length} category rows are displayed.`);
    }
  }

  for (const [field, label] of [
    ['signalMix', 'signalMix'],
    ['confidenceDistribution', 'confidenceDistribution'],
    ['sourceComposition', 'sourceComposition'],
    ['geography', 'geography']
  ]) {
    if (assertArray(data[field], label)) {
      data[field].forEach((item, index) => assertNumber(item?.value, `${label}[${index}].value`, 0, 100));
      assertPercentageTotal(data[field], label);
    }
  }

  if (Array.isArray(data.signalMix)) assertUnique(data.signalMix, 'name', 'signalMix');
  if (Array.isArray(data.confidenceDistribution)) assertUnique(data.confidenceDistribution, 'grade', 'confidenceDistribution');
  if (Array.isArray(data.sourceComposition)) assertUnique(data.sourceComposition, 'name', 'sourceComposition');
  if (Array.isArray(data.geography)) assertUnique(data.geography, 'region', 'geography');

  if (assertArray(data.movers, 'movers')) {
    assertUnique(data.movers, 'name', 'movers');
    data.movers.forEach((item, index) => assertNumber(item?.change, `movers[${index}].change`, -100, 100));
  }

  if (assertArray(data.lifecycle, 'lifecycle')) {
    assertUnique(data.lifecycle, 'name', 'lifecycle');
    data.lifecycle.forEach((item, index) => assertNumber(item?.score, `lifecycle[${index}].score`, 0, 100));
  }

  assertCorrelation(data.correlation);

  if (isFiniteNumber(data.headline?.change30d)) {
    warn('headline.change30d is currently precomputed; the retained trend series does not define an exact 30-day observation pair.');
  }
  if (data.status === 'staging' || data.status === 'illustrative') {
    warn(`Data status is ${data.status}; production claims must remain disabled.`);
  }

  console.log(`[B33] Validated: ${dataPath}`);
  warnings.forEach((message) => console.warn(`[B33][WARN] ${message}`));

  if (errors.length > 0) {
    errors.forEach((message) => console.error(`[B33][ERROR] ${message}`));
    console.error(`[B33] FAILED with ${errors.length} error(s) and ${warnings.length} warning(s).`);
    process.exit(1);
  }

  console.log(`[B33] PASS with ${warnings.length} warning(s).`);
}

main().catch((error) => {
  console.error('[B33] Unexpected validator failure.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
