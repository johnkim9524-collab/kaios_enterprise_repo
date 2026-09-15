#!/usr/bin/env node
import fs from 'node:fs';
import { repositoryHead, runOperationalSimulation } from './d-day-operations-readiness-v1-lib.mjs';

const adapters = JSON.parse(fs.readFileSync('coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json', 'utf8'));
process.stdout.write(`${JSON.stringify(runOperationalSimulation(adapters, { sourceSha: repositoryHead() }), null, 2)}\n`);
