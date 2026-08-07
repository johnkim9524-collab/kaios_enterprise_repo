import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicDir = path.join(root, 'public', 'public-enterprise-preview');
const apiDir = path.join(publicDir, 'api', 'v1');
const publishPath = path.join(root, '.local-data', 'publishing', 'publish-snapshot.json');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function buildBridgePayload(publishSnapshot, existingIntelligence = {}, existingSearch = []) {
  if (publishSnapshot?.schema_version !== 'kidults.publish-plan.v1') {
    throw new Error('publish_snapshot_schema_invalid');
  }

  const archive = publishSnapshot.outputs?.archive ?? [];
  const executive = publishSnapshot.outputs?.executive_feed ?? [];
  const governedSearch = publishSnapshot.outputs?.search_documents ?? [];
  const held = (publishSnapshot.candidates ?? []).filter((item) => item.status === 'held');

  const bridge = {
    schema_version: 'kidults.portal-bridge.v1',
    generated_at: new Date().toISOString(),
    source_generated_at: publishSnapshot.generated_at,
    production_promotion_authorized: publishSnapshot.production_promotion_authorized === true,
    counts: {
      publish_candidates: Number(publishSnapshot.counts?.publish_candidates ?? archive.length),
      held: Number(publishSnapshot.counts?.held ?? held.length),
      archive: archive.length,
      executive_feed: executive.length,
      search_documents: governedSearch.length
    },
    archive,
    executive_feed: executive,
    held: held.map((item) => ({
      publication_id: item.publication_id,
      insight_id: item.insight_id,
      title: item.title,
      reasons: item.gate?.reasons ?? []
    }))
  };

  const intelligence = {
    ...existingIntelligence,
    governed: {
      schema_version: bridge.schema_version,
      generated_at: bridge.generated_at,
      source_generated_at: bridge.source_generated_at,
      production_promotion_authorized: bridge.production_promotion_authorized,
      counts: bridge.counts,
      executive_feed: bridge.executive_feed,
      held: bridge.held
    }
  };

  const seen = new Set(existingSearch.map((item) => `${item.type}|${item.title}|${item.href ?? ''}`));
  const search = [...existingSearch];
  for (const item of governedSearch) {
    const candidate = {
      title: item.title,
      href: 'intelligence.html#governed-intelligence',
      type: 'Governed Intelligence',
      text: item.text,
      source: 'program2',
      publication_id: item.id
    };
    const key = `${candidate.type}|${candidate.title}|${candidate.href}`;
    if (!seen.has(key)) {
      seen.add(key);
      search.push(candidate);
    }
  }

  return { bridge, intelligence, search };
}

export async function buildPortalBridge(options = {}) {
  const input = options.publishPath ?? publishPath;
  const targetPublic = options.publicDir ?? publicDir;
  const targetApi = path.join(targetPublic, 'api', 'v1');
  const intelligencePath = path.join(targetPublic, 'intelligence-data.json');
  const searchPath = path.join(targetPublic, 'search-index.json');

  const [publishSnapshot, existingIntelligence, existingSearch] = await Promise.all([
    readJson(input),
    readJson(intelligencePath),
    readJson(searchPath)
  ]);

  const payload = buildBridgePayload(publishSnapshot, existingIntelligence, existingSearch);
  await Promise.all([
    writeJson(path.join(targetApi, 'governed-intelligence.json'), payload.bridge),
    writeJson(intelligencePath, payload.intelligence),
    writeJson(searchPath, payload.search)
  ]);
  return payload.bridge;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildPortalBridge();
    console.log(JSON.stringify({ ready: true, ...result.counts, production_promotion_authorized: result.production_promotion_authorized }));
  } catch (error) {
    console.error(JSON.stringify({ ready: false, error: error.message }));
    process.exitCode = 1;
  }
}
