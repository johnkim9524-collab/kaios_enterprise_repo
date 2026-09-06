#!/usr/bin/env node
import fs from 'node:fs';

const target = process.argv[2] || '.github/workflows/kidults-asi-throughput-coverage-autobalance-live-v1.yml';

function validate(text) {
  const failures = [];
  const requireText = (needle, label) => {
    if (!text.includes(needle)) failures.push(`missing ${label}`);
  };
  const rejectText = (needle, label) => {
    if (text.includes(needle)) failures.push(`forbidden ${label}`);
  };
  const requirePattern = (pattern, label) => {
    if (!pattern.test(text)) failures.push(`missing ${label}`);
  };
  const rejectPattern = (pattern, label) => {
    if (pattern.test(text)) failures.push(`forbidden ${label}`);
  };

  rejectText('/actions/artifacts?per_page=100', 'repository-global artifact lookup');
  rejectText('-f status=success', 'success-only producer search');
  rejectText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml/runs', 'retired v1 producer workflow lookup');
  rejectText('/actions/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml/runs', 'search-based hourly producer selection');
  rejectText('AUTOBALANCE_PRODUCER_WAIT_MAX_ATTEMPTS', 'bounded producer polling');
  rejectText('AUTOBALANCE_PRODUCER_WAIT_SECONDS', 'bounded producer polling interval');
  rejectPattern(/\n  schedule:\s*\n/, 'independent consumer schedule');
  rejectPattern(/\n  workflow_dispatch:\s*\n/, 'independent consumer workflow_dispatch');
  rejectPattern(/on:\s*\n  workflow_run:\s*\n    workflows:\s*\n      - KIDULTS ASI Global Any-Site Hourly Pooling v2/, 'third direct Hourly v2 workflow_run consumer');

  requirePattern(/on:\s*\n  workflow_run:\s*\n    workflows:\s*\n      - KIDULTS ASI Sharded Source Reserve v1\s*\n    types: \[completed\]\s*\n    branches: \[main\]/, 'reserve relay workflow_run trigger');
  requireText("github.event.workflow_run.event == 'workflow_run'", 'reserve relay canonical upstream-event gate');
  requireText("github.event.workflow_run.conclusion == 'success'", 'reserve relay terminal-success gate');
  requireText('github.event.workflow_run.id', 'relay run id binding');
  requireText('github.event.workflow_run.run_attempt', 'relay run attempt binding');
  requireText('github.event.workflow_run.head_sha', 'relay source SHA binding');
  requireText('/actions/runs/${RELAY_RUN_ID}', 'exact relay run lookup');
  requireText('/actions/runs/${RELAY_RUN_ID}/artifacts?per_page=100', 'relay run-scoped artifact lookup');
  requireText('.name=="KIDULTS ASI Sharded Source Reserve v1"', 'relay workflow name binding');
  requireText('.path==".github/workflows/kidults-asi-sharded-source-reserve-v1.yml"', 'relay workflow path binding');
  requireText('.event=="workflow_run"', 'relay event binding');
  requireText('.run_attempt==$attempt', 'relay run-attempt binding');
  requireText('.name=="kidults-asi-sharded-source-reserve-v1"', 'relay artifact selection');
  requireText('if length==1 then .[0] else empty end', 'exact relay artifact cardinality');
  requireText('asi-sharded-source-reserve-activation-receipt-v1.json', 'reserve activation receipt binding');
  requireText('.state=="VERIFIED_PASS"', 'reserve receipt verified state');
  requireText('.trigger_event=="workflow_run"', 'reserve receipt upstream event');
  requireText('.exact_generation_bound==true', 'reserve exact-generation binding');
  requireText('.discovery_producer_run_id', 'hourly ancestor run-id from relay receipt');
  requireText('.discovery_producer_head_sha', 'hourly ancestor SHA from relay receipt');
  requireText('.discovery_artifact_id', 'hourly discovery artifact id from relay receipt');
  requireText('test "$DISC_ID" = "$RECEIPT_DISCOVERY_ARTIFACT_ID"', 'relay-to-hourly discovery artifact identity');

  requireText('/actions/runs/${HOURLY_RUN_ID}', 'exact hourly ancestor lookup');
  requireText('/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100', 'hourly run-scoped artifact lookup');
  requireText('.name=="KIDULTS ASI Global Any-Site Hourly Pooling v2"', 'hourly producer name binding');
  requireText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"', 'hourly producer path binding');
  requireText('.event=="schedule"', 'hourly canonical schedule binding');
  requireText('.path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"\\n            and .head_branch=="main"\\n            and .head_sha==$sha\\n            and .event=="schedule"', 'exact hourly producer identity and SHA binding');
  requireText('.status=="completed"', 'producer terminal status binding');
  requireText('.conclusion=="success"', 'producer terminal success binding');
  requireText('/branches/main', 'live current-main read-back');
  requireText('CURRENT_MAIN_ADVANCED_BEFORE_AUTOBALANCE', 'stale-main fail-closed diagnosis');

  for (const artifactName of ['kidults-asi-global-any-site-source-pool-v2','kidults-asi-global-any-site-hourly-cycle-v2']) {
    requireText(`.name=="${artifactName}"`, `${artifactName} selection`);
  }
  const exactCardinalityMatches = text.match(/if length==1 then \.\[0\] else empty end/g) || [];
  if (exactCardinalityMatches.length < 3) failures.push('missing exact cardinality for relay and both hourly artifacts');

  requireText('^sha256:[0-9a-f]{64}$', 'artifact digest validation');
  requireText('sha256sum /tmp/relay.zip', 'relay archive digest verification');
  requireText('sha256sum /tmp/meta.zip', 'metadata archive digest verification');
  requireText('sha256sum /tmp/disc.zip', 'discovery archive digest verification');
  requireText('UNSAFE_RELAY_ZIP_MEMBER', 'unsafe relay archive rejection');
  requireText('UNSAFE_PRODUCER_ZIP_MEMBER', 'unsafe producer archive rejection');
  requireText('test "${#RELAY_RECEIPTS[@]}" -eq 1', 'relay receipt member cardinality');
  requireText('test "${#MATCHES[@]}" -eq 1', 'canonical gate member cardinality');
  requireText('test "${#DISC_MATCHES[@]}" -eq 1', 'discovery member cardinality');

  requireText("status: 'VERIFIED_EXACT_RELAYED_PRODUCER_BINDING'", 'relayed producer provenance receipt status');
  requireText("binding_mode: process.env.AUTOBALANCE_BINDING_MODE", 'binding mode receipt');
  requireText("workflow_name: 'KIDULTS ASI Sharded Source Reserve v1'", 'relay receipt identity');
  requireText("workflow_name: 'KIDULTS ASI Global Any-Site Hourly Pooling v2'", 'producer receipt identity');
  requireText('run_attempt: Number(process.env.AUTOBALANCE_RELAY_RUN_ATTEMPT)', 'relay run-attempt receipt binding');
  requireText('run_attempt: Number(process.env.AUTOBALANCE_HOURLY_RUN_ATTEMPT)', 'hourly run-attempt receipt binding');
  requireText('relay_chain_exact: true', 'relay chain exactness');
  requireText('mixed_generation_allowed: false', 'mixed-generation prohibition');
  requireText('empirical_authority: false', 'empirical authority prohibition');
  requireText('provider_authority: false', 'provider authority prohibition');
  requireText('/tmp/asi-throughput-autobalance-provenance-v1.json', 'provenance receipt artifact');
  requireText('kidults-asi-throughput-autobalance-trigger-envelope-v1', 'terminal relay envelope');
  requireText("public_release: 'HOLD'", 'public HOLD');
  requireText("production: 'HOLD'", 'production HOLD');
  requireText("g5: 'HOLD'", 'G5 HOLD');

  const liveBoundaryMatches = text.match(/if: github\.event_name == 'workflow_run'/g) || [];
  if (liveBoundaryMatches.length < 5) failures.push('missing PR structural/live execution separation');

  return failures;
}

