import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const contractFile = path.join(dataRoot, 'external-source-certification.json');
const outputFile = path.join(dataRoot, 'generated', 'external-source-certification.json');

const contract = JSON.parse(fs.readFileSync(contractFile, 'utf8'));
const providers = contract.providers.map(provider => {
  const credentialPresent = Boolean(process.env[provider.credentialEnv]);
  const rightsApproved = provider.rights.productionUseApproved === true
    && provider.rights.evidenceRetentionApproved === true
    && provider.rights.status === 'approved';
  const endpointConfigured = typeof provider.endpoint === 'string' && provider.endpoint.length > 0;
  const healthConfigured = typeof provider.healthEndpoint === 'string' && provider.healthEndpoint.length > 0;

  return {
    ...provider,
    credentialPresent,
    certification: {
      credentials: credentialPresent ? 'passed' : 'blocked',
      rights: rightsApproved ? 'passed' : 'blocked',
      endpoint: endpointConfigured ? 'passed' : 'blocked',
      healthProbe: healthConfigured ? 'ready' : 'blocked'
    }
  };
});

const requiredRoles = new Set(contract.requiredRoles);
const registeredRoles = new Set(providers.map(provider => provider.role));
const rolesPassed = [...requiredRoles].every(role => registeredRoles.has(role));
const credentialsPassed = providers.every(provider => provider.certification.credentials === 'passed');
const rightsPassed = providers.every(provider => provider.certification.rights === 'passed');
const healthReady = providers.every(provider => provider.certification.healthProbe === 'ready');
const independentFamilies = new Set(
  providers
    .filter(provider => provider.certification.credentials === 'passed' && provider.certification.rights === 'passed')
    .map(provider => provider.family)
).size;
const familyGate = independentFamilies >= contract.minimumIndependentCertifiedFamilies;
const schedulePassed = contract.schedule.enabled === true;
const simulationPassed = contract.failureSimulation.status === 'passed';

const productionPromotionAuthorized = rolesPassed
  && credentialsPassed
  && rightsPassed
  && healthReady
  && familyGate
  && schedulePassed
  && simulationPassed
  && contract.productionPromotionAuthorized === true;

const result = {
  release: contract.release,
  environment: contract.environment,
  evaluatedAt: new Date().toISOString(),
  status: productionPromotionAuthorized ? 'production-authorized' : 'blocked',
  productionPromotionAuthorized,
  independentCertifiedFamilies: independentFamilies,
  providers,
  gates: {
    roles: rolesPassed ? 'passed' : 'blocked',
    credentials: credentialsPassed ? 'passed' : 'blocked',
    rights: rightsPassed ? 'passed' : 'blocked',
    health: healthReady ? 'ready' : 'blocked',
    independentFamilies: familyGate ? 'passed' : 'blocked',
    schedule: schedulePassed ? 'passed' : 'blocked',
    failureSimulation: simulationPassed ? 'passed' : 'blocked',
    productionAuthorization: productionPromotionAuthorized ? 'passed' : 'blocked'
  },
  blockers: [
    !credentialsPassed && 'Provider credentials are missing.',
    !rightsPassed && 'Production source rights are not approved.',
    !healthReady && 'Provider health endpoints are not configured.',
    !familyGate && 'Independent certified provider-family minimum is not met.',
    !schedulePassed && 'Scheduled pipeline execution is disabled.',
    !simulationPassed && 'Failure simulation has not passed.',
    contract.productionPromotionAuthorized !== true && 'Explicit release authorization remains false.'
  ].filter(Boolean)
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(`A13-B15 certification: ${result.status}.`);
console.log(`Independent certified families: ${independentFamilies}.`);
