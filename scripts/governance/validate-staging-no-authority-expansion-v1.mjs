import fs from 'node:fs';

const args = process.argv.slice(2);
const value = flag => {
  const i = args.indexOf(flag);
  if (i < 0 || !args[i + 1]) throw new Error(`MISSING_${flag.replace(/^--/,'').toUpperCase()}`);
  return args[i + 1];
};
const currentPath = value('--current');
const desiredPath = value('--desired');
const allowLambdaCode = args.includes('--allow-lambda-code-change');
const parse = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const unwrap = x => typeof x === 'string' ? JSON.parse(x) : x;
const current = unwrap(parse(currentPath));
const desired = unwrap(parse(desiredPath));
const canonical = x => Array.isArray(x) ? x.map(canonical) : (x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x);
const stable = x => JSON.stringify(canonical(x));
const arr = x => Array.isArray(x) ? x : [x].filter(Boolean);
const fail = code => { throw new Error(code); };
// Context checks constrain this opt-in; only the protected native workflow can
// establish Owner authority. A local invocation never grants that authority.
const ownerTimeoutOptIn = args.includes('--allow-owner-reviewed-broker-timeout-30-to-180');
let ownerTimeoutTransition = false;
if (ownerTimeoutOptIn) {
  const e = process.env;
  let event;
  try { event = parse(e.GITHUB_EVENT_PATH); } catch { fail('STAGING_OWNER_TIMEOUT_NATIVE_EVENT_REQUIRED'); }
  const sha = e.GITHUB_SHA;
  const changeSet = e.CHANGE_SET_NAME;
  if (!allowLambdaCode || e.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      e.GITHUB_REPOSITORY !== 'johnkim9524-collab/kaios_enterprise_repo' ||
      e.GITHUB_REPOSITORY_OWNER !== 'johnkim9524-collab' || e.GITHUB_ACTOR !== e.GITHUB_REPOSITORY_OWNER ||
      e.GITHUB_RUN_ATTEMPT !== '1' || e.GITHUB_REF !== 'refs/heads/main' ||
      !/^[0-9a-f]{40}$/.test(sha || '') || e.DEPLOY_MAIN_SHA !== sha ||
      !new RegExp(`^kidults-broker-${sha.slice(0,12)}-[0-9]+$`).test(changeSet || '') ||
      !/^[0-9]+$/.test(e.GITHUB_RUN_ID || '') || changeSet.endsWith(`-${e.GITHUB_RUN_ID}`) ||
      e.AUTHORIZATION_ID !== `DEPLOY-STAGING-BROKER-${sha.slice(0,12)}-${changeSet}` ||
      e.STACK_NAME !== 'kidults-autonomous-event-token-broker-staging' ||
      !['true', true].includes(event.inputs?.owner_timeout_30_to_180) ||
      event.inputs?.main_sha !== sha || event.inputs?.change_set_name !== changeSet ||
      event.inputs?.authorization_id !== e.AUTHORIZATION_ID || event.inputs?.stack_name !== e.STACK_NAME) {
    fail('STAGING_OWNER_TIMEOUT_CONTEXT_MISMATCH');
  }
}
const subset = (wanted, existing) => { const have = new Set(existing.map(stable)); return wanted.every(v => have.has(stable(v))); };
const policyNoExpansion = (oldDoc, newDoc) => {
  const oldStatements = arr(oldDoc?.Statement);
  for (const ns of arr(newDoc?.Statement)) {
    if (ns.Effect === 'Deny') continue;
    const match = oldStatements.find(os =>
      os.Effect === ns.Effect &&
      subset(arr(ns.Action), arr(os.Action)) &&
      subset(arr(ns.Resource), arr(os.Resource)) &&
      stable(ns.Condition || {}) === stable(os.Condition || {})
    );
    if (!match) return false;
  }
  return true;
};
const oldResources = current.Resources || {};
const newResources = desired.Resources || {};
if (ownerTimeoutOptIn) {
  const oldEnvelope={...current},newEnvelope={...desired};
  delete oldEnvelope.Resources;delete newEnvelope.Resources;
  if(stable(oldEnvelope)!==stable(newEnvelope)) fail('STAGING_OWNER_TIMEOUT_TEMPLATE_ENVELOPE_CHANGE');
  for(const [name,next] of Object.entries(newResources)) {
    const prev=oldResources[name];
    const before=structuredClone(prev || {}),after=structuredClone(next);
    if(before.Type==='AWS::Lambda::Function' && after.Type===before.Type) {
      delete before.Properties?.Code;delete after.Properties?.Code;
      if(name==='BrokerFunction' && before.Properties?.Timeout===30 && after.Properties?.Timeout===180) before.Properties.Timeout=180;
    }
    if(stable(before)!==stable(after)) fail(`STAGING_OWNER_TIMEOUT_UNRELATED_CHANGE:${name}`);
  }
}
if (stable(Object.keys(oldResources).sort()) !== stable(Object.keys(newResources).sort())) {
  fail('STAGING_RESOURCE_SET_CHANGE_OWNER_BOUNDARY');
}
for (const [name, next] of Object.entries(newResources)) {
  const prev = oldResources[name];
  if (prev.Type !== next.Type) fail(`STAGING_RESOURCE_TYPE_CHANGE_OWNER_BOUNDARY:${name}`);
  if (next.Type === 'AWS::IAM::Role') {
    if (stable(prev.Properties?.AssumeRolePolicyDocument) !== stable(next.Properties?.AssumeRolePolicyDocument)) {
      fail(`STAGING_TRUST_CHANGE_OWNER_BOUNDARY:${name}`);
    }
    if (stable(prev.Properties?.ManagedPolicyArns || []) !== stable(next.Properties?.ManagedPolicyArns || [])) {
      fail(`STAGING_MANAGED_POLICY_CHANGE_OWNER_BOUNDARY:${name}`);
    }
    const oldPolicies = Object.fromEntries(arr(prev.Properties?.Policies).map(p => [p.PolicyName, p.PolicyDocument]));
    for (const p of arr(next.Properties?.Policies)) {
      if (!oldPolicies[p.PolicyName] || !policyNoExpansion(oldPolicies[p.PolicyName], p.PolicyDocument)) {
        fail(`STAGING_IAM_EXPANSION_OWNER_BOUNDARY:${name}:${p.PolicyName}`);
      }
    }
    continue;
  }
  if (next.Type === 'AWS::Lambda::Function' && allowLambdaCode) {
    const oldProps = {...(prev.Properties || {})};
    const newProps = {...(next.Properties || {})};
    delete oldProps.Code;
    delete newProps.Code;
    if (ownerTimeoutOptIn && name === 'BrokerFunction' && oldProps.Timeout === 30 && newProps.Timeout === 180) {
      oldProps.Timeout = 180;
      ownerTimeoutTransition = true;
    }
    if (stable(oldProps) !== stable(newProps)) fail(`STAGING_LAMBDA_NONCODE_CHANGE_OWNER_BOUNDARY:${name}`);
    continue;
  }
  if (stable(prev.Properties || {}) !== stable(next.Properties || {})) {
    fail(`STAGING_NONREVERSIBLE_INFRA_CHANGE_OWNER_BOUNDARY:${name}`);
  }
}
console.log(JSON.stringify({
  state: ownerTimeoutTransition ? 'VERIFIED_OWNER_ONLY_TIMEOUT_SCOPE' : 'VERIFIED_NO_AUTHORITY_EXPANSION',
  resources: Object.keys(newResources).length,
  lambda_code_change_allowed: allowLambdaCode,
  owner_timeout_transition: ownerTimeoutTransition,
  authority_granted: false,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
