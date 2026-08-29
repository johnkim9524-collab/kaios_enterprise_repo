#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = path => fs.readFileSync(path, 'utf8');
const contract = JSON.parse(read('coordination/kidults/runtime/cloudflare-external-one-shot-approval-future-activation-v1.json'));
const estatePolicy = JSON.parse(read('coordination/kidults/redteam/cloudflare-worker-estate-policy-v1.json'));

const mutationLanes = [
  {
    path: '.github/workflows/kpmo-cloudflare-preview-retire-and-governed-staging-v1.yml',
    mutation: /cloudflare-pages-cf-kidults-14501ac-01\.sh/,
    disabledJobs: 1,
  },
  {
    path: '.github/workflows/kidults-cloudflare-pages-staging-deploy-v1.yml',
    mutation: /cloudflare-pages-governed-staging-deploy\.sh/,
    disabledJobs: 2,
  },
  {
    path: '.github/workflows/kidults-cloudflare-pages-emergency-control-v1.yml',
    mutation: /cloudflare-pages-(?:auto-deployment-containment|preview-cleanup)\.sh/,
    disabledJobs: 1,
  },
];

const workflowDir = '.github/workflows';
const scriptRoots = ['scripts'];
const mutationCommand = /\b(?:cf_request|api_request)\s+(?:POST|PUT|PATCH|DELETE)\b|\bwrangler(?:@[^\s]+)?\s+pages\s+deploy\b|\b--(?:delete-preview|execute)\b/i;

function walk(root) {
  return fs.readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const child = path.join(root, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

function mutatingScripts() {
  return scriptRoots.flatMap(walk).filter((file) => {
    if (!/\.(?:sh|mjs|js|cjs)$/.test(file)) return false;
    if (/(?:^|\/)(?:tests?|validate|audit)[^/]*\.(?:mjs|js|cjs)$/i.test(file)) return false;
    const content = read(file);
    return /cloudflare|wrangler/i.test(content) && mutationCommand.test(content);
  });
}

function jobBlocks(workflow) {
  const lines = workflow.split('\n');
  const jobsAt = lines.findIndex(line => line === 'jobs:');
  if (jobsAt < 0) return [];
  const starts = [];
  for (let index = jobsAt + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) starts.push(index);
  }
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join('\n'));
}

function hasLiteralFalseJobGate(job) {
  const header = job.split(/^\s{4}steps:\s*$/m)[0];
  return /^\s{4}if:[^\n]*&& false\s*$/m.test(header)
    || /^\s{4}if:\s*>-[\s\S]*?^\s{6}false\s*$/m.test(header);
}

test('every repository Cloudflare mutation lane is globally hard-disabled', () => {
  assert.equal(contract.version, '1.2.0');
  assert.equal(contract.global_no_rerun.state, 'HOLD');
  assert.equal(contract.global_no_rerun.provider_calls_authorized, false);
  assert.equal(contract.global_no_rerun.owner_entered_phrase_is_authority, false);

  const contracted = new Map(contract.mutation_lanes.map(entry => [entry.workflow, entry.hard_disabled]));
  assert.deepEqual([...contracted.keys()].sort(), mutationLanes.map(lane => lane.path).sort());

  for (const lane of mutationLanes) {
    const workflow = read(lane.path);
    assert.match(workflow, lane.mutation, `${lane.path}: mutation command must remain inventoried`);
    assert.equal(contracted.get(lane.path), true, `${lane.path}: machine contract must declare hard-disabled`);
    const disabledJobConditions = workflow.match(/^\s{4}if:[^\n]*&& false\s*$/gm) || [];
    const multilineDisabledConditions = workflow.match(/^\s{4}if:\s*>-[\s\S]*?^\s{6}false\s*$/gm) || [];
    assert.equal(
      disabledJobConditions.length + multilineDisabledConditions.length,
      lane.disabledJobs,
      `${lane.path}: every job capable of reaching mutation must include a literal false gate`,
    );
  }
});

