import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cloudflareRemoteMutationViolations,
  hasLiteralFalseJobGate,
  inspectWorkflowCloudflareMutations,
} from '../../../scripts/kidults/kpmo/lib/governed-landing-cloudflare-remote-mutation-boundary-v1.mjs';

function workflow(run, jobIf = '') {
  return `name: Candidate workflow
on:
  workflow_dispatch:
jobs:
  candidate:
    name: Candidate
    runs-on: ubuntu-latest
${jobIf ? `    if: ${jobIf}\n` : ''}    steps:
      - name: Candidate command
        run: |
${run.split('\n').map(line => `          ${line}`).join('\n')}
`;
}

test('new arbitrary workflow cannot bypass the trusted-base Cloudflare mutation guard', () => {
  const candidate = workflow('npx wrangler deploy');
  assert.deepEqual(cloudflareRemoteMutationViolations(candidate), [
    'cloudflare-remote-mutation-without-literal-false-job-gate:candidate:wrangler-deploy',
  ]);
  assert.deepEqual(inspectWorkflowCloudflareMutations(candidate), [{
    job_id: 'candidate',
    start_line: 5,
    literal_false_job_gate: false,
    mutation_kinds: ['wrangler-deploy'],
  }]);
  const trustedValidator = fs.readFileSync('scripts/kidults/kpmo/validate-workflow-repository-mutation-boundary-v1.mjs', 'utf8');
  assert.ok(trustedValidator.includes('violations.push(...cloudflareRemoteMutationViolations(workflow));'));
});

test('only an explicit literal false job gate disables a mutating Cloudflare job', () => {
  for (const expression of [
    'false',
    '${{ false }}',
    "github.event_name == 'workflow_dispatch' && false",
    "${{ false && github.ref == 'refs/heads/main' }}",
  ]) {
    const candidate = workflow('wrangler pages deploy ./dist', expression);
    assert.equal(hasLiteralFalseJobGate(inspectJob(candidate)), true, expression);
    assert.deepEqual(cloudflareRemoteMutationViolations(candidate), [], expression);
  }

  for (const expression of [
    "vars.CLOUDFLARE_NO_RERUN == 'false'",
    "github.event_name == 'workflow_dispatch' || false",
    "github.event_name == 'workflow_dispatch' && false || true",
    'false == false && github.event_name == \'workflow_dispatch\'',
    '!false && github.event_name == \'workflow_dispatch\'',
    '${{ !true }}',
  ]) {
    assert.notDeepEqual(cloudflareRemoteMutationViolations(workflow('wrangler deploy', expression)), [], expression);
  }

  const stepOnly = workflow("if false; then wrangler deploy; fi");
  assert.notDeepEqual(cloudflareRemoteMutationViolations(stepOnly), [], 'a shell branch is not a containing-job gate');
});

test('Wrangler deploy variants and shell nesting fail closed while dry-run remains read-only', () => {
  for (const command of [
    'wrangler deploy',
    'npx --yes wrangler pages deploy ./dist',
    'pnpm exec wrangler versions deploy',
    'wrangler --config wrangler.toml deploy',
    'bash -c "npx wrangler deploy"',
  ]) assert.notDeepEqual(cloudflareRemoteMutationViolations(workflow(command)), [], command);

  for (const command of [
    'npx wrangler deploy --dry-run',
    'wrangler pages deploy ./dist --dry-run',
    'wrangler deploy --dry-run=true',
    'echo "wrangler deploy is disabled"',
  ]) assert.deepEqual(cloudflareRemoteMutationViolations(workflow(command)), [], command);
  assert.notDeepEqual(cloudflareRemoteMutationViolations(workflow('wrangler deploy --dry-run=false')), []);
});

test('remote D1 mutation commands fail closed but provably read-only commands remain allowed', () => {
  for (const command of [
    'npx wrangler d1 execute DB --remote --file ./migration.sql',
    "wrangler d1 execute DB --remote --command 'DELETE FROM receipts'",
    'wrangler d1 migrations apply DB --remote',
    'wrangler d1 time-travel restore DB --remote --timestamp 2026-08-29T00:00:00Z',
  ]) assert.notDeepEqual(cloudflareRemoteMutationViolations(workflow(command)), [], command);

  for (const command of [
    "wrangler d1 execute DB --remote --command 'SELECT COUNT(*) FROM receipts'",
    "wrangler d1 execute DB --remote --command 'PRAGMA table_info(receipts)'",
    'wrangler d1 info DB --remote',
    'wrangler d1 list --remote',
    "wrangler d1 execute DB --local --command 'DELETE FROM local_fixture'",
  ]) assert.deepEqual(cloudflareRemoteMutationViolations(workflow(command)), [], command);
});

test('Cloudflare REST mutation methods and dynamic methods require the literal false job gate', () => {
  for (const script of [
    'curl --request DELETE https://api.cloudflare.com/client/v4/accounts/123/pages/projects/p',
    'curl https://api.cloudflare.com/client/v4/accounts/123/d1/database/query --data "{\\"sql\\":\\"DELETE FROM t\\"}"',
    'METHOD=PATCH\ncurl -X "$METHOD" "$CLOUDFLARE_API_BASE/accounts/123/pages/projects/p"',
    "await fetch('https://api.cloudflare.com/client/v4/accounts/123/pages/projects/p', {\n  method: 'POST'\n});",
    "requests.delete('https://api.cloudflare.com/client/v4/accounts/123/pages/projects/p')",
  ]) assert.notDeepEqual(cloudflareRemoteMutationViolations(workflow(script)), [], script);

  for (const script of [
    'curl --request GET https://api.cloudflare.com/client/v4/accounts/123/pages/projects',
    "await fetch('https://api.cloudflare.com/client/v4/accounts/123/pages/projects', {method: 'HEAD'});",
    'echo "curl -X DELETE https://api.cloudflare.com/client/v4/example"',
  ]) assert.deepEqual(cloudflareRemoteMutationViolations(workflow(script)), [], script);
});

test('cloudflare/wrangler-action deploy command is guarded at the containing job', () => {
  const candidate = `name: Action candidate
on:
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: cloudflare/wrangler-action@v3
        with:
          command: deploy
`;
  assert.notDeepEqual(cloudflareRemoteMutationViolations(candidate), []);
  assert.deepEqual(cloudflareRemoteMutationViolations(candidate.replace('    runs-on:', '    if: false\n    runs-on:')), []);
  assert.notDeepEqual(cloudflareRemoteMutationViolations(candidate.replace('          command: deploy', '          command: |\n            pages deploy ./dist')), []);
});

function inspectJob(candidate) {
  const lines = candidate.split('\n');
  const start = lines.findIndex(line => line === '  candidate:');
  return lines.slice(start).join('\n');
}
