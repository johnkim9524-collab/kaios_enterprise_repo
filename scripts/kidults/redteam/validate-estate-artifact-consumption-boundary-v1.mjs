#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKFLOW_ROOT = '.github/workflows';
const SAFE_ZIP_VALIDATOR = 'scripts/kidults/kpmo/validate-safe-zip-archive-v1.py';
const GOVERNED_RESTORE_HELPER = 'scripts/kidults/supply-chain/restore-exact-github-artifact-v1.mjs';
const CRITICAL_PATHS = Object.freeze([
  '.github/workflows/kidults-asi-source-fabric-scale-pi1.yml',
  '.github/workflows/kidults-asi-self-driving-control-loop-v1.yml',
  '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v1.yml',
  'scripts/kidults/source-intelligence/asi-global-low-risk-discovery-v1.mjs',
  GOVERNED_RESTORE_HELPER,
]);
const TARGET_REACHABLE_HELPERS = Object.freeze(CRITICAL_PATHS.filter(item => item.startsWith('scripts/')));

const REQUIRED_SAFE_ZIP_ARGUMENTS = Object.freeze([
  '--archive',
  '--expected-digest',
  '--receipt',
  '--max-compressed-bytes',
  '--max-entries',
  '--max-entry-uncompressed-bytes',
  '--max-total-uncompressed-bytes',
  '--max-compression-ratio',
]);

const normalizePath = value => value.split(path.sep).join('/').replace(/^\.\//, '');
const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;

function walkFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && predicate(absolute)) output.push(absolute);
    }
  };
  visit(root);
  return output;
}

function workflowRunBlocks(source) {
  const lines = source.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!match) continue;
    const yamlIndent = match[1].length;
    const value = match[2];
    if (!/^[|>][+-]?\s*(?:#.*)?$/.test(value)) {
      blocks.push({ source: value, start_line: index + 1, end_line: index + 1 });
      continue;
    }
    const body = [];
    let cursor = index + 1;
    let contentIndent = null;
    while (cursor < lines.length) {
      const raw = lines[cursor];
      if (!raw.trim()) {
        body.push({ raw: '', line: cursor + 1 });
        cursor += 1;
        continue;
      }
      const indent = raw.match(/^\s*/)[0].length;
      if (indent <= yamlIndent) break;
      if (contentIndent === null || indent < contentIndent) contentIndent = indent;
      body.push({ raw, line: cursor + 1 });
      cursor += 1;
    }
    const trimIndent = contentIndent ?? yamlIndent + 2;
    blocks.push({
      source: body.map(item => item.raw ? item.raw.slice(Math.min(trimIndent, item.raw.length)) : '').join('\n'),
      start_line: body[0]?.line ?? index + 1,
      end_line: body.at(-1)?.line ?? index + 1,
    });
    index = cursor - 1;
  }
  return blocks;
}

function logicalCommands(source, startLine) {
  const lines = source.split('\n');
  const commands = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!current) current = { text: '', start_line: startLine + index, end_line: startLine + index };
    current.text += `${current.text ? '\n' : ''}${raw}`;
    current.end_line = startLine + index;
    if (/\\\s*(?:#.*)?$/.test(raw)) continue;
    commands.push(current);
    current = null;
  }
  if (current) commands.push(current);
  return commands;
}

function shellTokens(source) {
  return (source.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s;|&()]+/g) ?? [])
    .map(token => {
      if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        return token.slice(1, -1);
      }
      return token;
    });
}

