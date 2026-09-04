#!/usr/bin/env node
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const canonicalIssues = [235,236,237,238,240,256,344,457,479,480,489,521,550,558,559,560,609,742,769,881,921,951,1066,1166,1296];
const canonicalBlockPattern = /<!-- KPMO_CANONICAL_TRUTH_V2_START -->([\s\S]*?)<!-- KPMO_CANONICAL_TRUTH_V2_END -->/g;
const exactDigest = value => /^sha256:[0-9a-f]{64}$/.test(String(value || ''));

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}
function normalizedLabels(issue) {
  return [...new Set((issue.labels || []).map(label => typeof label === 'string' ? label : label?.name).filter(Boolean))].sort();
}
export function declaredSeverityLabels(title) {
  const declared = new Set();
  const text = String(title || '');
  const prefixMatch = text.match(/^\s*((?:P0|P1)(?:\s*\/\s*(?:P0|P1))*)\s*:/);
  if (prefixMatch) for (const part of String(prefixMatch[1] || '').split('/').map(x => x.trim()).filter(Boolean)) declared.add(part);
  for (const match of text.matchAll(/\[([^\]]+)\]/g)) {
    const parts = String(match[1] || '').split('/').map(x => x.trim()).filter(Boolean);
    if (parts.length && parts.every(part => part === 'P0' || part === 'P1')) for (const part of parts) declared.add(part);
  }
  return [...declared].sort();
}
export function parityFailures(issue) {
  const declared = new Set(declaredSeverityLabels(issue.title));
  const labels = new Set(normalizedLabels(issue));
  const failures = [];
  for (const severity of declared) if (!labels.has(severity)) failures.push(`#${issue.number}:${severity}_TITLE_WITHOUT_${severity}_LABEL`);
  if (declared.size === 1 && declared.has('P0') && labels.has('P1')) failures.push(`#${issue.number}:P1_LABEL_WITH_P0_ONLY_TITLE`);
  if (declared.size === 1 && declared.has('P1') && labels.has('P0')) failures.push(`#${issue.number}:P0_LABEL_WITH_P1_ONLY_TITLE`);
  return failures;
}
export function materialRecord(issue) {
  const declared = declaredSeverityLabels(issue.title);
  const labels = normalizedLabels(issue);
  const priorities = [...new Set([...declared, ...labels.filter(label => label === 'P0' || label === 'P1')])].sort();
  if (!Number.isInteger(issue.number) || String(issue.state || '').toLowerCase() !== 'open' || priorities.length === 0) return null;
  return {
    issue_number: issue.number,
    declared_severity: declared,
    labels,
    effective_priority: priorities.includes('P0') ? 'P0' : 'P1',
    title: String(issue.title || '').trim(),
    updated_at: issue.updated_at || null
  };
}
function latestBlock(body) {
  const blocks = [...String(body || '').matchAll(canonicalBlockPattern)];
  return blocks.length ? blocks.at(-1)[1] : '';
}
function parseMembers(raw) {
  const text = String(raw || '').trim();
  if (!text || text === 'NONE') return [];
  const values = text.split(',').map(x => x.trim()).filter(Boolean);
  const numbers = [];
  for (const value of values) {
    const match = value.match(/^#([1-9][0-9]*)$/);
    if (!match) throw new Error(`MATERIAL_MEMBER_FORMAT:${value}`);
    numbers.push(Number(match[1]));
  }
  if (new Set(numbers).size !== numbers.length) throw new Error('MATERIAL_MEMBER_DUPLICATE');
  return numbers;
}
export function materialSummary(registry) {
  const sorted = [...registry].sort((a,b) => a.issue_number - b.issue_number);
  const bindingRecords = sorted.map(({issue_number,declared_severity,labels,effective_priority,title}) => ({
    issue_number, declared_severity, labels, effective_priority, title
  }));
  return {
    count: sorted.length,
    digest: sha256(bindingRecords),
    members: sorted.map(item => item.issue_number),
    digest_scope: 'STABLE_MATERIAL_FIELDS_EXCLUDING_UPDATED_AT'
  };
}
export function validateCanonicalBlock(body, expectedMainSha, summary) {
  const block = latestBlock(body);
  const errors = [];
  if (!block) return ['CANONICAL_BLOCK_MISSING'];
  const main = block.match(/protected main:\s*`([0-9a-f]{40})`/i)?.[1] || '';
  if (main !== expectedMainSha) errors.push(`STALE_MAIN:${main || 'NONE'}:${expectedMainSha}`);
  if (!/Production\/Public\/G5:\s*\*{0,2}HOLD\*{0,2}/i.test(block)) errors.push('HOLD_MISSING');
  const countRaw = block.match(/material defect registry count:\s*`([0-9]+)`/i)?.[1];
  const digestRaw = block.match(/material defect registry binding sha256:\s*`(sha256:[0-9a-f]{64})`/i)?.[1];
  const membersRaw = block.match(/material defect registry members:\s*`([^`]*)`/i)?.[1];
  if (countRaw === undefined) errors.push('MATERIAL_COUNT_MISSING');
  else if (Number(countRaw) !== summary.count) errors.push(`MATERIAL_COUNT_MISMATCH:${countRaw}:${summary.count}`);
  if (!digestRaw) errors.push('MATERIAL_BINDING_DIGEST_MISSING');
  else if (!exactDigest(digestRaw) || digestRaw !== summary.digest) errors.push(`MATERIAL_BINDING_DIGEST_MISMATCH:${digestRaw}:${summary.digest}`);
  if (membersRaw === undefined) errors.push('MATERIAL_MEMBERS_MISSING');
  else {
    try {
      const members = parseMembers(membersRaw);
      if (JSON.stringify(members) !== JSON.stringify(summary.members)) errors.push(`MATERIAL_MEMBERS_MISMATCH:${members.join(',')}:${summary.members.join(',')}`);
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  return errors;
}

function headersFor(token) {
  return {Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'};
}
export async function githubJson(url, headers) {
  const response = await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
  const text = await response.text();
  if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}:${text.slice(0,300)}`);
  return JSON.parse(text);
}
export async function fetchAllOpenIssues(repository, headers) {
  const out=[]; let total=null;
  for(let page=1;page<=10;page+=1){
    const q=encodeURIComponent(`repo:${repository} is:issue is:open`);
    const data=await githubJson(`https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=100&page=${page}`,headers);
    if(data.incomplete_results!==false) throw new Error(`INCOMPLETE_RESULTS:page=${page}`);
    if(!Number.isInteger(data.total_count)||data.total_count<0||data.total_count>1000) throw new Error(`INVALID_TOTAL:${data.total_count}`);
    if(total===null) total=data.total_count;
    if(total!==data.total_count) throw new Error(`CARDINALITY_MOVED:${total}->${data.total_count}`);
    if(!Array.isArray(data.items)) throw new Error(`INVALID_ITEMS:page=${page}`);
    out.push(...data.items);
    if(out.length>=total) break;
    if(data.items.length===0||page===10) throw new Error(`PAGINATION_TRUNCATED:${out.length}/${total}`);
  }
  if(out.length!==total) throw new Error(`CARDINALITY_MISMATCH:${out.length}/${total}`);
  return out;
}
export async function buildLiveMaterialRegistry({repository, token}) {
  if (!repository || !token) throw new Error('REPOSITORY_OR_TOKEN_MISSING');
  const headers=headersFor(token);
  const openIssues=await fetchAllOpenIssues(repository,headers);
  const parity=openIssues.flatMap(parityFailures);
  if(parity.length) throw new Error(`SEVERITY_METADATA_MISMATCH:${parity.join(',')}`);
  const registry=openIssues.map(materialRecord).filter(Boolean).sort((a,b)=>a.issue_number-b.issue_number);
  return {headers,openIssues,registry,summary:materialSummary(registry)};
}