test('Worker and remote D1 mutation entrypoints are directly NO-RERUN guarded', () => {
  const direct = contract.direct_mutation_entrypoints;
  assert.ok(Array.isArray(direct));
  assert.deepEqual(direct.map(value => value.path).sort(), [
    'services/kidults-autonomous-intelligence/package.json',
    'services/kidults-autonomous-intelligence/scripts/a14-remote-capacity-canary.mjs',
    'services/kidults-autonomous-intelligence/scripts/a9-finalize.ps1',
    'services/kidults-autonomous-intelligence/scripts/remote-d1-preflight.mjs',
  ]);
  assert.ok(direct.every(value => value.hard_disabled === true));

  const pkg = JSON.parse(read('services/kidults-autonomous-intelligence/package.json'));
  for (const name of ['deploy','db:migrate:remote','remote:d1:preflight','a9:finalize','a14:canary']) {
    assert.equal(pkg.scripts[name], 'node scripts/cloudflare-global-no-rerun.mjs', name);
  }
  for (const file of direct.map(value => value.path).filter(value => !value.endsWith('package.json'))) {
    const source = read(file);
    const guard = source.indexOf('CLOUDFLARE_GLOBAL_NO_RERUN');
    const exit = source.search(/(?:process\.exit\(78\)|exit 78)/);
    const firstMutation = source.search(/(?:wrangler[^\n]*(?:deploy|d1)|npm run deploy)/i);
    assert.ok(guard >= 0 && exit > guard, `${file}: NO-RERUN guard missing`);
    assert.ok(firstMutation < 0 || exit < firstMutation, `${file}: provider command precedes NO-RERUN exit`);
  }
  const discovered = walk('services/kidults-autonomous-intelligence').filter(file => {
    if (/(?:^|\/)(?:test|tests|validate|audit)[^/]*\.(?:mjs|js|cjs)$/i.test(file)) return false;
    if (!/\.(?:mjs|js|cjs|ps1)$/.test(file)) return false;
    return /(?:wrangler[^\n]*(?:deploy|d1[^\n]*--remote)|npm run deploy)/i.test(read(file));
  }).sort();
  assert.deepEqual(discovered, direct.map(value => value.path).filter(value => !value.endsWith('package.json')).sort());
});

test('durable trust-root estate declaration stays inert and mutation-only', () => {
  const services = estatePolicy.control_plane_services || [];
  assert.equal(services.length, 1);
  const service = services[0];
  assert.deepEqual(service, {
    name: 'kidults-approval-trust-root',
    type: 'WORKER_DURABLE_OBJECT',
    repository_path: 'services/kidults-cloudflare-approval-trust-root',
    state: 'IMPLEMENTED_NOT_DEPLOYED',
    allowed_operation: 'ATOMIC_ACTIVE_TO_CONSUMED_ONLY',
    issue_reset_delete_endpoints: false,
    provider_credentials_bound: false,
    deployment_and_secret_configuration: 'EXPLICIT_EXTERNAL_CONFIGURATION_REQUIRED',
  });
  for (const [field, value] of [
    ['state','DEPLOYED'], ['allowed_operation','ISSUE_OR_RESET'],
    ['issue_reset_delete_endpoints',true], ['provider_credentials_bound',true],
  ]) {
    const mutated = {...service, [field]: value};
    assert.notDeepEqual(mutated, service, field);
    assert.ok(mutated.state !== 'IMPLEMENTED_NOT_DEPLOYED'
      || mutated.allowed_operation !== 'ATOMIC_ACTIVE_TO_CONSUMED_ONLY'
      || mutated.issue_reset_delete_endpoints !== false
      || mutated.provider_credentials_bound !== false, field);
  }
});

test('repository-wide discovery finds no uncontracted or enabled Cloudflare mutation job', () => {
  const mutators = mutatingScripts();
  assert.ok(mutators.length >= 3, 'expected known Cloudflare mutation scripts');
  const directMutation = /\bwrangler(?:@[^\s]+)?\s+pages\s+deploy\b|api\.cloudflare\.com[\s\S]{0,400}\b(?:POST|PUT|PATCH|DELETE)\b/i;
  const discovered = [];
  for (const name of fs.readdirSync(workflowDir).filter(value => /\.ya?ml$/.test(value))) {
    const workflowPath = path.join(workflowDir, name);
    for (const job of jobBlocks(read(workflowPath))) {
      const executesMutator = mutators.some(script => job.split('\n').some(line =>
        line.includes(script) && !/\bbash\s+-n\b|\b(?:node|npm)\b.*\btests?\b|\b(?:rg|grep)\b/.test(line),
      ));
      if (!executesMutator && !directMutation.test(job)) continue;
      discovered.push(workflowPath);
      assert.equal(hasLiteralFalseJobGate(job), true, `${workflowPath}: discovered mutation job must be literal-false gated`);
    }
  }
  const uniqueDiscovered = [...new Set(discovered)].sort();
  const contracted = contract.mutation_lanes.map(entry => entry.workflow).sort();
  assert.deepEqual(uniqueDiscovered, contracted, 'dynamic mutation inventory must exactly match the machine contract');
});

