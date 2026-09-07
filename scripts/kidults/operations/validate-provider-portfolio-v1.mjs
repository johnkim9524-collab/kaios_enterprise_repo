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
const portfolio = buildProviderPortfolio(contract, operationsContract, operationsRegistry, providerRegistry, adapterManifest, onboardingReceiptIndex);
if (portfolio.counts.providers !== 21 || portfolio.counts.playbooks !== 21 || portfolio.counts.queue_entries !== 21) throw new Error('PROVIDER_PORTFOLIO_COVERAGE_INVALID');
if (portfolio.counts.ready !== 0 || portfolio.counts.blocked !== 21) throw new Error('PROVIDER_PORTFOLIO_FALSE_READY');
if (portfolio.execution_queue[0]?.provider_id !== 'PSA_PREMIUM' || portfolio.execution_queue[0]?.priority !== 0) throw new Error('PROVIDER_PORTFOLIO_PRIORITY_ZERO_INVALID');
if (new Set(portfolio.provider_portfolio.map(item => item.provider_id)).size !== 21) throw new Error('PROVIDER_PORTFOLIO_DUPLICATE_PROVIDER');
if (portfolio.provider_portfolio.some((item, index) => item.priority !== index || !item.blockers.length || !item.gaps.length)) throw new Error('PROVIDER_PORTFOLIO_EXACT_BLOCKER_OR_PRIORITY_MISSING');
if (portfolio.provider_playbooks.some(item => JSON.stringify(item.golden_path) !== JSON.stringify(contract.golden_path))) throw new Error('PROVIDER_PORTFOLIO_GOLDEN_PATH_DRIFT');
if (portfolio.provider_playbooks.some(item => contract.required_playbook_sections.some(section => !(section in item)))) throw new Error('PROVIDER_PORTFOLIO_PLAYBOOK_SECTION_MISSING');
if (/\b(TODO|TBD|PLACEHOLDER)\b/i.test(JSON.stringify(portfolio.provider_playbooks))) throw new Error('PROVIDER_PORTFOLIO_PLAYBOOK_PLACEHOLDER');
if (portfolio.provider_calls !== 0 || portfolio.credentials_created !== 0 || portfolio.providers_activated !== 0 || portfolio.production !== 'HOLD' || portfolio.public !== 'HOLD' || portfolio.g5 !== 'HOLD') throw new Error('PROVIDER_PORTFOLIO_AUTHORITY_BOUNDARY_INVALID');
console.log(JSON.stringify({
  validator: 'KIDULTS_PROVIDER_PORTFOLIO_V1', state: 'VERIFIED_PASS', source_sha: portfolio.source_sha,
  providers: portfolio.counts.providers, ready: portfolio.counts.ready, blocked: portfolio.counts.blocked,
  playbooks: portfolio.counts.playbooks, golden_path_stages: portfolio.golden_path.length,
  gap_dimensions: contract.gap_dimensions.length, queue_entries: portfolio.counts.queue_entries,
  priority_zero: portfolio.execution_queue[0].provider_id,
  priority_zero_exact_reasons: portfolio.execution_queue[0].exact_reasons,
  priority_zero_exact_blockers: portfolio.execution_queue[0].exact_blockers,
  provider_calls: portfolio.provider_calls, credentials_created: portfolio.credentials_created,
  providers_activated: portfolio.providers_activated, production: portfolio.production, public: portfolio.public, g5: portfolio.g5,
  portfolio_digest: portfolio.portfolio_digest
}, null, 2));
