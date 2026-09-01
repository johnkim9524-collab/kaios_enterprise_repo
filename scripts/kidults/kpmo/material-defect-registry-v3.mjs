#!/usr/bin/env node
import crypto from 'node:crypto';

export const MATERIAL_PRIORITY_LABELS = Object.freeze(['P0', 'P1']);

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const serialized = typeof value === 'string' ? value : stableJson(value);
  return `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`;
}

export function normalizedLabels(issue) {
  return [...new Set(
    (issue?.labels || [])
      .map((label) => typeof label === 'string' ? label : label?.name)
      .filter(Boolean)
  )].sort();
}

export function declaredSeverityLabels(title) {
  const declared = new Set();
  const text = String(title || '');

  for (const match of text.matchAll(/\[([^\]]+)\]/g)) {
    const parts = String(match[1] || '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0 || !parts.every((part) => MATERIAL_PRIORITY_LABELS.includes(part))) continue;
    for (const part of parts) declared.add(part);
  }

  const prefix = text.match(/^\s*(P0\/P1|P1\/P0|P0|P1)\s*:\s*(?:\S|$)/);
  if (prefix) {
    for (const part of prefix[1].split('/')) declared.add(part);
  }

  return [...declared].sort();
}

export function parityFailures(issue) {
  const declared = new Set(declaredSeverityLabels(issue?.title));
  const labels = new Set(normalizedLabels(issue));
  const failures = [];
  for (const severity of declared) {
    if (!labels.has(severity)) failures.push(`#${issue?.number}:${severity}_TITLE_WITHOUT_${severity}_LABEL`);
  }
  if (declared.size === 1 && declared.has('P0') && labels.has('P1')) {
    failures.push(`#${issue?.number}:P1_LABEL_WITH_P0_ONLY_TITLE`);
  }
  if (declared.size === 1 && declared.has('P1') && labels.has('P0')) {
    failures.push(`#${issue?.number}:P0_LABEL_WITH_P1_ONLY_TITLE`);
  }
  return failures;
}

export function materialRecord(issue) {
  const declared = declaredSeverityLabels(issue?.title);
  const labels = normalizedLabels(issue);
  const priorities = [...new Set([
    ...declared,
    ...labels.filter((label) => MATERIAL_PRIORITY_LABELS.includes(label))
  ])].sort();
  if (!Number.isInteger(issue?.number) || String(issue?.state || '').toLowerCase() !== 'open' || priorities.length === 0) {
    return null;
  }
  return {
    issue_number: issue.number,
    declared_severity: declared,
    labels,
    effective_priority: priorities.includes('P0') ? 'P0' : 'P1',
    title: String(issue.title || '').trim()
  };
}

export function buildMaterialRegistry(issues) {
  return (issues || [])
    .map(materialRecord)
    .filter(Boolean)
    .sort((a, b) => a.issue_number - b.issue_number);
}

export function materialRegistryDigest(registry) {
  return sha256(registry);
}

export function runMaterialRegistrySelfTest() {
  const exactP0 = { number: 1, state: 'open', title: '[P0] exact', labels: [{ name: 'P0' }] };
  const combined = { number: 2, state: 'open', title: '[P0/P1][Portal] combined', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const prefixP1 = { number: 3, state: 'open', title: 'P1: strict prefix', labels: [{ name: 'P1' }] };
  const prefixCombined = { number: 4, state: 'open', title: 'P1/P0: combined prefix', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const missingPrefix = { number: 5, state: 'open', title: 'P1: missing label', labels: [] };
  const conflict = { number: 6, state: 'open', title: 'P0: conflicting label', labels: [{ name: 'P0' }, { name: 'P1' }] };
  const support = { number: 7, state: 'open', title: '[P0-SUPPORT] support only', labels: [] };
  const subclass = { number: 8, state: 'open', title: '[P0-A] subclass only', labels: [] };
  const prose = { number: 9, state: 'open', title: 'ordinary text mentioning P1: later', labels: [] };
  const labelOnly = { number: 10, state: 'open', title: 'material by authoritative label', labels: [{ name: 'P1' }] };
  const closed = { number: 11, state: 'closed', title: '[P1] closed', labels: [{ name: 'P1' }] };

  if (parityFailures(exactP0).length) throw new Error('SELF_TEST_EXACT_P0_REJECTED');
  if (parityFailures(combined).length) throw new Error('SELF_TEST_COMBINED_REJECTED');
  if (parityFailures(prefixP1).length) throw new Error('SELF_TEST_PREFIX_P1_REJECTED');
  if (parityFailures(prefixCombined).length) throw new Error('SELF_TEST_PREFIX_COMBINED_REJECTED');
  if (!parityFailures(missingPrefix).some((item) => item.includes('P1_TITLE_WITHOUT_P1_LABEL'))) {
    throw new Error('SELF_TEST_PREFIX_MISSING_LABEL_NOT_REJECTED');
  }
  if (!parityFailures(conflict).some((item) => item.includes('P1_LABEL_WITH_P0_ONLY_TITLE'))) {
    throw new Error('SELF_TEST_PREFIX_CONFLICT_NOT_REJECTED');
  }
  if (declaredSeverityLabels(support.title).length !== 0 || declaredSeverityLabels(subclass.title).length !== 0) {
    throw new Error('SELF_TEST_SUPPORT_OR_SUBCLASS_ALIASING');
  }
  if (declaredSeverityLabels(prose.title).length !== 0) throw new Error('SELF_TEST_NONLEADING_PROSE_ALIASING');
  if (!materialRecord(labelOnly)) throw new Error('SELF_TEST_LABEL_ONLY_MATERIAL_LOST');
  if (materialRecord({ number: 12, state: 'open', title: 'ordinary issue', labels: [] })) {
    throw new Error('SELF_TEST_ORDINARY_FALSE_MATERIAL');
  }
  if (materialRecord(closed)) throw new Error('SELF_TEST_CLOSED_MATERIAL_INCLUDED');

  const registry = buildMaterialRegistry([prefixP1, exactP0, labelOnly]);
  if (registry.map((item) => item.issue_number).join(',') !== '1,3,10') {
    throw new Error('SELF_TEST_REGISTRY_ORDER');
  }
  const digestA = materialRegistryDigest(registry);
  const digestB = materialRegistryDigest(structuredClone(registry));
  if (digestA !== digestB || !/^sha256:[0-9a-f]{64}$/.test(digestA)) {
    throw new Error('SELF_TEST_REGISTRY_DIGEST');
  }

  return {
    test: 'MATERIAL_DEFECT_REGISTRY_V3_SELF_TEST',
    state: 'VERIFIED_PASS',
    exact_bracket_markers: true,
    strict_leading_prefix_markers: true,
    combined_marker_normalization: true,
    support_and_subclass_aliases_excluded: true,
    nonleading_prose_excluded: true,
    label_only_authority_preserved: true,
    closed_issues_excluded: true,
    stable_registry_digest: true
  };
}
