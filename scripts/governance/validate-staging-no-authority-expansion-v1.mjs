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
    if (stable(oldProps) !== stable(newProps)) fail(`STAGING_LAMBDA_NONCODE_CHANGE_OWNER_BOUNDARY:${name}`);
    continue;
  }
  if (stable(prev.Properties || {}) !== stable(next.Properties || {})) {
    fail(`STAGING_NONREVERSIBLE_INFRA_CHANGE_OWNER_BOUNDARY:${name}`);
  }
}
console.log(JSON.stringify({
  state: 'VERIFIED_NO_AUTHORITY_EXPANSION',
  resources: Object.keys(newResources).length,
  lambda_code_change_allowed: allowLambdaCode,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