function selfTest() {
  const main = 'a'.repeat(40);
  const registry = [
    materialRecord({number:10,state:'open',title:'[P0] A',labels:[{name:'P0'}],updated_at:'2026-01-01T00:00:00Z'}),
    materialRecord({number:11,state:'open',title:'P1: B',labels:[{name:'P1'}],updated_at:'2026-01-02T00:00:00Z'})
  ];
  const summary = materialSummary(registry);
  const block = `<!-- KPMO_CANONICAL_TRUTH_V2_START -->\nprotected main: \`${main}\`\nmaterial defect registry count: \`${summary.count}\`\nmaterial defect registry binding sha256: \`${summary.digest}\`\nmaterial defect registry members: \`#10,#11\`\nProduction/Public/G5: **HOLD**\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
  if (validateCanonicalBlock(block, main, summary).length) throw new Error('SELF_VALID_BLOCK_REJECTED');
  const mutations = [
    ['STALE_MAIN', block.replace(main, 'b'.repeat(40))],
    ['COUNT', block.replace('count: `2`', 'count: `1`')],
    ['DIGEST', block.replace(summary.digest, `sha256:${'0'.repeat(64)}`)],
    ['OMIT_MEMBER', block.replace('#10,#11', '#10')],
    ['EXTRA_MEMBER', block.replace('#10,#11', '#10,#11,#12')],
    ['MISSING_HOLD', block.replace('Production/Public/G5: **HOLD**', 'Production/Public/G5: PASS')]
  ];
  for (const [name, mutated] of mutations) if (!validateCanonicalBlock(mutated, main, summary).length) throw new Error(`SELF_FALSE_GREEN:${name}`);
  const changedTimestamp = registry.map(item => ({...item, updated_at:'2099-01-01T00:00:00Z'}));
  if (materialSummary(changedTimestamp).digest !== summary.digest) throw new Error('SELF_UPDATED_AT_CHANGED_BINDING_DIGEST');
  const added = materialRecord({number:12,state:'open',title:'[P1] C',labels:[{name:'P1'}],updated_at:'2026-01-03T00:00:00Z'});
  const changedSummary = materialSummary([...registry, added]);
  if (!validateCanonicalBlock(block, main, changedSummary).some(x => x.startsWith('MATERIAL_'))) throw new Error('SELF_NEW_DEFECT_NOT_INVALIDATING_BLOCK');
  if (!parityFailures({number:13,state:'open',title:'P1: mismatch',labels:[{name:'P0'}]}).length) throw new Error('SELF_PARITY_MISMATCH_NOT_REJECTED');
  process.stdout.write(`${JSON.stringify({test:'CANONICAL_MATERIAL_REGISTRY_BINDING_V1',state:'VERIFIED_PASS',negative_cases:mutations.length,new_defect_invalidates:true,severity_parity_required:true,updated_at_excluded_from_binding_digest:true})}\n`);
}

export async function runLive() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  try {
    const {headers,summary}=await buildLiveMaterialRegistry({repository,token});
    const main=await githubJson(`https://api.github.com/repos/${repository}/branches/main`,headers);
    const mainSha=String(main?.commit?.sha||'');
    if(!/^[0-9a-f]{40}$/.test(mainSha)) throw new Error('LIVE_MAIN_SHA_INVALID');
    const canonical=await Promise.all(canonicalIssues.map(number=>githubJson(`https://api.github.com/repos/${repository}/issues/${number}`,headers)));
    const failures=[];
    for(const issue of canonical) for(const error of validateCanonicalBlock(issue.body||'',mainSha,summary)) failures.push(`#${issue.number}:${error}`);
    const result={validator:'CANONICAL_MATERIAL_REGISTRY_BINDING_V1',state:failures.length?'VERIFIED_FAIL':'VERIFIED_PASS',protected_main_sha:mainSha,canonical_issue_count:canonicalIssues.length,material_defect_count:summary.count,material_defect_registry_binding_sha256:summary.digest,material_defect_registry_digest_scope:summary.digest_scope,material_defect_registry_members:summary.members,complete_open_issue_pagination:true,severity_parity_verified:true,failures,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
    (failures.length?console.error:console.log)(JSON.stringify(result,null,2));
    if(failures.length) process.exitCode=1;
  } catch(error) {
    console.error(JSON.stringify({validator:'CANONICAL_MATERIAL_REGISTRY_BINDING_V1',state:'VERIFIED_FAIL',message:error instanceof Error?error.message:String(error),promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'},null,2));
    process.exitCode=1;
  }
}

const isDirect = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  if (process.argv.includes('--self-test')) selfTest();
  else await runLive();
}