const text = fs.readFileSync(target, 'utf8');
const failures = validate(text);
if (failures.length) {
  console.error('ASI throughput autobalance provenance: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mutations = [
  ['      - KIDULTS ASI Sharded Source Reserve v1','      - KIDULTS ASI Global Any-Site Hourly Pooling v2'],
  ['.exact_generation_bound==true','.exact_generation_bound!=false'],
  ['test "$DISC_ID" = "$RECEIPT_DISCOVERY_ARTIFACT_ID"','test "$DISC_ID" != "$RECEIPT_DISCOVERY_ARTIFACT_ID"'],
  ['if length==1 then .[0] else empty end','.[0] // empty'],
  ['.run_attempt==$attempt','.run_attempt>0'],
  ['.head_sha==$sha\n            and .event=="schedule"','.head_sha=="0000000000000000000000000000000000000000"\n            and .event=="schedule"'],
  ['.event=="schedule"','.event!="pull_request"'],
  ['CURRENT_MAIN_ADVANCED_BEFORE_AUTOBALANCE','CURRENT_MAIN_CHANGED'],
  ['relay_chain_exact: true','relay_chain_exact: false'],
  ['mixed_generation_allowed: false','mixed_generation_allowed: true'],
  ['empirical_authority: false','empirical_authority: true'],
  ['provider_authority: false','provider_authority: true'],
  ["status: 'VERIFIED_EXACT_RELAYED_PRODUCER_BINDING'","status: 'VERIFIED_EXACT_PRODUCER_BINDING'"]
];

for (const [from, to] of mutations) {
  if (!text.includes(from)) {
    console.error(`ASI throughput autobalance provenance self-test fixture missing: ${from}`);
    process.exit(1);
  }
  const mutated = text.replace(from, to);
  if (validate(mutated).length === 0) {
    console.error(`ASI throughput autobalance provenance self-test failed to reject mutation: ${from} -> ${to}`);
    process.exit(1);
  }
}

const scheduleMutation = text.replace('on:\n  workflow_run:', "on:\n  schedule:\n    - cron: '47 * * * *'\n  workflow_run:");
if (validate(scheduleMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject independent schedule reintroduction');
  process.exit(1);
}

const dispatchMutation = text.replace('on:\n  workflow_run:', 'on:\n  workflow_dispatch:\n  workflow_run:');
if (validate(dispatchMutation).length === 0) {
  console.error('ASI throughput autobalance provenance self-test failed to reject independent workflow_dispatch reintroduction');
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'VERIFIED_PASS',
  control: 'ASI_THROUGHPUT_AUTOBALANCE_EXACT_RELAYED_PRODUCER_PROVENANCE',
  mutation_cases_rejected: mutations.length + 2,
  pr_validation_mode: 'STRUCTURAL_AND_NEGATIVE_ONLY',
  live_consumption_mode: 'TERMINAL_RESERVE_RELAY_TO_SCHEDULED_HOURLY_PRODUCER',
  producer_selection: 'RELAY_RUN_ID_ATTEMPT_SHA_PLUS_RECEIPT_BOUND_HOURLY_RUN_AND_ARTIFACT',
  direct_hourly_workflow_run_edge: 'REMOVED',
  stale_main: 'FAIL_CLOSED',
  independent_consumer_schedule: 'REMOVED',
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD'
}, null, 2));
