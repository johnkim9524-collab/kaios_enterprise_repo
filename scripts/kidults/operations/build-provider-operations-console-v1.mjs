#!/usr/bin/env node
import fs from 'node:fs';
import { buildOperationsConsole, buildProviderOperationsRegistry, repositoryHead } from './provider-operations-capability-v1-lib.mjs';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const contract = readJson('coordination/kidults/operations/provider-operations-capability-v1.json');
const registry = buildProviderOperationsRegistry(
  contract,
  readJson(contract.source_bindings.provider_registry),
  readJson(contract.source_bindings.rights_manifest),
  readJson(contract.source_bindings.adapter_manifest),
  readJson(contract.source_bindings.communication_evidence),
  { sourceSha: repositoryHead() }
);
process.stdout.write(`${JSON.stringify(buildOperationsConsole(registry, contract), null, 2)}\n`);
