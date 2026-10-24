#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const MAX_WORKFLOW_RUN_EDGES = 3;

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed.slice(1, -1);
  return trimmed;
}

function parseWorkflow(file) {
  const text = fs.readFileSync(file, 'utf8');
  const nameMatch = text.match(/^name:\s*(.+?)\s*$/m);
  if (!nameMatch) throw new Error(`WORKFLOW_NAME_MISSING:${file}`);
  const name = unquote(nameMatch[1]);
  const lines = text.split(/\r?\n/);
  const onStart = lines.findIndex((line) => /^on:\s*$/.test(line));
  let onEnd = lines.length;
  if (onStart >= 0) {
    for (let i = onStart + 1; i < lines.length; i += 1) {
      if (/^[^ \t#][^:]*:\s*/.test(lines[i])) { onEnd = i; break; }
    }
  }
  const onLines = onStart >= 0 ? lines.slice(onStart + 1, onEnd) : [];
  const triggerKeys = onLines.flatMap((line) => {
    const match = line.match(/^  ([A-Za-z_]+):/);
    return match ? [match[1]] : [];
  });
  const rootCapable = triggerKeys.some((key) => key !== 'workflow_run');
  const producers = [];
  const wr = onLines.findIndex((line) => /^  workflow_run:\s*$/.test(line));
  if (wr >= 0) {
    let inWorkflows = false;
    for (let i = wr + 1; i < onLines.length; i += 1) {
      const line = onLines[i];
      if (/^  [A-Za-z_]+:/.test(line)) break;
      const inline = line.match(/^    workflows:\s*\[(.*)\]\s*$/);
      if (inline) {
        producers.push(...inline[1].split(',').map(unquote).filter(Boolean));
        inWorkflows = false;
        continue;
      }
      if (/^    workflows:\s*$/.test(line)) { inWorkflows = true; continue; }
      if (inWorkflows) {
        const item = line.match(/^      -\s*(.+?)\s*$/);
        if (item) { producers.push(unquote(item[1])); continue; }
        if (/^    [A-Za-z_]+:/.test(line)) inWorkflows = false;
      }
    }
  }
  return { name, file, rootCapable, producers };
}

function evaluate(workflows) {
  const names = new Set(workflows.map((workflow) => workflow.name));
  const edges = new Map(workflows.map((workflow) => [workflow.name, []]));
  const unresolved = [];
  for (const workflow of workflows) {
    for (const producer of workflow.producers) {
      if (!names.has(producer)) unresolved.push({ producer, consumer: workflow.name });
      else edges.get(producer).push(workflow.name);
    }
  }
  const violations = [];
  const cycles = [];
  const seenViolations = new Set();
  const seenCycles = new Set();
  function walk(node, chain) {
    for (const next of edges.get(node) || []) {
      const nextChain = [...chain, next];
      const repeatedAt = chain.indexOf(next);
      if (repeatedAt >= 0) {
        const cycle = [...chain.slice(repeatedAt), next];
        const key = cycle.join(' -> ');
        if (!seenCycles.has(key)) { seenCycles.add(key); cycles.push(cycle); }
        continue;
      }
      const edgeCount = nextChain.length - 1;
      if (edgeCount > MAX_WORKFLOW_RUN_EDGES) {
        const key = nextChain.join(' -> ');
        if (!seenViolations.has(key)) {
          seenViolations.add(key);
          violations.push({ edge_count: edgeCount, chain: nextChain });
        }
      }
      if (nextChain.length <= workflows.length + 1) walk(next, nextChain);
    }
  }
  for (const workflow of workflows.filter((item) => item.rootCapable)) walk(workflow.name, [workflow.name]);
  return { violations, cycles, unresolved };
}

function selfTest() {
  const wf = (name, producers = [], rootCapable = false) => ({ name, producers, rootCapable, file: name });
  const allowed = evaluate([wf('A', [], true), wf('B', ['A']), wf('C', ['B']), wf('D', ['C'])]);
  if (allowed.violations.length || allowed.cycles.length) throw new Error('SELF_TEST_ALLOWED_CHAIN_REJECTED');
  const blocked = evaluate([wf('A', [], true), wf('B', ['A']), wf('C', ['B']), wf('D', ['C']), wf('E', ['D'])]);
  if (blocked.violations.length !== 1 || blocked.violations[0].edge_count !== 4) throw new Error('SELF_TEST_DEPTH_NOT_REJECTED');
  const cyclic = evaluate([wf('A', [], true), wf('B', ['A', 'C']), wf('C', ['B'])]);
  if (!cyclic.cycles.length) throw new Error('SELF_TEST_CYCLE_NOT_REJECTED');
  process.stdout.write(`${JSON.stringify({ state: 'VERIFIED_PASS', self_test: true, maximum_workflow_run_edges: MAX_WORKFLOW_RUN_EDGES })}\n`);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  const directory = process.argv[2] || '.github/workflows';
  const workflows = fs.readdirSync(directory)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => parseWorkflow(path.join(directory, file)));
  const result = evaluate(workflows);
  const state = result.violations.length || result.cycles.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS';
  process.stdout.write(`${JSON.stringify({
    state,
    policy: 'GITHUB_WORKFLOW_RUN_MAXIMUM_THREE_LEVELS',
    maximum_workflow_run_edges: MAX_WORKFLOW_RUN_EDGES,
    workflow_count: workflows.length,
    violation_count: result.violations.length,
    cycle_count: result.cycles.length,
    unresolved_producer_count: result.unresolved.length,
    violations: result.violations,
    cycles: result.cycles,
    unresolved_producers: result.unresolved
  }, null, 2)}\n`);
  if (state !== 'VERIFIED_PASS') process.exit(2);
}
