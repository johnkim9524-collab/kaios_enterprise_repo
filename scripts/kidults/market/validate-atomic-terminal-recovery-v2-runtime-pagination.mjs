#!/usr/bin/env node
import {makeGitHubClient} from './atomic-terminal-recovery-v2-runtime.mjs';

const originalFetch = globalThis.fetch;
let pageCalls = 0;
let runCalls = 0;

globalThis.fetch = async url => {
  const value = String(url);
  if (value.includes('/issues/1877/comments')) {
    pageCalls += 1;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {'content-type': 'application/json'},
    });
  }
  if (value.includes('/actions/workflows/348248201/runs')) {
    runCalls += 1;
    return new Response(JSON.stringify({workflow_runs: [{id: 7001}]}), {
      status: 200,
      headers: {'content-type': 'application/json'},
    });
  }
  throw new Error(`UNEXPECTED_MOCK_ROUTE:${value}`);
};

try {
  const client = makeGitHubClient({repository: 'owner/repo', token: 'test-token'});
  const comments = await client.pages('/issues/1877/comments');
  if (!Array.isArray(comments) || comments.length !== 0 || pageCalls !== 1) {
    throw new Error('ATOMIC_RECOVERY_RUNTIME_PAGINATION_REGRESSION_FAILED');
  }
  const runs = await client.loadWorkflowRuns(348248201, 7001);
  if (!Array.isArray(runs) || runs.length !== 1 || Number(runs[0]?.id) !== 7001 || runCalls !== 1) {
    throw new Error('ATOMIC_RECOVERY_RUNTIME_WORKFLOW_PAGINATION_REGRESSION_FAILED');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log(JSON.stringify({
  id: 'kidults-atomic-terminal-recovery-v2-runtime-pagination-validation',
  state: 'VERIFIED_PASS',
  bounded_pagination_symbol_executed: true,
  issue_pages_calls: pageCalls,
  workflow_run_pages_calls: runCalls,
  provider_calls: 0,
  status_write_performed: false,
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
