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
  return [...new Set((issue?.labels || []).map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean))].sort();
}

export function declaredSeverityLabels(title) {
  const declared = new Set();
  const text = String(title || '');
  const prefixMatch = text.match(/^\s*((?:P0|P1)(?:\s*\/\s*(?:P0|P1))*)\s*:/);
  if (prefixMatch) {
    for (const part of String(prefixMatch[1] || '').split('/').map((part) => part.trim()).filter(Boolean)) declared.add(part);
  }
  for (const match of text.matchAll(/\[([^\]]+)\]/g)) {
    const parts = String(match[1] || '').split('/').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0 || !parts.every((part) => MATERIAL_PRIORITY_LABELS.includes(part))) continue;
    for (const part of parts) declared.add(part);
  }
  return [...declared].sort();
}

export function parityFailures(issue) {
  const declared = new Set(declaredSeverityLabels(issue?.title));
  const labels = new Set(normalizedLabels(issue));
  const failures = [];
  for (const severity of declared) if (!labels.has(severity)) failures.push(`#${issue?.number}:${severity}_TITLE_WITHOUT_${severity}_LABEL`);
  if (declared.size === 1 && declared.has('P0') && labels.has('P1')) failures.push(`#${issue?.number}:P1_LABEL_WITH_P0_ONLY_TITLE`);
  if (declared.size === 1 && declared.has('P1') && labels.has('P0')) failures.push(`#${issue?.number}:P0_LABEL_WITH_P1_ONLY_TITLE`);
  return failures;
}

export function materialRecord(issue) {
  const declared = declaredSeverityLabels(issue?.title);
  const labels = normalizedLabels(issue);
  const priorities = [...new Set([...declared, ...labels.filter((label) => MATERIAL_PRIORITY_LABELS.includes(label))])].sort();
  if (!Number.isInteger(issue?.number) || String(issue?.state || '').toLowerCase() !== 'open' || priorities.length === 0) return null;
  return {
    issue_number: issue.number,
    declared_severity: declared,
    labels,
    effective_priority: priorities.includes('P0') ? 'P0' : 'P1',
    title: String(issue.title || '').trim(),
  };
}

export function buildMaterialRegistry(issues) {
  return (issues || []).map(materialRecord).filter(Boolean).sort((a, b) => a.issue_number - b.issue_number);
}

export function materialRegistryDigest(registry) {
  return sha256(registry);
}

export function runMaterialRegistrySelfTest() {
  const cases = [
    {number:1,state:'open',title:'[P0] exact',labels:[{name:'P0'}]},
    {number:2,state:'open',title:'[P0/P1] combined',labels:[{name:'P0'},{name:'P1'}]},
    {number:3,state:'open',title:'P1: strict prefix',labels:[{name:'P1'}]},
    {number:4,state:'open',title:'P1/P0: combined prefix',labels:[{name:'P0'},{name:'P1'}]},
    {number:5,state:'open',title:'P1: missing label',labels:[]},
    {number:6,state:'open',title:'P0: conflicting label',labels:[{name:'P0'},{name:'P1'}]},
    {number:7,state:'open',title:'[P0-SUPPORT] support only',labels:[]},
    {number:8,state:'open',title:'[P0-A] subclass only',labels:[]},
    {number:9,state:'open',title:'ordinary text mentioning P1: later',labels:[]},
    {number:10,state:'open',title:'material by authoritative label',labels:[{name:'P1'}]},
    {number:11,state:'closed',title:'[P1] closed',labels:[{name:'P1'}]},
  ];
  if (parityFailures(cases[0]).length || parityFailures(cases[1]).length || parityFailures(cases[2]).length || parityFailures(cases[3]).length) throw new Error('SELF_TEST_VALID_SEVERITY_REJECTED');
  if (!parityFailures(cases[4]).some((item) => item.includes('P1_TITLE_WITHOUT_P1_LABEL'))) throw new Error('SELF_TEST_PREFIX_MISSING_LABEL_NOT_REJECTED');
  if (!parityFailures(cases[5]).some((item) => item.includes('P1_LABEL_WITH_P0_ONLY_TITLE'))) throw new Error('SELF_TEST_PREFIX_CONFLICT_NOT_REJECTED');
  if (declaredSeverityLabels(cases[6].title).length || declaredSeverityLabels(cases[7].title).length || declaredSeverityLabels(cases[8].title).length) throw new Error('SELF_TEST_ALIAS_OR_PROSE_FALSE_MATERIAL');
  if (!materialRecord(cases[9]) || materialRecord(cases[10])) throw new Error('SELF_TEST_LABEL_ONLY_OR_CLOSED_BOUNDARY');
  const registry = buildMaterialRegistry([cases[2], cases[0], cases[9]]);
  if (registry.map((item) => item.issue_number).join(',') !== '1,3,10') throw new Error('SELF_TEST_REGISTRY_ORDER');
  const digestA = materialRegistryDigest(registry);
  const digestB = materialRegistryDigest(structuredClone(registry));
  if (digestA !== digestB || !/^sha256:[0-9a-f]{64}$/.test(digestA)) throw new Error('SELF_TEST_REGISTRY_DIGEST');
  const transportOnly = structuredClone([cases[2], cases[0], cases[9]]);
  transportOnly.forEach((issue, index) => { issue.updated_at = `2026-09-04T00:00:0${index}Z`; issue.comments = 100 + index; });
  if (materialRegistryDigest(buildMaterialRegistry(transportOnly)) !== digestA) throw new Error('SELF_TEST_TRANSPORT_ACTIVITY_SELF_INVALIDATION');
  const titleMutation = structuredClone([cases[2], cases[0], cases[9]]);
  titleMutation[0].title = 'P1: materially changed title';
  if (materialRegistryDigest(buildMaterialRegistry(titleMutation)) === digestA) throw new Error('SELF_TEST_TITLE_MUTATION_NOT_BOUND');
  const labelMutation = structuredClone([cases[2], cases[0], cases[9]]);
  labelMutation[2].labels = [{name:'P0'}];
  if (materialRegistryDigest(buildMaterialRegistry(labelMutation)) === digestA) throw new Error('SELF_TEST_LABEL_MUTATION_NOT_BOUND');
  const stateMutation = structuredClone([cases[2], cases[0], cases[9]]);
  stateMutation[0].state = 'closed';
  if (materialRegistryDigest(buildMaterialRegistry(stateMutation)) === digestA) throw new Error('SELF_TEST_STATE_MUTATION_NOT_BOUND');
  return {test:'MATERIAL_DEFECT_REGISTRY_V3_SELF_TEST',state:'VERIFIED_PASS',strict_prefix:true,exact_brackets:true,support_aliases_excluded:true,label_only_authority_preserved:true,transport_activity_excluded:true,material_fields_bound:true,stable_registry_digest:true};
}
