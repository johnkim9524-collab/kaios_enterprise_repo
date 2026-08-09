import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sourcePath = path.join(ROOT, 'scripts', 'a40-ga-certification.mjs');
const helperPath = path.join(ROOT, 'scripts', 'lib', 'a40-ga-static-config.mjs');

const importAnchor = "import { fileURLToPath } from 'node:url';\n";
const importLine = "import { DIRECT_CONTINUITY_RESOLVERS, FAILURE_CLASSIFICATIONS, STAGE_DEFINITIONS } from './lib/a40-ga-static-config.mjs';\n";
const startMarker = 'const STAGE_DEFINITIONS = [';
const endMarker = 'function stableSerialize(value) {';

const source = await fs.readFile(sourcePath, 'utf8');

if (source.includes(importLine) && !source.includes(startMarker)) {
  console.log('A40 structural refactor already applied.');
  process.exit(0);
}

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Unable to locate A40 static configuration block safely.');
}
if (!source.includes(importAnchor)) {
  throw new Error('Unable to locate A40 import anchor safely.');
}

const staticBlock = source.slice(start, end).trimEnd();
for (const requiredName of ['STAGE_DEFINITIONS', 'DIRECT_CONTINUITY_RESOLVERS', 'FAILURE_CLASSIFICATIONS']) {
  if (!staticBlock.includes(`const ${requiredName} =`)) {
    throw new Error(`A40 static block is missing ${requiredName}.`);
  }
}

const helperBody = `${[
  '// Static A40 certification metadata extracted from the executable gate.',
  '// Keep this module declarative: no I/O, no environment mutation, no authority changes.',
  '',
  staticBlock.replace(/^const (STAGE_DEFINITIONS|DIRECT_CONTINUITY_RESOLVERS|FAILURE_CLASSIFICATIONS) =/gm, 'export const $1 ='),
  '',
].join('\n')}`;

const withoutBlock = source.slice(0, start) + source.slice(end);
const updatedSource = withoutBlock.replace(importAnchor, importAnchor + importLine);

await fs.mkdir(path.dirname(helperPath), { recursive: true });
await fs.writeFile(helperPath, helperBody, 'utf8');
await fs.writeFile(sourcePath, updatedSource, 'utf8');

const originalLines = source.split(/\r?\n/).length;
const updatedLines = updatedSource.split(/\r?\n/).length;
const extractedLines = helperBody.split(/\r?\n/).length;
if (updatedLines >= originalLines) {
  throw new Error(`A40 structural refactor did not reduce executable file size (${originalLines} -> ${updatedLines}).`);
}
if (updatedLines > 1500) {
  throw new Error(`A40 executable remains above the P1 threshold after extraction: ${updatedLines} lines.`);
}

console.log(`A40 structural refactor applied: executable ${originalLines} -> ${updatedLines} lines; static module ${extractedLines} lines.`);
