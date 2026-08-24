import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_ROOT = '.github/workflows';
const FULL_COMMIT_ACTION = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/;
const DIGEST_PINNED_CONTAINER = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/;

function workflowFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) files.push(entryPath);
    }
  };
  visit(root);
  return files.sort();
}

function parseUsesLine(line) {
  const match = line.match(/^\s*-?\s*uses\s*:\s*(.*?)\s*$/i);
  if (!match) return null;
  const value = match[1].replace(/\s+#.*$/, '').trim();
  const reference = /^(['"]).*\1$/.test(value) ? value.slice(1, -1).trim() : value;
  return {
    reference,
    hasVersionAnnotation: /\s+#\s*v[0-9][A-Za-z0-9_.-]*\s*$/i.test(match[1])
  };
}

function referenceFinding(reference) {
  if (!reference) return 'EMPTY_ACTION_REF';
  if (reference.startsWith('./')) return null;
  if (reference.startsWith('docker://')) {
    return DIGEST_PINNED_CONTAINER.test(reference) ? null : 'MUTABLE_OR_NONDIGEST_CONTAINER_REF';
  }
  return FULL_COMMIT_ACTION.test(reference) ? null : 'MUTABLE_OR_NONFULL_ACTION_REF';
}

// GitHub interprets workflow keys after YAML escape, alias, tag and merge resolution.
// Decode quoted key candidates and reject non-canonical key construction so a semantic
// `uses` key cannot evade the literal reference inventory.
function decodeDoubleQuotedScalar(text, start) {
  const simpleEscapes = new Map([
    ['0', '\0'], ['a', '\x07'], ['b', '\b'], ['t', '\t'], ['n', '\n'], ['v', '\v'],
    ['f', '\f'], ['r', '\r'], ['e', '\x1b'], [' ', ' '], ['"', '"'], ['/', '/'],
    ['\\', '\\'], ['N', '\u0085'], ['_', '\u00a0'], ['L', '\u2028'], ['P', '\u2029']
  ]);
  let decoded = '';
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') return { decoded, end: index };
    if (character !== '\\') {
      decoded += character;
      continue;
    }
    const escape = text[index + 1];
    if (escape === '\n' || escape === '\r') {
      index += escape === '\r' && text[index + 2] === '\n' ? 2 : 1;
      while (text[index + 1] === ' ' || text[index + 1] === '\t') index += 1;
      continue;
    }
    const widths = { x: 2, u: 4, U: 8 };
    if (Object.hasOwn(widths, escape)) {
      const width = widths[escape];
      const hex = text.slice(index + 2, index + 2 + width);
      if (!new RegExp(`^[0-9a-fA-F]{${width}}$`).test(hex)) return null;
      const codePoint = Number.parseInt(hex, 16);
      if (codePoint > 0x10ffff) return null;
      decoded += String.fromCodePoint(codePoint);
      index += width + 1;
      continue;
    }
    if (!simpleEscapes.has(escape)) return null;
    decoded += simpleEscapes.get(escape);
    index += 1;
  }
  return null;
}

function stripYamlComment(line) {
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (doubleQuoted && character === '\\') {
      index += 1;
      continue;
    }
    if (!doubleQuoted && character === "'") {
      if (singleQuoted && line[index + 1] === "'") {
        index += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
      continue;
    }
    if (!singleQuoted && character === '"') {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    if (!singleQuoted && !doubleQuoted && character === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function blockScalarBaseIndent(line) {
  const uncommented = stripYamlComment(line).trimEnd();
  const indicator = uncommented.match(/[|>][1-9+-]{0,2}\s*$/);
  if (!indicator) return null;
  const leading = uncommented.match(/^\s*/)?.[0].length || 0;
  const prefix = uncommented.slice(leading, indicator.index);
  return /^-\s+/.test(prefix) && prefix.includes(':') ? leading + 2 : leading;
}

function quotedKeyCandidates(line) {
  const candidates = new Set();
  const canonicalStart = line.match(/^\s*(?:-\s+)*(?:(?:![^\s]+|&[^\s,{}\[\]"']+)\s+)*"/);
  if (canonicalStart) candidates.add(canonicalStart[0].length - 1);
  const flowStart = /[{\[,]\s*(?:(?:![^\s,{}\[\]]+|&[^\s,{}\[\]"']+)\s+)*"/g;
  for (const match of line.matchAll(flowStart)) candidates.add(match.index + match[0].lastIndexOf('"'));
  return [...candidates].sort((left, right) => left - right);
}

function semanticKeyFindings(name, text) {
  const findings = [];
  const lines = text.split('\n');
  let offset = 0;
  let blockScalar = null;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex].replace(/\r$/, '');
    const indent = rawLine.match(/^ */)?.[0].length || 0;
    const blank = rawLine.trim() === '';
    if (blockScalar) {
      if (blank) {
        offset += lines[lineIndex].length + 1;
        continue;
      }
      if (blockScalar.contentIndent === null && indent > blockScalar.baseIndent) {
        blockScalar.contentIndent = indent;
      }
      if (blockScalar.contentIndent !== null && indent >= blockScalar.contentIndent) {
        offset += lines[lineIndex].length + 1;
        continue;
      }
      blockScalar = null;
    }

    const uncommented = stripYamlComment(rawLine);
    for (const candidate of quotedKeyCandidates(uncommented)) {
      const parsed = decodeDoubleQuotedScalar(text, offset + candidate);
      if (!parsed) continue;
      let cursor = parsed.end + 1;
      while (/\s/.test(text[cursor] || '')) cursor += 1;
      if (parsed.decoded.toLowerCase() === 'uses' && text[cursor] === ':') {
        findings.push(`${name}:${lineIndex + 1}:NONCANONICAL_ESCAPED_USES_KEY`);
      }
    }

    const baseIndent = blockScalarBaseIndent(rawLine);
    if (baseIndent !== null) blockScalar = { baseIndent, contentIndent: null };
    offset += lines[lineIndex].length + 1;
  }
  return findings;
}

function findingsFor(name, text) {
  const findings = semanticKeyFindings(name, text);
  const refs = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const parsed = parseUsesLine(line);
    if (!parsed) {
      const uncommented = stripYamlComment(line);
      // Complex, alias and merge keys are unnecessary in canonical Actions syntax and
      // can synthesize a `uses` key only after YAML parsing, so they fail closed.
      if (/^\s*(?:-\s*)?\?\s/.test(uncommented) || /[{,]\s*\?\s/.test(uncommented)) {
        findings.push(`${name}:${index + 1}:NONCANONICAL_COMPLEX_MAPPING_KEY:${line.trim()}`);
      }
      if (/(?:^|[{,]|-\s)\s*\*[^\s,{}\[\]*]+?\s*:/.test(uncommented)) {
        findings.push(`${name}:${index + 1}:NONCANONICAL_ALIAS_MAPPING_KEY:${line.trim()}`);
      }
      if (/(?:^|[{,]|-\s)\s*<<\s*:/.test(uncommented)) {
        findings.push(`${name}:${index + 1}:NONCANONICAL_MERGE_MAPPING_KEY:${line.trim()}`);
      }
      if (/(?:\buses\s*:|['"]uses['"]\s*:)/i.test(uncommented) || /^\s*-?\s*\?\s*['"]?uses['"]?\s*$/i.test(uncommented)) {
        findings.push(`${name}:${index + 1}:NONCANONICAL_USES_SYNTAX:${line.trim()}`);
      }
      continue;
    }
    const finding = referenceFinding(parsed.reference);
    refs.push({
      line: index + 1,
      reference: parsed.reference,
      local: parsed.reference.startsWith('./'),
      container: parsed.reference.startsWith('docker://'),
      has_version_annotation: parsed.hasVersionAnnotation
    });
    if (finding) findings.push(`${name}:${index + 1}:${finding}:${parsed.reference || '<EMPTY>'}`);
  }
  return { findings, refs };
}

const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const mutationCases = [
  { name: 'mutable-tag', text: 'steps:\n  - uses: actions/checkout@v4', expected: 'MUTABLE_OR_NONFULL_ACTION_REF' },
  { name: 'mutable-branch', text: 'steps:\n  - uses: owner/action@main', expected: 'MUTABLE_OR_NONFULL_ACTION_REF' },
  { name: 'short-sha', text: 'steps:\n  - uses: owner/action@deadbeef', expected: 'MUTABLE_OR_NONFULL_ACTION_REF' },
  { name: 'expression-ref', text: 'steps:\n  - uses: owner/action@${{ github.sha }}', expected: 'MUTABLE_OR_NONFULL_ACTION_REF' },
  { name: 'empty-ref', text: 'steps:\n  - uses:', expected: 'EMPTY_ACTION_REF' },
  { name: 'container-tag', text: 'steps:\n  - uses: docker://alpine:3.21', expected: 'MUTABLE_OR_NONDIGEST_CONTAINER_REF' },
  { name: 'flow-style', text: 'steps: [{ uses: actions/checkout@v4 }]', expected: 'NONCANONICAL_USES_SYNTAX' },
  { name: 'quoted-key', text: `steps:\n  - "uses": owner/action@${sha}`, expected: 'NONCANONICAL_USES_SYNTAX' },
  { name: 'complex-key', text: `steps:\n  - ? uses\n    : owner/action@${sha}`, expected: 'NONCANONICAL_USES_SYNTAX' },
  { name: 'unicode-escaped-key', text: 'steps:\n  - "u\\u0073es": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'hex-escaped-key', text: 'steps:\n  - "u\\x73es": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'long-unicode-escaped-key', text: 'steps:\n  - "u\\U00000073es": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'flow-escaped-key', text: 'steps: [{"u\\u0073es": actions/checkout@v4}]', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'first-letter-escaped-key', text: 'steps:\n  - "\\x75ses": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'comment-quote-before-escaped-key', text: 'steps:\n  # "\n  - "u\\u0073es": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'scalar-quote-before-escaped-key', text: 'steps:\n  - run: \'echo "\'\n  - "u\\u0073es": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'plain-scalar-quote-before-escaped-key', text: 'steps:\n  - run: echo "\n  - "u\\u0073es": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'block-scalar-quote-before-escaped-key', text: 'steps:\n  - run: |\n      echo "\n  - "u\\u0073es": actions/checkout@v4', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'flow-comment-quote-before-escaped-key', text: '# "\nsteps: [{"u\\x73es": actions/checkout@v4}]', expected: 'NONCANONICAL_ESCAPED_USES_KEY' },
  { name: 'alias-explicit-key', text: 'steps:\n  - env:\n      KEY: &uses_key uses\n    ? *uses_key\n    : actions/checkout@v4', expected: 'NONCANONICAL_COMPLEX_MAPPING_KEY' },
  { name: 'alias-colon-key', text: 'steps:\n  - env:\n      KEY: &uses_key uses\n    *uses_key: actions/checkout@v4', expected: 'NONCANONICAL_ALIAS_MAPPING_KEY' },
  { name: 'tagged-complex-key', text: 'steps:\n  - ? !!str "uses"\n    : actions/checkout@v4', expected: 'NONCANONICAL_COMPLEX_MAPPING_KEY' },
  { name: 'merge-escaped-source', text: 'steps:\n  - &base {"u\\u0073es": actions/checkout@v4}\n  - <<: *base', expected: 'NONCANONICAL_MERGE_MAPPING_KEY' },
  { name: 'full-sha', text: `steps:\n  - uses: owner/action@${sha}`, expected: null },
  { name: 'full-sha-comment', text: `steps:\n  - uses: owner/action@${sha} # v1.2.3`, expected: null },
  { name: 'reusable-workflow-sha', text: `jobs:\n  call:\n    uses: owner/repository/.github/workflows/check.yml@${sha}`, expected: null },
  { name: 'local-action', text: 'steps:\n  - uses: ./.github/actions/local', expected: null },
  { name: 'container-digest', text: `steps:\n  - uses: docker://alpine@sha256:${digest}`, expected: null }
];

for (const mutation of mutationCases) {
  const { findings } = findingsFor(`MUTATION_${mutation.name}`, mutation.text);
  if (mutation.expected && !findings.some(finding => finding.includes(mutation.expected))) {
    throw new Error(`mutation self-test missed ${mutation.name}: expected ${mutation.expected}; got ${findings.join(',')}`);
  }
  if (!mutation.expected && findings.length) {
    throw new Error(`valid-reference self-test rejected ${mutation.name}: ${findings.join(',')}`);
  }
}

const workflows = workflowFiles(WORKFLOW_ROOT);
const findings = [];
const inventory = [];
for (const workflow of workflows) {
  const result = findingsFor(workflow, fs.readFileSync(workflow, 'utf8'));
  findings.push(...result.findings);
  inventory.push(...result.refs.map(ref => ({ workflow, ...ref })));
}

if (!workflows.length) findings.push(`${WORKFLOW_ROOT}:NO_WORKFLOW_FILES_DISCOVERED`);
if (!inventory.length) findings.push(`${WORKFLOW_ROOT}:NO_ACTION_REFERENCES_DISCOVERED`);

const external = inventory.filter(ref => !ref.local);
const containers = external.filter(ref => ref.container);
const commitPinned = external.filter(ref => !ref.container && FULL_COMMIT_ACTION.test(ref.reference));
const digestPinnedContainers = containers.filter(ref => DIGEST_PINNED_CONTAINER.test(ref.reference));
const versionAnnotated = commitPinned.filter(ref => ref.has_version_annotation);
const inventorySha256 = crypto.createHash('sha256')
  .update(JSON.stringify(inventory.map(({ workflow, line, reference }) => ({ workflow, line, reference }))))
  .digest('hex');
const state = findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS';

const receipt = {
  suite: 'KIDULTS_ESTATE_ACTION_PINNING_V1',
  agent_id: 'KIDULTS_SUPPLY_CHAIN_CONTROL',
  as_of: new Date().toISOString(),
  scope: `${WORKFLOW_ROOT}/**/*.yml|yaml`,
  state,
  facts: [
    `${workflows.length} workflow files were discovered dynamically`,
    `${external.length} external Action/container references were inspected`,
    `${commitPinned.length} repository Action references are pinned to full 40-character commit SHAs`,
    `${digestPinnedContainers.length} container Action references are pinned to sha256 digests`
  ],
  evidence_refs: [
    WORKFLOW_ROOT,
    'scripts/kidults/kpmo/validate-estate-action-pinning-v1.mjs',
    'scripts/kidults/kpmo/run-full-value-chain-redteam-suite-v1.mjs',
    'scripts/kidults/kpmo/validate-full-value-chain-critical-gate-bindings-v1.mjs'
  ],
  inferences: [],
  uncertainties: versionAnnotated.length === commitPinned.length ? [] : [
    `${commitPinned.length - versionAnnotated.length} immutable Action refs lack an optional human-readable release annotation`
  ],
  blockers: findings,
  actions_executed: ['READ_WORKFLOW_ESTATE', 'VALIDATE_EXTERNAL_ACTION_REFS', 'RUN_MUTATION_SELF_TESTS'],
  next_action: findings.length ? 'PIN_EVERY_REPORTED_REFERENCE_AND_RERUN' : 'KEEP_VALIDATOR_BOUND_TO_REQUIRED_MAIN_AND_PR_GATES',
  authority_boundary: {
    repository_mutated: false,
    external_system_mutated: false,
    secret_material_read: false,
    empirical_gate_effect: 'NONE'
  },
  operating_principle_effects: {
    autonomous: 'POSITIVE_FAIL_CLOSED_DEPENDENCY_EXECUTION',
    global: 'POSITIVE_ESTATE_WIDE_DYNAMIC_DISCOVERY',
    irreplaceable_value: 'POSITIVE_IMMUTABLE_BUILD_LINEAGE',
    transparency: 'POSITIVE_HASHED_MACHINE_READABLE_RECEIPT'
  },
  workflow_files: workflows.length,
  action_references: inventory.length,
  external_action_references: external.length,
  full_commit_action_references: commitPinned.length,
  container_action_references: containers.length,
  digest_pinned_container_action_references: digestPinnedContainers.length,
  version_annotated_action_references: versionAnnotated.length,
  mutation_cases: mutationCases.length,
  semantic_action_key_bypass_mutation_selftest: true,
  inventory_sha256: inventorySha256,
  findings,
  result: findings.length ? 'FAIL' : 'PASS',
  empirical_evidence_readiness: 'NOT_PROMOTED_BY_THIS_VALIDATOR',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'EXPLICIT_APPROVAL_REQUIRED'
};

console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exit(1);
