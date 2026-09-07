#!/usr/bin/env node
import fs from 'node:fs';
import { buildProviderOperationsRegistry, repositoryHead } from './provider-operations-capability-v1-lib.mjs';
import { buildProviderPortfolio } from './provider-portfolio-v1-lib.mjs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const contract = read('coordination/kidults/operations/provider-portfolio-v1.json');
const operationsContract = read(contract.authority.operational_model);
const providerRegistry = read(contract.authority.provider_identity_and_current_state);
const rightsManifest = read(contract.authority.rights);
const adapterManifest = read(contract.authority.adapter_foundation);
const communicationEvidence = read(contract.authority.communication);
const onboardingReceiptIndex = read(contract.authority.onboarding_receipts);
const operationsRegistry = buildProviderOperationsRegistry(operationsContract, providerRegistry, rightsManifest, adapterManifest, communicationEvidence, {
  sourceSha: repositoryHead(), observedAt: providerRegistry.as_of
});
process.stdout.write(`${JSON.stringify(buildProviderPortfolio(contract, operationsContract, operationsRegistry, providerRegistry, adapterManifest, onboardingReceiptIndex), null, 2)}\n`);
