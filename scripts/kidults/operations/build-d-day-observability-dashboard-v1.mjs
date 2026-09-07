#!/usr/bin/env node
import fs from 'node:fs';
import { buildOperationalDashboard, repositoryHead, runOperationalSimulation } from './d-day-operations-readiness-v1-lib.mjs';

const adapters = JSON.parse(fs.readFileSync('coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json', 'utf8'));
const simulation = runOperationalSimulation(adapters, { sourceSha: repositoryHead() });
process.stdout.write(`${JSON.stringify(buildOperationalDashboard(simulation), null, 2)}\n`);
