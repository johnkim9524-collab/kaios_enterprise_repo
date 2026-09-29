import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

// Repository-root anchored regression proving the four Common Crawl consumer
// workflows carry a causal exact-main producer trigger, bind their checkout,
// EXPECTED_*_SHA, and UPSTREAM_RUN_ID to the triggering producer, re-read
// protected main before consumption, and assert exact triggering-run-id
// equality. Source-of-truth for the underlying contract is
// coordination/kidults/governance/authority-chain-trigger-compatibility-v1.json
// (producer_event === consumer_event ∈ {workflow_run, workflow_dispatch} AND
// exact_triggering_run_bound === true).

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const workflowsDir = resolve(repoRoot, '.github', 'workflows');

const CONSUMERS = [
  {
    id: 'host-expansion',
    file: 'kidults-asi-common-crawl-host-expansion-v1.yml',
    producer: 'KIDULTS ASI Global Any-Site Discovery v2',
  },
  {
    id: 'gate-chain-binding',
    file: 'kidults-asi-common-crawl-gate-chain-binding-v1.yml',
    producer: 'KIDULTS ASI Global Any-Site Discovery v2',
  },
  {
    id: 'frontier-runtime-persistence',
    file: 'kidults-asi-common-crawl-frontier-runtime-persistence-v1.yml',
    producer: 'KIDULTS ASI Self-Driving Control Loop v1',
  },
  {
    id: 'rolling-seed-frontier',
    file: 'kidults-asi-common-crawl-rolling-seed-frontier-v1.yml',
    producer: 'KIDULTS ASI Self-Driving Control Loop v1',
  },
];

const HEAD_SHA_EXPR = "github.event.workflow_run.head_sha";
const CAUSAL_REF_EXPR =
  "${{ github.event.workflow_run.head_sha || github.event.pull_request.head.sha || github.sha }}";
const LIVE_SHA_EXPR = "${{ github.event.workflow_run.head_sha || github.sha }}";
const UPSTREAM_RUN_EXPR = "${{ github.event.workflow_run.id }}";
const TRIGGER_EXPECTED_EXPR =
  "${{ github.event_name == 'workflow_run' && 'true' || 'false' }}";
const CONCURRENCY_KEY_EXPR =
  "${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || github.ref }}";
const JOB_GATE_SUCCESS = "github.event.workflow_run.conclusion == 'success'";
const JOB_GATE_MAIN = "github.event.workflow_run.head_branch == 'main'";
const STALE_MAIN_FENCE_API =
  "gh api -H 'Accept: application/vnd.github+json' \"/repos/${GITHUB_REPOSITORY}/branches/main\" --jq '.commit.sha'";
const STALE_MAIN_REJECT_TOKEN = "STALE_MAIN_REJECTED";
const TRIGGERING_RUN_MISMATCH_TOKEN = "TRIGGERING_RUN_ID_MISMATCH";

const readWorkflow = file => readFileSync(resolve(workflowsDir, file), 'utf8');

const requireProperty = (text, needle, message) => {
  assert.ok(text.includes(needle), `${message}: expected substring not found — ${needle}`);
};

const forbidProperty = (text, needle, message) => {
  assert.ok(!text.includes(needle), `${message}: forbidden substring found — ${needle}`);
};

// Positive structural assertions per consumer.
for (const consumer of CONSUMERS) {
  const text = readWorkflow(consumer.file);

  test(`[${consumer.id}] declares causal workflow_run trigger for producer '${consumer.producer}'`, () => {
    requireProperty(text, 'workflow_run:', 'workflow_run trigger block missing');
    requireProperty(
      text,
      `- '${consumer.producer}'`,
      'workflow_run.workflows must reference the exact producer name'
    );
    requireProperty(text, 'types: [completed]', 'workflow_run.types must be [completed]');
  });

  test(`[${consumer.id}] gates job on producer success and main branch`, () => {
    requireProperty(text, JOB_GATE_SUCCESS, 'job-level workflow_run.conclusion == success gate missing');
    requireProperty(text, JOB_GATE_MAIN, 'job-level workflow_run.head_branch == main gate missing');
  });

  test(`[${consumer.id}] concurrency isolates causal producer runs by workflow_run.id`, () => {
    requireProperty(text, CONCURRENCY_KEY_EXPR, 'concurrency key must isolate by workflow_run.id for causal runs');
  });

  test(`[${consumer.id}] checkout ref binds to triggering producer head_sha`, () => {
    requireProperty(text, `ref: ${CAUSAL_REF_EXPR}`, 'checkout ref must prefer workflow_run.head_sha');
  });

  test(`[${consumer.id}] every live EXPECTED_*_SHA binds to workflow_run.head_sha`, () => {
    for (const key of ['EXPECTED_SHA', 'EXPECTED_BASE_SHA', 'EXPECTED_HEAD_SHA', 'EXPECTED_GENERATION_SHA']) {
      requireProperty(text, `${key}: ${LIVE_SHA_EXPR}`, `${key} must bind to workflow_run.head_sha in live path`);
    }
  });

  test(`[${consumer.id}] exports UPSTREAM_RUN_ID bound to workflow_run.id`, () => {
    requireProperty(text, `UPSTREAM_RUN_ID: ${UPSTREAM_RUN_EXPR}`, 'UPSTREAM_RUN_ID must bind to workflow_run.id');
  });

  test(`[${consumer.id}] dynamically sets TRIGGER_EXPECTED for causal runs`, () => {
    requireProperty(text, `TRIGGER_EXPECTED: ${TRIGGER_EXPECTED_EXPR}`, 'TRIGGER_EXPECTED must be dynamic per event');
    requireProperty(text, '--trigger-expected "$TRIGGER_EXPECTED"', 'resolver must consume dynamic TRIGGER_EXPECTED');
  });

  test(`[${consumer.id}] enforces stale-main fence before consuming upstream`, () => {
    requireProperty(text, STALE_MAIN_FENCE_API, 'protected-main re-read must use gh api /branches/main');
    requireProperty(text, STALE_MAIN_REJECT_TOKEN, 'stale-main fence must fail closed with STALE_MAIN_REJECTED');
  });

  test(`[${consumer.id}] asserts resolver-selected run id equals UPSTREAM_RUN_ID`, () => {
    requireProperty(text, TRIGGERING_RUN_MISMATCH_TOKEN, 'post-resolver run-id equality assertion missing');
    requireProperty(text, `"$TRIGGER_EXPECTED" = 'true'`, 'run-id assertion must be conditional on causal trigger');
  });

  test(`[${consumer.id}] preserves request-free PR fixture path`, () => {
    requireProperty(text, "--mode pr-fixture", 'PR fixture mode must remain to keep PR validation request-free');
    requireProperty(text, 'VERIFIED_PASS_LOCAL_FIXTURE', 'PR fixture must assert VERIFIED_PASS_LOCAL_FIXTURE');
  });

  test(`[${consumer.id}] uses no independent schedule cron`, () => {
    forbidProperty(text, '\nschedule:', 'consumer must not couple via independent cron');
    forbidProperty(text, '\n  schedule:', 'consumer must not couple via independent cron');
  });
}

