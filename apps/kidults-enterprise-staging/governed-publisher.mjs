import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_ROOT = process.env.KIDULTS_CONVERSION_DATA_DIR
  ? path.resolve(process.env.KIDULTS_CONVERSION_DATA_DIR, '..')
  : path.join(ROOT, '.local-data');
const INSIGHT_PATH = path.join(DATA_ROOT, 'insights', 'insight-snapshot.json');
const NORMALIZATION_PATH = path.join(DATA_ROOT, 'normalization', 'normalization-snapshot.json');
const PUBLISH_DIR = path.join(DATA_ROOT, 'publishing');
const SNAPSHOT_PATH = path.join(PUBLISH_DIR, 'publish-snapshot.json');
const LAST_GOOD_PATH = path.join(PUBLISH_DIR, 'last-good.json');

export function stableId(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function insightEvidence(insight) {
  return insight.evidence_ids ?? insight.evidence ?? [];
}

function insightKind(insight) {
  if (insight.kind) return insight.kind;
  if (String(insight.type ?? '').includes('risk')) return 'risk';
  if (String(insight.type ?? '').includes('opportunity') || String(insight.type ?? '').includes('momentum')) return 'opportunity';
  return 'signal';
}

function insightTitle(insight) {
  return insight.title ?? insight.headline ?? insight.subject ?? 'Governed insight';
}

export function evaluatePublicationGate(insight, policy = {}) {
  const minScore = Number(policy.min_score ?? 70);
  const minConfidence = Number(policy.min_confidence ?? 0.75);
  const minEvidence = Number(policy.min_evidence ?? 2);
  const reasons = [];
  const evidence = insightEvidence(insight);
  const kind = insightKind(insight);

  if (Number(insight.score ?? 0) < minScore) reasons.push('score_below_threshold');
  if (Number(insight.confidence ?? 0) < minConfidence) reasons.push('confidence_below_threshold');
  if (evidence.length < minEvidence) reasons.push('insufficient_evidence');
  if (kind === 'risk') reasons.push('risk_requires_human_review');

  return {
    eligible: reasons.length === 0,
    reasons,
    thresholds: { min_score: minScore, min_confidence: minConfidence, min_evidence: minEvidence }
  };
}

export function buildPublishPlan(insightSnapshot, normalizationSnapshot, policy = {}) {
  if (insightSnapshot?.schema_version !== 'kidults.insights.v1') {
    throw new Error('unsupported_insight_schema');
  }
  if (normalizationSnapshot?.schema_version !== 'kidults.normalized.v1') {
    throw new Error('unsupported_normalization_schema');
  }

  const candidates = (insightSnapshot.insights ?? []).map((insight) => {
    const gate = evaluatePublicationGate(insight, policy);
    const evidence = insightEvidence(insight);
    const kind = insightKind(insight);
    const title = insightTitle(insight);
    return {
      publication_id: stableId({ insight_id: insight.id, generated_at: insightSnapshot.generated_at }),
      insight_id: insight.id,
      kind,
      insight_type: insight.type,
      title,
      summary: insight.summary,
      recommendation: insight.recommendation,
      score: insight.score,
      confidence: insight.confidence,
      evidence_ids: evidence,
      status: gate.eligible ? 'publish_candidate' : 'held',
      gate
    };
  });

  const publishCandidates = candidates.filter((item) => item.status === 'publish_candidate');
  return {
    schema_version: 'kidults.publish-plan.v1',
    generated_at: new Date().toISOString(),
    source: {
      insight_generated_at: insightSnapshot.generated_at,
      normalization_generated_at: normalizationSnapshot.generated_at
    },
    counts: {
      evaluated: candidates.length,
      publish_candidates: publishCandidates.length,
      held: candidates.length - publishCandidates.length
    },
    candidates,
    outputs: {
      archive: publishCandidates.map(toArchiveRecord),
      executive_feed: publishCandidates.map(toExecutiveRecord),
      search_documents: publishCandidates.map(toSearchRecord)
    },
    production_promotion_authorized: process.env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED === 'true'
  };
}

function toArchiveRecord(item) {
  return {
    id: item.publication_id,
    type: 'governed_insight',
    title: item.title,
    summary: item.summary,
    score: item.score,
    confidence: item.confidence,
    lineage: item.evidence_ids,
    status: 'candidate'
  };
}

function toExecutiveRecord(item) {
  return {
    id: item.publication_id,
    headline: item.title,
    executive_summary: item.summary,
    recommended_action: item.recommendation,
    confidence: item.confidence,
    status: 'candidate'
  };
}

function toSearchRecord(item) {
  return {
    id: item.publication_id,
    title: item.title,
    text: [item.summary, item.recommendation].filter(Boolean).join(' '),
    type: 'insight',
    status: 'candidate'
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, filePath);
}

export async function buildPublishingSnapshot(options = {}) {
  const [insights, normalization] = await Promise.all([
    readJson(options.insightPath ?? INSIGHT_PATH),
    readJson(options.normalizationPath ?? NORMALIZATION_PATH)
  ]);
  const plan = buildPublishPlan(insights, normalization, options.policy);
  await atomicWrite(options.outputPath ?? SNAPSHOT_PATH, plan);
  if (plan.counts.publish_candidates > 0) {
    await atomicWrite(options.lastGoodPath ?? LAST_GOOD_PATH, plan);
  }
  return plan;
}

export async function readPublishingStatus(filePath = SNAPSHOT_PATH) {
  const snapshot = await readJson(filePath);
  return {
    ready: true,
    schema_version: snapshot.schema_version,
    generated_at: snapshot.generated_at,
    ...snapshot.counts,
    production_promotion_authorized: snapshot.production_promotion_authorized
  };
}

const command = process.argv[2];
if (command === 'build') {
  console.log(JSON.stringify(await buildPublishingSnapshot(), null, 2));
} else if (command === 'status') {
  console.log(JSON.stringify(await readPublishingStatus(), null, 2));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('Usage: node governed-publisher.mjs <build|status>');
  process.exitCode = 1;
}
