#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const CONTRACT = 'coordination/kidults/kpmo/github-app-oidc-broker-architecture-v1.json';
const BROKER = 'infrastructure/aws/staging/autonomous-event-token-broker-v1.cjs';
const TEMPLATE = 'infrastructure/aws/staging/autonomous-event-token-broker-v1.json';
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const active = text => text.split(/\n/).filter(line => !line.trimStart().startsWith('#')).join('\n');
const fail = (code, detail = '') => { throw new Error(detail ? `${code}:${detail}` : code); };

export function validateArchitecture(root = process.cwd()) {
  const contract = JSON.parse(read(path.join(root, CONTRACT)));
  const findings = [];
  const require = (condition, code) => { if (!condition) findings.push(code); };
  require(contract.local_developer_auth === 'GH_LOGIN_WEB_ON_DEMAND_ONLY', 'LOCAL_AUTH_NOT_ON_DEMAND');
  require(contract.actions_auth === 'GITHUB_APP_INSTALLATION_TOKEN_VIA_OIDC_BROKER', 'ACTIONS_AUTH_NOT_APP_BROKER');
  require(contract.broker?.credential_root === 'AWS_SECRETS_MANAGER', 'BROKER_SECRET_ROOT_INVALID');
  require(contract.broker?.oidc_audience === 'sts.amazonaws.com', 'BROKER_OIDC_AUDIENCE_INVALID');
  require(contract.broker?.maximum_token_ttl_seconds === 900, 'BROKER_TTL_NOT_BOUNDED');
  require(contract.broker?.repository_selection === 'SELECTED_REPOSITORY_ONLY', 'BROKER_REPOSITORY_SCOPE_INVALID');
  for (const profile of ['AUTONOMOUS_DISCOVERY_READ','AUTONOMOUS_LIVE_READBACK','AUTONOMOUS_EVENT_DISPATCH']) {
    require(contract.broker.profiles.includes(profile), `BROKER_PROFILE_MISSING:${profile}`);
  }
  for (const relative of contract.protected_workflows || []) {
    const file = path.join(root, relative);
    require(fs.existsSync(file), `WORKFLOW_MISSING:${relative}`);
    if (!fs.existsSync(file)) continue;
    const workflow = active(read(file));
    require(/id-token:\s*write/.test(workflow), `OIDC_PERMISSION_MISSING:${relative}`);
    require(/persist-credentials:\s*false/.test(workflow), `CREDENTIAL_PERSISTENCE_ENABLED:${relative}`);
    require(!/\$\{\{\s*secrets\./i.test(workflow), `DIRECT_SECRET_REFERENCE:${relative}`);
    require(!/github\.token/.test(workflow), `DEFAULT_ACTIONS_TOKEN_BOUND:${relative}`);
    require(!/\b(?:gh\s+api|git\s+push)\b/i.test(workflow), `DIRECT_MUTATION_TOOL:${relative}`);
    require(!/Bearer\s+\$(?:token|GITHUB_TOKEN|GITHUB_APP_INSTALLATION_TOKEN)/.test(workflow), `TOKEN_IN_SHELL_HEADER:${relative}`);
    require(/KIDULTS_AUTONOMOUS_EVENT_TOKEN_BROKER_FUNCTION/.test(workflow), `BROKER_FUNCTION_BINDING_MISSING:${relative}`);
    require(/KIDULTS_AUTONOMOUS_EVENT_BROKER_ROLE_ARN/.test(workflow), `BROKER_ROLE_BINDING_MISSING:${relative}`);
  }
  const broker = read(path.join(root, BROKER));
  const template = JSON.parse(read(path.join(root, TEMPLATE)));
  require(broker.includes('GetSecretValueCommand'), 'PRIVATE_KEY_NOT_READ_FROM_SECRETS_MANAGER');
  require(broker.includes('repository_ids'), 'INSTALLATION_TOKEN_NOT_REPOSITORY_SCOPED');
  require(broker.includes('expires_at'), 'TOKEN_EXPIRY_NOT_VALIDATED');
  require(broker.includes('AUTONOMOUS_DISCOVERY_READ') && broker.includes('AUTONOMOUS_LIVE_READBACK'), 'READ_PROFILES_NOT_IMPLEMENTED');
  require(!/console\.log\([^\n]*token/i.test(broker), 'BROKER_TOKEN_LOGGING');
  require(template.Resources?.BrokerFunction?.Properties?.Code?.ZipFile === broker, 'BROKER_TEMPLATE_SOURCE_DRIFT');
  require(template.Resources?.BrokerRole?.Properties?.Policies?.[0]?.PolicyDocument?.Statement?.[0]?.Action?.includes('secretsmanager:GetSecretValue'), 'BROKER_SECRET_SCOPE_DRIFT');
  const state = findings.length ? 'BLOCKED' : 'VERIFIED_PASS';
  return {id: 'github-app-oidc-broker-architecture-v1', state, findings,
    local_auth: contract.local_developer_auth, actions_auth: contract.actions_auth,
    broker_profiles: contract.broker.profiles, token_ttl_seconds: contract.broker.maximum_token_ttl_seconds,
    pat_persistence: 'FORBIDDEN', token_exposure: 'FORBIDDEN', production: 'HOLD', public: 'HOLD', g5: 'HOLD'};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = validateArchitecture();
  console.log(JSON.stringify(report, null, 2));
  if (report.state !== 'VERIFIED_PASS') fail('GITHUB_APP_OIDC_BROKER_ARCHITECTURE_INVALID', report.findings.join(','));
}
