#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contractPath = 'coordination/kidults/kpmo/asi-workflow-fanout-budget-v1.json';
const assurancePath = '.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const canonicalIdentityPath = 'coordination/kidults/kpmo/continuous-assurance-canonical-identity-v1.json';
const contract = JSON.parse(fs.readFileSync(path.join(root, contractPath), 'utf8'));
const canonicalIdentity = JSON.parse(fs.readFileSync(path.join(root, canonicalIdentityPath), 'utf8'));

function fail(message) {
  throw new Error(message);
}

function parseWorkflow(filePath, overrideText) {
  const text = overrideText ?? fs.readFileSync(path.join(root, filePath), 'utf8');
  const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (!name) fail(`${filePath}: workflow name missing`);
  const workflowRun = text.match(/\n  workflow_run:\n([\s\S]*?)(?=\n  [A-Za-z_]+:|\npermissions:)/)?.[1] || '';
  const workflowsBlock = workflowRun.match(/    workflows:\n([\s\S]*?)(?=\n    [A-Za-z_]+:|$)/)?.[1] || '';
  const producers = [...workflowsBlock.matchAll(/^      - ['"]?(.+?)['"]?\s*$/gm)].map((match) => match[1]);
  return { filePath, name, text, workflowRun, producers };
}

function readGraph(overrides = new Map()) {
  const files = fs.readdirSync(path.join(root, '.github/workflows'))
    .filter((file) => file.endsWith('.yml'))
    .map((file) => `.github/workflows/${file}`);
  const workflows = files.map((file) => parseWorkflow(file, overrides.get(file)));
  const byName = new Map(workflows.map((workflow) => [workflow.name, workflow]));
  const edges = [];
  for (const consumer of workflows) {
    for (const producer of consumer.producers) {
      if (!byName.has(producer)) fail(`${consumer.filePath}: unknown workflow_run producer: ${producer}`);
      edges.push({ producer, consumer: consumer.name });
    }
  }
  return { workflows, byName, edges };
}

function graphMetrics(graph, controlObserverEdges) {
  const observerEdgeKeys = new Set(controlObserverEdges.map(({ producer, consumer }) => `${producer}\u0000${consumer}`));
  const executionEdges = graph.edges.filter(({ producer, consumer }) => !observerEdgeKeys.has(`${producer}\u0000${consumer}`));
  const adjacency = new Map();
  for (const { producer, consumer } of executionEdges) {
    if (!adjacency.has(producer)) adjacency.set(producer, []);
    adjacency.get(producer).push(consumer);
  }
  const visiting = new Set();
  const visited = new Set();
  let cycles = 0;
  function visit(node) {
    if (visiting.has(node)) {
      cycles += 1;
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of adjacency.get(node) || []) visit(next);
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.byName.keys()) visit(node);

  const depthMemo = new Map();
  function depth(node, active = new Set()) {
    if (depthMemo.has(node)) return depthMemo.get(node);
    if (active.has(node)) return Number.POSITIVE_INFINITY;
    const nextActive = new Set(active).add(node);
    const children = adjacency.get(node) || [];
    const value = children.length ? 1 + Math.max(...children.map((child) => depth(child, nextActive))) : 0;
    depthMemo.set(node, value);
    return value;
  }

  const directCounts = [...adjacency.entries()].map(([producer, consumers]) => ({ producer, count: consumers.length, consumers }));
  const directMax = directCounts.length ? Math.max(...directCounts.map((item) => item.count)) : 0;
  return {
    workflow_run_consumers: graph.workflows.filter((workflow) => workflow.producers.length > 0).length,
    workflow_run_edges_total: graph.edges.length,
    execution_workflow_run_edges: executionEdges.length,
    control_observer_edges: controlObserverEdges.length,
    direct_consumers_per_producer_max: directMax,
    direct_consumer_max_producers: directCounts.filter((item) => item.count === directMax),
    direct_consumer_counts_over_one: directCounts.filter((item) => item.count > 1),
    workflow_run_chain_depth: Math.max(...[...graph.byName.keys()].map((name) => depth(name))),
    cycles,
  };
}

function validate(overrides = new Map()) {
  const findings = [];
  const graph = readGraph(overrides);
  const budgets = contract.budgets;
  const observerContract = contract.control_observer;
  const observer = graph.byName.get(observerContract.consumer);
  const expectedObserverProducers = new Set(observerContract.producers);
  const controlObserverEdges = graph.edges.filter(({ producer, consumer }) =>
    consumer === observerContract.consumer && expectedObserverProducers.has(producer));

  if (!observer) {
    findings.push(`control observer missing: ${observerContract.consumer}`);
  } else {
    if (observer.filePath !== observerContract.path) findings.push('control observer path mismatch');
    const actualProducers = new Set(observer.producers);
    for (const producer of expectedObserverProducers) {
      if (!actualProducers.has(producer)) findings.push(`control observer watch missing: ${producer}`);
    }
    for (const producer of actualProducers) {
      if (!expectedObserverProducers.has(producer)) findings.push(`unapproved control observer edge: ${producer}`);
    }
    const permissionsBlock = observer.text.match(/\npermissions:\n([\s\S]*?)(?=\njobs:)/)?.[1] || '';
    for (const [permission, level] of Object.entries(observerContract.required_permissions)) {
      if (!new RegExp(`^  ${permission}: ${level}$`, 'm').test(permissionsBlock)) {
        findings.push(`control observer permission mismatch: ${permission}:${level}`);
      }
    }
    if (/^  [A-Za-z-]+: write$/m.test(permissionsBlock)) findings.push('control observer repository mutation permission detected');
    if (observer.producers.length > 0 && graph.edges.some(({ producer }) => producer === observerContract.consumer)) {
      findings.push('control observer must be terminal');
    }
    const guard = observerContract.canonical_success_guard;
    if (guard?.identity_contract !== canonicalIdentityPath || guard?.durable_runtime_state !== 'REMOTE_LEDGER_ACTIVATION_HOLD' ||
        guard?.canonical_execution_claimed !== false || guard?.special_manual_direct_rerun_and_non_success_bypass !== true ||
        guard?.job_level_serialization !== true || guard?.cancel_in_progress !== false ||
        guard?.fixed_leader_artifact_retention_days !== 90 || guard?.github_pending_capacity !== 1 ||
        guard?.verified_coverage_alias_observer_no_full_audit !== true ||
        guard?.verified_coverage_alias_requires_single_active_leader !== true ||
        guard?.verified_coverage_alias_splits_audit_and_canonical_source_sha !== true ||
        guard?.verified_coverage_alias_exact_current_and_canonical_run_metadata !== true ||
        guard?.verified_coverage_alias_semantic_receipt_exact_file_and_material_readback !== true ||
        guard?.coverage_alias_tamper_or_incomplete_readback !== 'FAIL_CLOSED' ||
        guard?.additional_pending_runs_may_be_replaced !== true || guard?.every_alias_receipt_guaranteed !== false) {
      findings.push('control observer canonical success guard drift');
    }
    if (JSON.stringify([...(guard?.grouped_classes || [])].sort()) !== JSON.stringify([...canonicalIdentity.ephemeral_actions_alias_eligible_classes].sort())) {
      findings.push('control observer grouped class allowlist drift');
    }
    if (JSON.stringify([...(guard?.special_exact_artifact_classes || [])].sort()) !== JSON.stringify([...canonicalIdentity.special_exact_artifact_classes].sort())) {
      findings.push('control observer special exact-artifact class drift');
    }
    for (const marker of [
      'needs.classify-canonical-identity.outputs.concurrency_group',
      'cancel-in-progress: false',
      'resolve-continuous-assurance-ephemeral-guard-v1.mjs',
      '-f name="$CANONICAL_ARTIFACT_NAME"',
      'Publish successful bounded canonical leader artifact',
      "if: success() && env.KPMO_EXECUTE_FULL_AUDIT == 'true' && env.KPMO_EPHEMERAL_ACTIONS_LEADER == 'true'",
      'observe-continuous-assurance-coverage-alias-v1.mjs',
      'COVERAGE_CANONICAL_ARTIFACT_ACTIVE_CARDINALITY',
      'COVERAGE_SEMANTIC_RECEIPT_DIGEST',
      'canonical_artifact_workflow_run_id',
      'coverage_canonical_source_sha',
      'KPMO_COVERAGE_ALIAS_OBSERVATION',
      'validate-safe-zip-archive-v1.py',
    ]) if (!observer.text.includes(marker)) findings.push(`control observer canonical guard marker missing: ${marker}`);
    if (observer.text.includes('-f head_sha=')) findings.push('control observer blind source-SHA artifact election detected');
  }

  const metrics = graphMetrics(graph, controlObserverEdges);

  for (const item of contract.static_validators) {
    const workflow = graph.byName.get(item.workflow);
    if (!workflow) {
      findings.push(`static validator missing: ${item.workflow}`);
      continue;
    }
    if (workflow.filePath !== item.path) findings.push(`${item.workflow}: path mismatch`);
    if (workflow.workflowRun) findings.push(`${item.workflow}: redundant workflow_run trigger`);
    if (workflow.text.includes('github.event.workflow_run')) findings.push(`${item.workflow}: stale workflow_run expression`);
    for (const trigger of contract.required_static_triggers) {
      if (!workflow.text.includes(`  ${trigger}:`)) findings.push(`${item.workflow}: required trigger missing: ${trigger}`);
    }
    const slug = path.basename(item.path, '.yml');
    const expectedConcurrency = `group: ${slug}-${'${{ github.event_name }}'}-${'${{ github.sha }}'}`;
    if (!workflow.text.includes(expectedConcurrency)) findings.push(`${item.workflow}: exact-generation concurrency missing`);
    if (!workflow.text.includes('cancel-in-progress: true')) findings.push(`${item.workflow}: same-generation coalescing missing`);
  }

  const assurance = graph.byName.get(observerContract.consumer)?.text || '';
  for (const workflowName of contract.critical_static_producers_watched_by_continuous_assurance) {
    if (!assurance.includes(`- '${workflowName}'`)) findings.push(`Continuous Assurance watch missing: ${workflowName}`);
  }

  if (metrics.workflow_run_consumers > budgets.workflow_run_consumers_max) findings.push('workflow_run consumer budget exceeded');
  if (metrics.execution_workflow_run_edges > budgets.execution_workflow_run_edges_max) findings.push('execution workflow_run edge budget exceeded');
  if (metrics.control_observer_edges > budgets.control_observer_edges_max) findings.push('control observer edge budget exceeded');
  for (const item of metrics.direct_consumer_counts_over_one) {
    if (item.count <= budgets.direct_consumers_per_producer_max) continue;
    const override = contract.direct_consumer_overrides?.[item.producer];
    if (!override || item.count > override.max || !item.consumers.includes(override.required_consumer)) {
      findings.push(`direct consumer fan-out budget exceeded: ${item.producer}`);
    }
  }
  if (metrics.workflow_run_chain_depth > budgets.workflow_run_chain_depth_max) findings.push('workflow_run chain depth budget exceeded');
  if (metrics.cycles > budgets.cycles_max) findings.push('workflow_run cycle budget exceeded');

  for (const key of ['autonomous_effect', 'global_effect', 'irreplaceable_value_effect', 'transparency_effect']) {
    if (!contract[key] || contract[key] === 'UNKNOWN') findings.push(`${key} must be explicit and non-UNKNOWN`);
  }
  return { findings, metrics };
}

const result = validate();
if (result.findings.length) {
  fail(`${result.findings.join('\n')}\nmetrics=${JSON.stringify(result.metrics)}\nbudgets=${JSON.stringify(contract.budgets)}`);
}

for (const item of contract.static_validators) {
  const original = fs.readFileSync(path.join(root, item.path), 'utf8');
  const mutation = original.replace(
    '\npermissions:',
    "\n  workflow_run:\n    workflows:\n      - 'KIDULTS ASI P1 Market-Event Adapter Runtime v1'\n    branches: [main]\n    types: [completed]\n\npermissions:",
  );
  const mutated = validate(new Map([[item.path, mutation]]));
  if (mutated.findings.length === 0) fail(`${item.workflow}: redundant workflow_run mutation escaped`);
}

const assuranceOriginal = fs.readFileSync(path.join(root, assurancePath), 'utf8');
const writePermissionMutation = assuranceOriginal.replace('  actions: read', '  actions: write');
if (validate(new Map([[assurancePath, writePermissionMutation]])).findings.length === 0) {
  fail('control observer write-permission mutation escaped');
}
const observerContract = contract.control_observer;
const baseGraph = readGraph();
const unapprovedProducer = baseGraph.workflows.find((workflow) =>
  workflow.name !== observerContract.consumer && !observerContract.producers.includes(workflow.name));
if (!unapprovedProducer) fail('control observer mutation fixture missing');
const unapprovedEdgeMutation = assuranceOriginal.replace(
  '    workflows:\n',
  `    workflows:\n      - '${unapprovedProducer.name}'\n`,
);
if (validate(new Map([[assurancePath, unapprovedEdgeMutation]])).findings.length === 0) {
  fail('unapproved control observer edge mutation escaped');
}
const cancelMutation = assuranceOriginal.replace('cancel-in-progress: false', 'cancel-in-progress: true');
if (validate(new Map([[assurancePath, cancelMutation]])).findings.length === 0) fail('canonical guard cancellation mutation escaped');
const blindShaMutation = assuranceOriginal.replace('-f name="$CANONICAL_ARTIFACT_NAME"', '-f head_sha="$KPMO_SOURCE_SHA"');
if (validate(new Map([[assurancePath, blindShaMutation]])).findings.length === 0) fail('blind source-SHA election mutation escaped');
const earlyLeaderMutation = assuranceOriginal.replace("if: success() && env.KPMO_EXECUTE_FULL_AUDIT == 'true' && env.KPMO_EPHEMERAL_ACTIONS_LEADER == 'true'", 'if: always()');
if (validate(new Map([[assurancePath, earlyLeaderMutation]])).findings.length === 0) fail('unverified leader publication mutation escaped');

process.stdout.write(`${JSON.stringify({
  id: contract.id,
  state: 'VERIFIED_PASS',
  ...result.metrics,
  control_observer: contract.control_observer.consumer,
  static_validators_detached: contract.static_validators.length,
  redundant_workflow_run_edges_removed: 14,
  autonomous_effect: contract.autonomous_effect,
  global_effect: contract.global_effect,
  irreplaceable_value_effect: contract.irreplaceable_value_effect,
  transparency_effect: contract.transparency_effect,
  production: contract.truth_boundary.production,
  public: contract.truth_boundary.public,
  g5: contract.truth_boundary.g5,
}, null, 2)}\n`);