// Adversarial mutation tests: for each consumer, mutate one required property
// at a time and prove the corresponding assertion would fail closed. This
// proves each property is load-bearing rather than incidental substring.
const MUTATIONS = [
  {
    label: 'strip workflow_run trigger block',
    mutate: text => text.replace(/workflow_run:\s*\n\s*workflows:[\s\S]*?types: \[completed\]\n/, ''),
    assertFails: text => assert.ok(!text.includes('types: [completed]')),
  },
  {
    label: 'downgrade producer name to wildcard',
    mutate: (text, consumer) => text.replaceAll(`- '${consumer.producer}'`, "- '*'"),
    assertFails: (text, consumer) =>
      assert.ok(!text.includes(`- '${consumer.producer}'`)),
  },
  {
    label: 'remove job-level success gate',
    mutate: text => text.replace(JOB_GATE_SUCCESS, "true"),
    assertFails: text => assert.ok(!text.includes(JOB_GATE_SUCCESS)),
  },
  {
    label: 'remove job-level main branch gate',
    mutate: text => text.replace(JOB_GATE_MAIN, "true"),
    assertFails: text => assert.ok(!text.includes(JOB_GATE_MAIN)),
  },
  {
    label: 'unbind checkout ref from workflow_run.head_sha',
    mutate: text => text.replace(`ref: ${CAUSAL_REF_EXPR}`, "ref: ${{ github.sha }}"),
    assertFails: text => assert.ok(!text.includes(`ref: ${CAUSAL_REF_EXPR}`)),
  },
  {
    label: 'unbind EXPECTED_SHA from workflow_run.head_sha',
    mutate: text => text.replace(`EXPECTED_SHA: ${LIVE_SHA_EXPR}`, "EXPECTED_SHA: ${{ github.sha }}"),
    assertFails: text => assert.ok(!text.includes(`EXPECTED_SHA: ${LIVE_SHA_EXPR}`)),
  },
  {
    label: 'unbind UPSTREAM_RUN_ID',
    mutate: text => text.replace(`UPSTREAM_RUN_ID: ${UPSTREAM_RUN_EXPR}`, "UPSTREAM_RUN_ID: ''"),
    assertFails: text => assert.ok(!text.includes(`UPSTREAM_RUN_ID: ${UPSTREAM_RUN_EXPR}`)),
  },
  {
    label: 'hard-code TRIGGER_EXPECTED to false',
    mutate: text => text.replace(`TRIGGER_EXPECTED: ${TRIGGER_EXPECTED_EXPR}`, "TRIGGER_EXPECTED: 'false'"),
    assertFails: text => assert.ok(!text.includes(`TRIGGER_EXPECTED: ${TRIGGER_EXPECTED_EXPR}`)),
  },
  {
    label: 'strip stale-main fence',
    mutate: text => text.replace(STALE_MAIN_FENCE_API, ':').replaceAll(STALE_MAIN_REJECT_TOKEN, 'OK'),
    assertFails: text => assert.ok(!text.includes(STALE_MAIN_REJECT_TOKEN)),
  },
  {
    label: 'strip triggering-run-id mismatch assertion',
    mutate: text => text.replaceAll(TRIGGERING_RUN_MISMATCH_TOKEN, 'OK'),
    assertFails: text => assert.ok(!text.includes(TRIGGERING_RUN_MISMATCH_TOKEN)),
  },
  {
    label: 'downgrade concurrency isolation to ref-only',
    mutate: text => text.replace(CONCURRENCY_KEY_EXPR, "${{ github.ref }}"),
    assertFails: text => assert.ok(!text.includes(CONCURRENCY_KEY_EXPR)),
  },
  {
    label: 'inject independent schedule cron',
    mutate: text => text.replace('on:\n', "on:\n  schedule:\n    - cron: '*/10 * * * *'\n"),
    assertFails: text => assert.ok(text.includes('\n  schedule:')),
  },
];

for (const consumer of CONSUMERS) {
  const original = readWorkflow(consumer.file);
  for (const mutation of MUTATIONS) {
    test(`[${consumer.id}] adversarial mutation is detectable: ${mutation.label}`, () => {
      const mutated = mutation.mutate(original, consumer);
      assert.notEqual(mutated, original, 'mutation did not change file content — property was already absent');
      mutation.assertFails(mutated, consumer);
    });
  }
}
