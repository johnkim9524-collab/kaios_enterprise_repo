import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const contract = JSON.parse(
  fs.readFileSync(path.join(dataRoot, 'provider-injection.json'), 'utf8')
);

const isHttpUrl = value => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
};

const providers = contract.providers.map(provider => {
  const endpoint = process.env[provider.endpointEnv] || '';
  const healthEndpoint = process.env[provider.healthEndpointEnv] || '';
  const credentialPresent = Boolean(process.env[provider.credentialEnv]);
  const rightsFile = path.join(appRoot, provider.rightsApprovalFile);
  const rights = fs.existsSync(rightsFile)
    ? JSON.parse(fs.readFileSync(rightsFile, 'utf8'))
    : null;
  const rightsApproved = Boolean(
    rights
    && rights.status === 'approved'
    && rights.productionUseApproved === true
    && rights.evidenceRetentionApproved === true
  );

  return {
    role: provider.role,
    endpointConfigured: isHttpUrl(endpoint),
    healthEndpointConfigured: isHttpUrl(healthEndpoint),
    credentialPresent,
    rightsApproved,
    secretValueExposed: false,
    status: isHttpUrl(endpoint) && isHttpUrl(healthEndpoint) && credentialPresent && rightsApproved
      ? 'ready'
      : 'blocked'
  };
});

const mockHarnessPassed = contract.requiredRoles.every(role =>
  providers.some(provider => provider.role === role)
);
const endpointsPassed = providers.every(provider => provider.endpointConfigured);
const healthPassed = providers.every(provider => provider.healthEndpointConfigured);
const credentialsPassed = providers.every(provider => provider.credentialPresent);
const rightsPassed = providers.every(provider => provider.rightsApproved);

const report = {
  release: 'A13-B17',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: endpointsPassed && healthPassed && credentialsPassed && rightsPassed
    ? 'provider-injection-ready'
    : 'blocked',
  productionPromotionAuthorized: false,
  providers,
  gates: {
    roles: mockHarnessPassed ? 'passed' : 'blocked',
    endpoints: endpointsPassed ? 'passed' : 'blocked',
    healthEndpoints: healthPassed ? 'passed' : 'blocked',
    credentials: credentialsPassed ? 'passed' : 'blocked',
    rights: rightsPassed ? 'passed' : 'blocked',
    mockHarness: mockHarnessPassed ? 'passed' : 'blocked',
    releaseCommandCenter: 'passed',
    productionAuthorization: 'blocked'
  },
  blockers: [
    !endpointsPassed && 'One or more provider endpoints are missing or invalid.',
    !healthPassed && 'One or more provider health endpoints are missing or invalid.',
    !credentialsPassed && 'One or more provider credentials are missing.',
    !rightsPassed && 'One or more provider rights approvals are incomplete.',
    'Explicit production release authorization remains false.'
  ].filter(Boolean)
};

const output = path.join(dataRoot, 'generated', 'provider-injection.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`A13-B17 provider injection: ${report.status}.`);
console.log(`Ready providers: ${providers.filter(provider => provider.status === 'ready').length}/${providers.length}.`);
console.log('Production promotion authorized: false.');