test('future consume steps and historical mutation replay remain non-authorizing', () => {
  const consume = read('.github/workflows/kpmo-cloudflare-approval-consume-v1.yml');
  assert.match(consume, /Validate historical approval is not reusable[\s\S]*?exit 78/);
  assert.equal((consume.match(/^\s{8}if: \$\{\{ false \}\}\s*$/gm) || []).length, 3);
  assert.equal(contract.external_blockers.durable_ledger_deployed, false);
  assert.equal(contract.external_blockers.historical_consumed_record_backfilled, false);
  assert.equal(contract.external_blockers.response_public_key_spki_sha256_pinned, false);
  assert.equal(contract.external_blockers.signed_exact_binding_state_readback_issued, false);
  assert.equal(contract.external_blockers.deployed_consumed_expired_replay_provider_call_zero_canaries_passed, false);
});

test('direct mutation script invocation is blocked before any provider call', () => {
  const temp = fs.mkdtempSync('/tmp/kidults-cf-no-rerun-');
  try {
    const fakeBin = path.join(temp, 'bin');
    const marker = path.join(temp, 'provider-called');
    fs.mkdirSync(fakeBin);
    for (const executable of ['curl', 'npx', 'wrangler']) {
      const target = path.join(fakeBin, executable);
      fs.writeFileSync(target, `#!/usr/bin/env bash\nprintf called > ${JSON.stringify(marker)}\nexit 99\n`, {mode: 0o700});
    }
    const env = {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      CLOUDFLARE_API_TOKEN: 'fixture-never-used',
      CLOUDFLARE_ACCOUNT_ID: 'fixture-never-used',
      SOURCE_SHA: 'a'.repeat(40),
      DEPLOY_REASON: 'negative canary',
      GITHUB_RUN_ID: '1',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REPOSITORY: 'johnkim9524-collab/kaios_enterprise_repo',
    };
    const cases = [
      ['scripts/ops/cloudflare-pages-cf-kidults-14501ac-01.sh'],
      ['scripts/ops/cloudflare-pages-governed-staging-deploy.sh'],
      ['scripts/ops/cloudflare-pages-preview-cleanup.sh', '--delete-preview'],
      ['scripts/ops/cloudflare-pages-auto-deployment-containment.sh', '--execute'],
    ];
    for (const args of cases) {
      fs.rmSync(marker, {force: true});
      const result = spawnSync('bash', args, {encoding: 'utf8', env});
      assert.equal(result.status, 78, `${args.join(' ')} must terminate at NO-RERUN`);
      assert.equal(fs.existsSync(marker), false, `${args.join(' ')} must call no provider executable`);
    }
    for (const script of [
      'services/kidults-autonomous-intelligence/scripts/remote-d1-preflight.mjs',
      'services/kidults-autonomous-intelligence/scripts/a14-remote-capacity-canary.mjs',
    ]) {
      fs.rmSync(marker, {force: true});
      const result = spawnSync(process.execPath, [script], {encoding:'utf8',env});
      assert.equal(result.status, 78, `${script} must terminate at NO-RERUN`);
      assert.equal(fs.existsSync(marker), false, `${script} must call no provider executable`);
    }
    fs.rmSync(marker, {force:true});
    const npmDeploy = spawnSync('npm', ['--prefix','services/kidults-autonomous-intelligence','run','deploy'], {encoding:'utf8',env});
    assert.equal(npmDeploy.status, 78, 'package deploy entrypoint must terminate at NO-RERUN');
    assert.equal(fs.existsSync(marker), false, 'package deploy entrypoint must call no provider executable');
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

console.log('PASS Cloudflare global NO-RERUN: all mutation entrypoints hard-disabled; future consume and historical replay remain non-authorizing');