function archiveAfterUnzip(command, unzipOffset) {
  const tokens = shellTokens(command.slice(unzipOffset));
  if (tokens[0] !== 'unzip') return null;
  for (const token of tokens.slice(1)) {
    if (/^-/.test(token)) continue;
    if (/^(?:if|then|do|fi|done|!|\{)$/.test(token)) continue;
    return token.replace(/[;,]$/, '');
  }
  return null;
}

function isListOnlyUnzip(command, unzipOffset) {
  const tokens = shellTokens(command.slice(unzipOffset));
  for (const token of tokens.slice(1)) {
    if (!token.startsWith('-')) break;
    if (/^-(?:Z|l|v|t)/.test(token) || /^--(?:list|test)/.test(token)) return true;
  }
  return false;
}

function optionValue(command, option) {
  const tokens = shellTokens(command.replace(/\\\s*\n/g, ' '));
  const index = tokens.indexOf(option);
  return index >= 0 ? (tokens[index + 1] ?? null) : null;
}

function safeZipCommand(command) {
  if (!command.includes(SAFE_ZIP_VALIDATOR)) return null;
  const missing = REQUIRED_SAFE_ZIP_ARGUMENTS.filter(argument => !shellTokens(command.replace(/\\\s*\n/g, ' ')).includes(argument));
  return {
    archive: optionValue(command, '--archive'),
    complete: missing.length === 0,
    missing,
  };
}

function analyzeWorkflowExtractions(file, block) {
  const commands = logicalCommands(block.source, block.start_line);
  const validators = commands.map((command, index) => ({ ...command, index, validation: safeZipCommand(command.text) }))
    .filter(item => item.validation);
  const records = [];
  commands.forEach((command, commandIndex) => {
    const unzipPattern = /\bunzip\b/g;
    for (const match of command.text.matchAll(unzipPattern)) {
      if (isListOnlyUnzip(command.text, match.index)) continue;
      const archive = archiveAfterUnzip(command.text, match.index);
      const matching = validators.filter(item => item.validation.archive && archive && item.validation.archive === archive);
      const prior = matching.filter(item => item.index < commandIndex && item.validation.complete).at(-1) ?? null;
      const later = matching.find(item => item.index > commandIndex && item.validation.complete) ?? null;
      const incompletePrior = matching.filter(item => item.index < commandIndex && !item.validation.complete).at(-1) ?? null;
      records.push({
        path: file,
        line: command.start_line + command.text.slice(0, match.index).split('\n').length - 1,
        archive,
        kind: 'WORKFLOW_RAW_ZIP_EXTRACTION',
        prevalidated: Boolean(prior),
        validation_after_extraction: Boolean(later),
        incomplete_prevalidation_arguments: incompletePrior?.validation.missing ?? [],
      });
    }
  });
  return records;
}

function splitTopLevelCommaList(source) {
  const output = [];
  let quote = null;
  let depth = 0;
  let current = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      current += character;
      if (character === quote && source[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      current += character;
      continue;
    }
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      output.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim()) output.push(current.trim());
  return output;
}

function normalizeJsExpression(value) {
  const trimmed = String(value ?? '').trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function jsExecCalls(source) {
  const calls = [];
  const pattern = /execFileSync\s*\(\s*(['"])([^'"]+)\1\s*,\s*\[/g;
  for (const match of source.matchAll(pattern)) {
    const arrayStart = match.index + match[0].length;
    let cursor = arrayStart;
    let quote = null;
    let depth = 1;
    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      if (quote) {
        if (character === quote && source[cursor - 1] !== '\\') quote = null;
        continue;
      }
      if (character === "'" || character === '"' || character === '`') quote = character;
      else if (character === '[') depth += 1;
      else if (character === ']') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    calls.push({
      command: match[2],
      arguments: splitTopLevelCommaList(source.slice(arrayStart, cursor)),
      offset: match.index,
      end_offset: cursor,
    });
  }
  return calls;
}

function jsSafeZipCall(call) {
  if (!call.arguments.some(argument => normalizeJsExpression(argument).includes(SAFE_ZIP_VALIDATOR))) return null;
  const normalized = call.arguments.map(normalizeJsExpression);
  const missing = REQUIRED_SAFE_ZIP_ARGUMENTS.filter(argument => !normalized.includes(argument));
  const archiveIndex = normalized.indexOf('--archive');
  return {
    archive: archiveIndex >= 0 ? normalized[archiveIndex + 1] ?? null : null,
    complete: missing.length === 0,
    missing,
  };
}

function analyzeHelperExtractions(file, source) {
  const calls = jsExecCalls(source);
  const validators = calls.map(call => ({ ...call, validation: jsSafeZipCall(call) })).filter(item => item.validation);
  const records = [];
  for (const call of calls.filter(item => path.basename(item.command).toLowerCase() === 'unzip')) {
    const archiveExpression = call.arguments.map(normalizeJsExpression).find(argument => argument && !argument.startsWith('-')) ?? null;
    const matching = validators.filter(item => item.validation.archive && archiveExpression && item.validation.archive === archiveExpression);
    const prior = matching.filter(item => item.offset < call.offset && item.validation.complete).at(-1) ?? null;
    const later = matching.find(item => item.offset > call.offset && item.validation.complete) ?? null;
    const incompletePrior = matching.filter(item => item.offset < call.offset && !item.validation.complete).at(-1) ?? null;
    records.push({
      path: file,
      line: lineAt(source, call.offset),
      archive: archiveExpression,
      kind: 'HELPER_RAW_ZIP_EXTRACTION',
      prevalidated: Boolean(prior),
      validation_after_extraction: Boolean(later),
      incomplete_prevalidation_arguments: incompletePrior?.validation.missing ?? [],
    });
  }
  return records;
}

function analyzeGovernedRestoreHelper(file, source) {
  const markerIndex = marker => Math.max(0, source.indexOf(marker));
  const includesEvery = markers => markers.every(marker => source.includes(marker));
  const paginationBound = (source.match(/collectCompletePages\s*\(\s*\{/g) ?? []).length >= 2 && includesEvery([
    'payload?.total_count',
    'expectedTotal > maxPages * 100',
    'pageTotal !== expectedTotal',
    'seenIds.has(id)',
    'rows.length === expectedTotal',
    'PAGINATION_INCOMPLETE',
    'pagination_reconciled_complete: true',
  ]);
  const producerBound = includesEvery([
    'workflow?.path !== specification.workflowPath',
    'workflow?.name !== specification.workflowName',
    "workflow?.state !== 'active'",
    'run?.repository?.full_name !== repository',
    'run?.name !== specification.workflowName',
    'run?.path !== specification.workflowPath',
    'run?.head_branch !== specification.branch',
    'run?.head_sha',
    'run?.run_attempt',
    "run?.status !== 'completed'",
    "run?.conclusion !== 'success'",
    'specification.allowedEvents.includes(run?.event)',
    'RUN_READBACK_MISMATCH',
  ]);
  const artifactCardinalityBound = includesEvery([
    'matches.length > 1',
    'matches.length === 0',
    'ARTIFACT_CARDINALITY_INVALID',
    'artifact?.workflow_run?.id !== run.id',
    'ARTIFACT_READBACK_MISMATCH',
    'sameArtifactMetadata(selectedArtifact, exactArtifact)',
    'artifact_cardinality: 1',
  ]);
  const digestBound = includesEvery([
    'DIGEST_PATTERN',
    'archiveDigest !== selectedArtifact.digest',
    "'--expected-digest', selectedArtifact.digest",
    'safeZipReceipt.archive_digest !== selectedArtifact.digest',
    'downloaded_archive_digest: archiveDigest',
    'exact_digest_bound: true',
  ]);
  const requiredFileCardinalityBound = includesEvery([
    'if (!specification.requiredBasenames.length)',
    'paths.length !== 1',
    "safeZipArguments.push('--required-basename', basename)",
    'required_basename_cardinality_verified !== true',
    'findRequiredFiles(extractDir, specification.requiredBasenames)',
    'exact_required_file_cardinality_bound: true',
  ]);
  const exactRunArtifactEndpoint = source.includes('`${apiBase}/runs/${run.id}/artifacts?${encodeQuery({ per_page: 100, page })}`');
  const safeArgumentsStart = source.indexOf('const safeZipArguments = [');
  const safeInvocation = source.indexOf("execFileSync('python3', safeZipArguments");
  const safeReceiptAssertion = source.indexOf("safeZipReceipt.state !== 'VERIFIED_PASS_PRE_EXTRACTION'");
  const unzipInvocation = source.indexOf("execFileSync('unzip'");
  const safeArgumentRegion = safeArgumentsStart >= 0 && safeInvocation > safeArgumentsStart
    ? source.slice(safeArgumentsStart, safeInvocation)
    : '';
  const missingSafeArguments = REQUIRED_SAFE_ZIP_ARGUMENTS.filter(argument => !safeArgumentRegion.includes(`'${argument}'`));
  if (!safeArgumentRegion.includes("'--required-basename'")) missingSafeArguments.push('--required-basename');
  const safeZipPrevalidated = safeArgumentsStart >= 0
    && safeInvocation > safeArgumentsStart
    && safeReceiptAssertion > safeInvocation
    && unzipInvocation > safeReceiptAssertion
    && missingSafeArguments.length === 0
    && source.includes('required_basename_cardinality_verified !== true');
  const extractionPresent = unzipInvocation >= 0;

  const findings = [];
  const addFinding = (code, marker) => findings.push({ code, path: file, line: lineAt(source, markerIndex(marker)) });
  if (!paginationBound || !exactRunArtifactEndpoint) addFinding('GOVERNED_RESTORE_PAGINATION_RECONCILIATION_MISSING', 'collectCompletePages');
  if (!producerBound) addFinding('GOVERNED_RESTORE_EXACT_PRODUCER_BINDING_MISSING', 'validateProducerRun');
  if (!artifactCardinalityBound) addFinding('GOVERNED_RESTORE_ARTIFACT_CARDINALITY_MISSING', 'matches.length');
  if (!digestBound) addFinding('GOVERNED_RESTORE_DIGEST_BINDING_MISSING', 'archiveDigest');
  if (!requiredFileCardinalityBound) addFinding('GOVERNED_RESTORE_REQUIRED_FILE_CARDINALITY_MISSING', 'findRequiredFiles');
  if (!safeZipPrevalidated) addFinding('GOVERNED_RESTORE_SAFE_ZIP_PREVALIDATION_MISSING', 'safeZipArguments');
  if (!extractionPresent) addFinding('GOVERNED_RESTORE_EXTRACTION_BOUNDARY_MISSING', 'restoreExactArtifact');

  const extractions = extractionPresent ? [{
    path: file,
    line: lineAt(source, unzipInvocation),
    archive: 'archivePath',
    kind: 'GOVERNED_RESTORE_RAW_ZIP_EXTRACTION',
    prevalidated: safeZipPrevalidated,
    validation_after_extraction: safeInvocation > unzipInvocation,
    incomplete_prevalidation_arguments: missingSafeArguments,
  }] : [];
  const lookups = exactRunArtifactEndpoint ? [{
    path: file,
    line: lineAt(source, source.indexOf('`${apiBase}/runs/${run.id}/artifacts?')),
    kind: 'GOVERNED_RESTORE_ARTIFACT_LOOKUP',
    endpoint: '${apiBase}/runs/${run.id}/artifacts?page=<bounded>',
    scope: 'EXACT_RUN',
    exact_run_scoped: true,
    pagination_complete: paginationBound,
    broad_first_result: false,
    cardinality_bound: artifactCardinalityBound,
    digest_bound: digestBound,
    producer_provenance_bound: producerBound,
    missing_provenance_components: producerBound ? [] : ['governed_restore_exact_producer_contract'],
  }] : [];
  return { findings, extractions, lookups };
}

function contextWindow(source, offset, radius = 32) {
  const lines = source.split('\n');
  const lineIndex = source.slice(0, offset).split('\n').length - 1;
  return lines.slice(Math.max(0, lineIndex - radius), Math.min(lines.length, lineIndex + radius + 1)).join('\n');
}

function provenanceComponents(source) {
  return {
    run_id: /(?:workflow_run\??\.id|run\??\.id|RUN_ID|run_id)/.test(source),
    workflow_identity: /(?:workflow_run\??\.(?:path|name)|run\??\.(?:path|name)|WORKFLOW_(?:PATH|NAME)|actions\/workflows\/)/.test(source),
    source_sha: /(?:head_sha|headSha|SOURCE_SHA|GITHUB_SHA)/.test(source),
    event: /(?:\.event\b|event_name|GITHUB_EVENT_NAME)/.test(source),
    terminal_success: /(?:\.conclusion\b|\.status\b|conclusion|completed)/.test(source) && /success/.test(source),
  };
}

function cardinalityBindingIndex(source) {
  const patterns = [
    /(?:length|total_count|COUNT|count)[^\n;]{0,100}(?:===?|!==?|-[en]q)\s*["']?1\b/,
    /(?:===?|!==?)\s*1[^\n;]{0,100}(?:length|total_count|COUNT|count)/,
    /test\s+[^\n]{0,120}\s-[en]q\s+["']?1\b/,
    /\$\{#[A-Za-z_][A-Za-z0-9_]*\[@\]\}[^\n]{0,80}-[en]q\s+["']?1\b/,
  ];
  const indexes = patterns.map(pattern => source.search(pattern)).filter(index => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function hasCardinalityBinding(source) {
  return cardinalityBindingIndex(source) >= 0;
}

function hasDigestBinding(source) {
  return /(?:artifact(?:_|\.)?digest|ARTIFACT_DIGEST|\.digest\b)/i.test(source)
    && /(?:sha256:\[a-f0-9\]|sha256:\[0-9a-f\]|expected-digest|64\}\$|64\}\/?)/i.test(source);
}

function paginationComplete(source, endpoint) {
  if (/--paginate\b/.test(source)) return true;
  const explicitPage = /(?:[?&]page=\$?\{?[A-Za-z_][A-Za-z0-9_]*\}?|searchParams\.set\(\s*['"]page['"])/.test(endpoint + source);
  const pageLoop = /(?:for|while)\s*[\s(]/.test(source) && /(?:length|total_count|Link|hasNextPage)/.test(source);
  const responseCompletenessProof = /total_count[^\n;]{0,120}(?:===?|!==?)[^\n;]{0,120}(?:artifacts|length)/.test(source)
    || /(?:artifacts|length)[^\n;]{0,120}(?:===?|!==?)[^\n;]{0,120}total_count/.test(source);
  return (explicitPage && pageLoop) || responseCompletenessProof;
}

function broadFirstResult(source) {
  const broadIndex = source.search(/\]\s*\[\s*0\s*\]|\.\s*\[\s*0\s*\]|\b(?:artifacts|matches|results|items)\s*\[\s*0\s*\]|\.find\s*\(|\bhead\s+(?:-n\s*)?1\b|\bfirst\s*\(/);
  if (broadIndex < 0) return false;
  const cardinalityIndex = cardinalityBindingIndex(source);
  return cardinalityIndex < 0 || broadIndex < cardinalityIndex;
}

function analyzeLookups(file, source, startLine, kind) {
  const records = [];
  const patterns = [
    { scope: 'REPOSITORY_GLOBAL', regex: /\/actions\/artifacts\?[^"'`\s)]*/g },
    { scope: 'EXACT_RUN', regex: /\/actions\/runs\/[^/"'`\s]+\/artifacts(?!\/)(?:\?[^"'`\s)]*)?/g },
  ];
  for (const { scope, regex } of patterns) {
    for (const match of source.matchAll(regex)) {
      const context = contextWindow(source, match.index);
      const provenance = provenanceComponents(context);
      const missingProvenance = Object.entries(provenance).filter(([, present]) => !present).map(([name]) => name);
      records.push({
        path: file,
        line: startLine + lineAt(source, match.index) - 1,
        kind,
        endpoint: match[0],
        scope,
        exact_run_scoped: scope === 'EXACT_RUN',
        pagination_complete: paginationComplete(context, match[0]),
        broad_first_result: broadFirstResult(context),
        cardinality_bound: hasCardinalityBinding(context),
        digest_bound: hasDigestBinding(context),
        producer_provenance_bound: missingProvenance.length === 0,
        missing_provenance_components: missingProvenance,
      });
    }
  }
  return records.sort((a, b) => a.line - b.line || a.endpoint.localeCompare(b.endpoint));
}

function invokedKidultsHelpers(source) {
  const helpers = new Set();
  const patterns = [
    /\bnode(?:\s+--[A-Za-z0-9_-]+)*\s+((?:\.\/)?scripts\/kidults\/[A-Za-z0-9_./-]+\.(?:mjs|js))\b/g,
    /\bpython3?\s+((?:\.\/)?scripts\/kidults\/[A-Za-z0-9_./-]+\.py)\b/g,
    /\bexecFileSync\s*\(\s*process\.execPath\s*,\s*\[\s*['"]((?:\.\/)?scripts\/kidults\/[A-Za-z0-9_./-]+\.(?:mjs|js))['"]/g,
  ];
  for (const regex of patterns) {
    for (const match of source.matchAll(regex)) helpers.add(normalizePath(match[1]));
  }
  return [...helpers].sort();
}

function finding(code, record, detail = {}) {
  return { code, path: record.path, line: record.line, ...detail };
}

export function analyzeSources({ workflows, helpers = {}, enforceCriticalPresence = false }) {
  const extractions = [];
  const lookups = [];
  const helperContractFindings = [];
  const reachableHelpers = new Set();
  let runBlocksScanned = 0;
  for (const [file, source] of Object.entries(workflows).sort(([a], [b]) => a.localeCompare(b))) {
    const blocks = workflowRunBlocks(source);
    runBlocksScanned += blocks.length;
    for (const block of blocks) {
      extractions.push(...analyzeWorkflowExtractions(file, block));
      lookups.push(...analyzeLookups(file, block.source, block.start_line, 'WORKFLOW_ARTIFACT_LOOKUP'));
      for (const helper of invokedKidultsHelpers(block.source)) reachableHelpers.add(helper);
    }
  }

  for (const helper of TARGET_REACHABLE_HELPERS.filter(item => reachableHelpers.has(item))) {
    const source = helpers[helper];
    if (source === undefined) continue;
    if (helper === GOVERNED_RESTORE_HELPER) {
      const governed = analyzeGovernedRestoreHelper(helper, source);
      extractions.push(...governed.extractions);
      lookups.push(...governed.lookups);
      helperContractFindings.push(...governed.findings);
    } else {
      extractions.push(...analyzeHelperExtractions(helper, source));
      lookups.push(...analyzeLookups(helper, source, 1, 'REACHABLE_HELPER_ARTIFACT_LOOKUP'));
    }
  }

  const findings = [...helperContractFindings];
  for (const record of extractions) {
    if (!record.prevalidated) findings.push(finding('RAW_ZIP_EXTRACTION_WITHOUT_PREVALIDATION', record, { archive: record.archive, kind: record.kind }));
    if (record.validation_after_extraction) findings.push(finding('SAFE_ZIP_VALIDATION_AFTER_EXTRACTION', record, { archive: record.archive, kind: record.kind }));
    if (record.incomplete_prevalidation_arguments.length) {
      findings.push(finding('SAFE_ZIP_PREVALIDATION_ARGUMENTS_MISSING', record, { archive: record.archive, missing: record.incomplete_prevalidation_arguments }));
    }
  }
  for (const record of lookups) {
    if (!record.exact_run_scoped) findings.push(finding('EXACT_RUN_SCOPED_ARTIFACT_LOOKUP_MISSING', record, { endpoint: record.endpoint }));
    if (!record.pagination_complete) findings.push(finding('INCOMPLETE_ARTIFACT_PAGINATION', record, { endpoint: record.endpoint }));
    if (record.scope === 'REPOSITORY_GLOBAL' && !record.pagination_complete) {
      findings.push(finding('REPOSITORY_GLOBAL_FIRST_PAGE_ONLY', record, { endpoint: record.endpoint }));
    }
    if (record.broad_first_result) findings.push(finding('BROAD_FIRST_RESULT_SELECTION', record, { endpoint: record.endpoint }));
    if (!record.cardinality_bound) findings.push(finding('ARTIFACT_CARDINALITY_BINDING_MISSING', record, { endpoint: record.endpoint }));
    if (!record.digest_bound) findings.push(finding('ARTIFACT_DIGEST_BINDING_MISSING', record, { endpoint: record.endpoint }));
    if (!record.producer_provenance_bound) {
      findings.push(finding('ARTIFACT_PRODUCER_PROVENANCE_MISSING', record, {
        endpoint: record.endpoint,
        missing: record.missing_provenance_components,
      }));
    }
  }
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.code.localeCompare(b.code));

  if (enforceCriticalPresence) {
    for (const criticalPath of CRITICAL_PATHS) {
      const present = Object.hasOwn(workflows, criticalPath) || Object.hasOwn(helpers, criticalPath);
      const reachable = Object.hasOwn(workflows, criticalPath) || reachableHelpers.has(criticalPath);
      if (!present) findings.push({ code: 'CRITICAL_ARTIFACT_CONSUMER_MISSING', path: criticalPath, line: 0 });
      else if (!reachable) findings.push({ code: 'CRITICAL_ARTIFACT_HELPER_NOT_REACHABLE', path: criticalPath, line: 0 });
    }
    findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.code.localeCompare(b.code));
  }

  const criticalFindings = findings.filter(item => CRITICAL_PATHS.includes(item.path));
  const counts = {
    workflow_files_scanned: Object.keys(workflows).length,
    workflow_run_blocks_scanned: runBlocksScanned,
    reachable_helpers_discovered: reachableHelpers.size,
    reachable_artifact_helpers_scanned: TARGET_REACHABLE_HELPERS.filter(helper => reachableHelpers.has(helper) && Object.hasOwn(helpers, helper)).length,
    raw_zip_extraction_occurrences: extractions.length,
    safe_zip_prevalidated_extraction_occurrences: extractions.filter(item => item.prevalidated).length,
    unsafe_raw_zip_extraction_occurrences: extractions.filter(item => !item.prevalidated).length,
    artifact_lookup_occurrences: lookups.length,
    repository_global_artifact_lookup_occurrences: lookups.filter(item => item.scope === 'REPOSITORY_GLOBAL').length,
    exact_run_artifact_lookup_occurrences: lookups.filter(item => item.scope === 'EXACT_RUN').length,
    incomplete_artifact_pagination_occurrences: lookups.filter(item => !item.pagination_complete).length,
    repository_global_first_page_only_occurrences: lookups.filter(item => item.scope === 'REPOSITORY_GLOBAL' && !item.pagination_complete).length,
    broad_first_result_occurrences: lookups.filter(item => item.broad_first_result).length,
    missing_artifact_cardinality_binding_occurrences: lookups.filter(item => !item.cardinality_bound).length,
    missing_artifact_digest_binding_occurrences: lookups.filter(item => !item.digest_bound).length,
    missing_artifact_producer_provenance_occurrences: lookups.filter(item => !item.producer_provenance_bound).length,
    finding_occurrences: findings.length,
    critical_finding_occurrences: criticalFindings.length,
  };

  const critical = Object.fromEntries(CRITICAL_PATHS.map(criticalPath => {
    const pathExtractions = extractions.filter(item => item.path === criticalPath);
    const pathLookups = lookups.filter(item => item.path === criticalPath);
    const pathFindings = criticalFindings.filter(item => item.path === criticalPath);
    return [criticalPath, {
      present: Object.hasOwn(workflows, criticalPath) || Object.hasOwn(helpers, criticalPath),
      reachable: Object.hasOwn(workflows, criticalPath) || reachableHelpers.has(criticalPath),
      unsafe_raw_zip_extractions: pathExtractions.filter(item => !item.prevalidated).length,
      repository_global_first_page_only: pathLookups.filter(item => item.scope === 'REPOSITORY_GLOBAL' && !item.pagination_complete).length,
      broad_first_result_selections: pathLookups.filter(item => item.broad_first_result).length,
      missing_exact_run_scope: pathLookups.filter(item => !item.exact_run_scoped).length,
      missing_cardinality_bindings: pathLookups.filter(item => !item.cardinality_bound).length,
      missing_digest_bindings: pathLookups.filter(item => !item.digest_bound).length,
      missing_producer_provenance_bindings: pathLookups.filter(item => !item.producer_provenance_bound).length,
      finding_occurrences: pathFindings.length,
      acceptance_passed: pathFindings.length === 0,
    }];
  }));

  const state = findings.length === 0 ? 'VERIFIED_PASS' : 'HOLD';
  return {
    id: 'kidults-estate-artifact-consumption-boundary-validation-v1',
    version: '1.0.0',
    state,
    observed_at: new Date().toISOString(),
    exit_code: state === 'VERIFIED_PASS' ? 0 : 2,
    hold: state === 'HOLD' ? {
      gate_or_policy_reference: 'ESTATE_ARTIFACT_CONSUMPTION_BOUNDARY_V1',
      release_condition: 'All estate findings, including every critical-path finding, must equal zero.',
    } : null,
    authority_boundary: {
      detector_authority: 'READ_ONLY',
      repository_mutation_performed: false,
      credentialed_external_mutation_performed: false,
      production: 'HOLD',
      public_release: 'HOLD',
      g5: 'EXPLICIT_APPROVAL_REQUIRED',
    },
    principle_effects: {
      autonomous_effect: 'Fail-closed static detection prevents autonomous consumers from silently selecting stale or unsafe artifacts.',
      global_effect: 'Every workflow file is dynamically discovered; the active low-risk discovery helper is included when reachable.',
      irreplaceable_value_effect: 'Exact producer, digest, and cardinality bindings protect owned lineage from artifact substitution.',
      transparency_effect: 'Every residual is reported with a stable code, repository path, line, and category count.',
    },
    acceptance: {
      estate_unsafe_raw_zip_extractions_must_equal: 0,
      estate_incomplete_artifact_pagination_must_equal: 0,
      estate_missing_exact_producer_digest_cardinality_bindings_must_equal: 0,
      critical_paths_must_have_zero_findings: true,
    },
    counts,
    critical,
    reachable_helpers: [...reachableHelpers].sort(),
    findings,
  };
}

export function scanEstate(root = process.cwd()) {
  const workflowAbsoluteRoot = path.join(root, WORKFLOW_ROOT);
  const workflowFiles = walkFiles(workflowAbsoluteRoot, file => /\.ya?ml$/.test(file));
  const workflows = Object.fromEntries(workflowFiles.map(absolute => {
    const relative = normalizePath(path.relative(root, absolute));
    return [relative, fs.readFileSync(absolute, 'utf8')];
  }));
  const helpers = {};
  for (const helper of TARGET_REACHABLE_HELPERS) {
    const absolute = path.resolve(root, helper);
    const relative = normalizePath(path.relative(root, absolute));
    if (relative.startsWith('../') || path.isAbsolute(relative) || !fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) continue;
    helpers[helper] = fs.readFileSync(absolute, 'utf8');
  }
  return analyzeSources({ workflows, helpers, enforceCriticalPresence: true });
}

function main() {
  const rootArgumentIndex = process.argv.indexOf('--root');
  const root = rootArgumentIndex >= 0 ? path.resolve(process.argv[rootArgumentIndex + 1] ?? '') : process.cwd();
  const report = scanEstate(root);
  const stream = report.state === 'VERIFIED_PASS' ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.exit_code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
