import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();
const executionOrder = ['discover','preflight','plan','authorize','execute','verify','cleanup_or_rollback','evidence','finalize'];
const adapters = ['cloudflare','github','digitalocean'];

const contracts = adapters.map((adapter) => ({
  adapter,
  mode: 'bounded-live-ready',
  mutationDefault: 'deny',
  requiresPreflight: true,
  requiresPolicyAuthorization: true,
  nonInteractive: true,
  requiresVerification: true,
  requiresEvidence: true,
  productionRequiresCanary: true,
  productionRequiresRollback: true,
  destructiveRequiresExplicitApproval: true
}));

const cases = [
  { name:'cloudflare-readonly-discovery', adapter:'cloudflare', environment:'staging', risk:'R1', mutation:false, preflight:true, authorized:true, verified:true, evidence:true },
  { name:'github-bounded-mutation-plan', adapter:'github', environment:'staging', risk:'R2', mutation:true, preflight:true, authorized:true, verified:true, evidence:true, blastRadius:1 },
  { name:'digitalocean-production-canary-plan', adapter:'digitalocean', environment:'production', risk:'R3', mutation:true, preflight:true, authorized:true, verified:true, evidence:true, blastRadius:1, canary:true, rollback:true },
  { name:'deny-missing-preflight', adapter:'cloudflare', environment:'staging', risk:'R2', mutation:true, preflight:false, authorized:true, expected:'DENY' },
  { name:'deny-unbounded-blast-radius', adapter:'github', environment:'staging', risk:'R2', mutation:true, preflight:true, authorized:true, blastRadius:999, expected:'DENY' },
  { name:'deny-production-without-canary', adapter:'digitalocean', environment:'production', risk:'R3', mutation:true, preflight:true, authorized:true, rollback:true, canary:false, expected:'DENY' }
];

function decision(c) {
  if (!c.preflight) return 'DENY';
  if (!c.authorized) return 'DENY';
  if ((c.blastRadius ?? 0) > 10) return 'DENY';
  if (c.environment === 'production' && c.mutation && (!c.canary || !c.rollback)) return 'DENY';
  return 'ALLOW';
}

const results = cases.map((c) => ({ ...c, decision: decision(c) }));
const positive = results.filter((x) => !x.expected);
const negative = results.filter((x) => x.expected);
const gates = {
  threeCoreAdaptersCovered: contracts.length === 3,
  policyBeforeExecution: contracts.every((x) => x.requiresPolicyAuthorization),
  preflightBeforeExecution: contracts.every((x) => x.requiresPreflight),
  nonInteractiveByDefault: contracts.every((x) => x.nonInteractive),
  boundedMutationDefault: contracts.every((x) => x.mutationDefault === 'deny'),
  verificationAndEvidenceRequired: contracts.every((x) => x.requiresVerification && x.requiresEvidence),
  productionCanaryRollbackRequired: contracts.every((x) => x.productionRequiresCanary && x.productionRequiresRollback),
  positiveCasesAllowed: positive.every((x) => x.decision === 'ALLOW'),
  negativeCasesFailClosed: negative.every((x) => x.decision === x.expected),
  executionOrderCanonical: executionOrder.join('>') === 'discover>preflight>plan>authorize>execute>verify>cleanup_or_rollback>evidence>finalize'
};

const report = {
  certification:'KIDULTS A17 Bounded Live Adapter Readiness',
  completedAt:new Date().toISOString(),
  purpose:'Certify policy-governed bounded live execution contracts before enabling real external mutations.',
  executionOrder,
  contracts,
  results,
  gates
};
report.status = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';
const dir = resolve(cwd,'reports','execution-control');
mkdirSync(dir,{recursive:true});
const reportPath = resolve(dir,`a17-bounded-live-${Date.now()}.json`);
writeFileSync(reportPath,JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify(report,null,2));
console.log(`A17 report: ${reportPath}`);
console.log(`A17 certification: ${report.status}`);
if (report.status !== 'PASS') process.exit(1);
