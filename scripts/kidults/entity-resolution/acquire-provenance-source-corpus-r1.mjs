import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const out = process.argv[2] || '/tmp/provenance-source-corpus-r1.json';
const activityStreamBase = 'https://data.getty.edu/provenance/activity-stream';
const activityPageBase = `${activityStreamBase}/page`;
const sourceId = 'getty-provenance-index-linked-open-data';
const targetPairCount = 120;
const maxActivityStreamPages = 30;
const concurrency = 12;
const requestTimeoutMs = 25_000;
const licenseEvidenceRefs = [
  'https://data.getty.edu/provenance/docs/',
  'https://creativecommons.org/publicdomain/zero/1.0/'
];
const entityUrlPattern = /^https:\/\/data\.getty\.edu\/provenance\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return sha(JSON.stringify(canonical(value)));
}

function pairId(activityReference, objectReference) {
  return `getty-activity-object:${createHash('sha256')
    .update(`${activityReference}\n${objectReference}`)
    .digest('hex')}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function typeNames(value) {
  return asArray(value).map(type => typeof type === 'string' ? type : type?.id || type?._label || '').filter(Boolean);
}

function hasType(entity, expected) {
  return typeNames(entity?.type ?? entity?.['@type']).includes(expected);
}

function entityReference(entity, fallback) {
  return String(entity?.id || entity?.['@id'] || fallback || '');
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchJson(url, purpose) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json, application/ld+json',
          'user-agent': 'KIDULTS-ER-EMPIRICAL-ACQUISITION/1.1'
        }
      });
      if (response.status === 404 || response.status === 410) {
        return { ok: false, status: response.status, payload: null };
      }
      if (!response.ok) {
        const error = new Error(`${purpose}_HTTP_${response.status}:${url}`);
        if (!retryableStatus(response.status) || attempt === 3) throw error;
        lastError = error;
      } else {
        return { ok: true, status: response.status, payload: await response.json() };
      }
    } catch (error) {
      lastError = error;
      if (attempt === 3 || (error?.name !== 'AbortError' && !String(error?.message).includes('_HTTP_'))) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise(resolve => setTimeout(resolve, 250 * attempt));
  }
  throw lastError;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function collectActivityEntries(page, streamPageReference) {
  const items = page?.orderedItems || page?.items || [];
  const entries = [];
  for (const item of items) {
    const object = item?.object;
    const activityReference = typeof object === 'string' ? object : object?.id || object?.['@id'];
    const streamActivityReference = String(item?.id || item?.['@id'] || '');
    if (!entityUrlPattern.test(String(activityReference || ''))) continue;
    if (typeof object === 'object' && object != null && !typeNames(object.type ?? object['@type']).includes('Activity')) continue;
    entries.push({
      activity_reference: String(activityReference),
      activity_stream_item_reference: streamActivityReference,
      activity_stream_page_reference: streamPageReference
    });
  }
  return entries;
}

function explicitTitleTransferLinks(activity) {
  const links = [];
  const parts = asArray(activity?.part);
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    const partTypes = typeNames(part?.type ?? part?.['@type']);
    if (!partTypes.includes('Acquisition')) continue;
    const targets = asArray(part?.transferred_title_of);
    for (let relationIndex = 0; relationIndex < targets.length; relationIndex += 1) {
      const target = targets[relationIndex];
      const objectReference = String(target?.id || target?.['@id'] || '');
      if (!entityUrlPattern.test(objectReference)) continue;
      if (!typeNames(target?.type ?? target?.['@type']).includes('HumanMadeObject')) continue;
      const linkEvidence = {
        part_index: partIndex,
        relation_index: relationIndex,
        part_type: partTypes,
        predicate: 'transferred_title_of',
        referenced_object: {
          id: objectReference,
          type: 'HumanMadeObject'
        }
      };
      links.push({
        object_reference: objectReference,
        source_path: `part[${partIndex}].transferred_title_of[${relationIndex}]`,
        link_evidence: linkEvidence,
        source_link_evidence_sha256: digest(linkEvidence)
      });
    }
  }
  return links;
}

const metrics = {
  activity_stream_pages_scanned: 0,
  activity_stream_items_observed: 0,
  distinct_activity_references_observed: 0,
  activity_payloads_fetched: 0,
  explicit_transferred_title_of_links_observed: 0,
  human_made_object_payloads_fetched: 0,
  evidence_bound_pairs_selected: 0
};
const seenActivityReferences = new Set();
const selectedActivityReferences = new Set();
const selectedObjectReferences = new Set();
const pairs = [];

for (let pageNumber = 1; pageNumber <= maxActivityStreamPages && pairs.length < targetPairCount; pageNumber += 1) {
  const streamPageReference = `${activityPageBase}/${pageNumber}`;
  const pageResult = await fetchJson(streamPageReference, 'GETTY_ACTIVITY_STREAM');
  if (!pageResult.ok) throw new Error(`GETTY_ACTIVITY_STREAM_PAGE_UNAVAILABLE:${pageNumber}`);
  metrics.activity_stream_pages_scanned += 1;
  metrics.activity_stream_items_observed += (pageResult.payload?.orderedItems || pageResult.payload?.items || []).length;

  const entries = collectActivityEntries(pageResult.payload, streamPageReference)
    .filter(entry => {
      if (seenActivityReferences.has(entry.activity_reference)) return false;
      seenActivityReferences.add(entry.activity_reference);
      return true;
    });
  metrics.distinct_activity_references_observed = seenActivityReferences.size;

  const activityResults = await mapLimit(entries, concurrency, async entry => {
    const result = await fetchJson(entry.activity_reference, 'GETTY_ACTIVITY');
    if (!result.ok) return null;
    metrics.activity_payloads_fetched += 1;
    const activity = result.payload;
    const resolvedReference = entityReference(activity, entry.activity_reference);
    if (resolvedReference !== entry.activity_reference || !hasType(activity, 'Activity')) return null;
    const links = explicitTitleTransferLinks(activity);
    metrics.explicit_transferred_title_of_links_observed += links.length;
    return { entry, activity, links };
  });

  const reservedObjectReferences = new Set(selectedObjectReferences);
  const candidates = [];
  for (const result of activityResults) {
    if (!result || selectedActivityReferences.has(result.entry.activity_reference)) continue;
    const link = result.links.find(candidate => !reservedObjectReferences.has(candidate.object_reference));
    if (!link) continue;
    reservedObjectReferences.add(link.object_reference);
    candidates.push({ ...result, link });
  }

  const objectResults = await mapLimit(candidates, concurrency, async candidate => {
    const result = await fetchJson(candidate.link.object_reference, 'GETTY_HUMAN_MADE_OBJECT');
    if (!result.ok) return null;
    metrics.human_made_object_payloads_fetched += 1;
    const object = result.payload;
    const resolvedReference = entityReference(object, candidate.link.object_reference);
    if (resolvedReference !== candidate.link.object_reference || !hasType(object, 'HumanMadeObject')) return null;
    return { ...candidate, object };
  });

  for (const result of objectResults) {
    if (!result || pairs.length >= targetPairCount) continue;
    const activityReference = result.entry.activity_reference;
    const objectReference = result.link.object_reference;
    if (selectedActivityReferences.has(activityReference) || selectedObjectReferences.has(objectReference)) continue;
    selectedActivityReferences.add(activityReference);
    selectedObjectReferences.add(objectReference);
    pairs.push({
      pair_id: pairId(activityReference, objectReference),
      source_id: sourceId,
      activity: {
        source_record_id: activityReference.split('/').pop(),
        source_reference: activityReference,
        source_type: 'Activity',
        source_payload_sha256: digest(result.activity),
        digest_scope: 'FULL_FETCHED_JSON_LD_RESPONSE'
      },
      object: {
        source_record_id: objectReference.split('/').pop(),
        source_reference: objectReference,
        source_type: 'HumanMadeObject',
        source_payload_sha256: digest(result.object),
        digest_scope: 'FULL_FETCHED_JSON_LD_RESPONSE'
      },
      explicit_source_link: {
        activity_reference: activityReference,
        object_reference: objectReference,
        predicate: 'transferred_title_of',
        source_path: result.link.source_path,
        link_evidence: result.link.link_evidence,
        source_link_evidence_sha256: result.link.source_link_evidence_sha256,
        verified_from_activity_payload: true
      },
      rights_state: 'ALLOW',
      rights_basis: 'CC0-1.0',
      rights_refs: [...licenseEvidenceRefs],
      license_evidence_refs: [...licenseEvidenceRefs],
      provenance_refs: [
        result.entry.activity_stream_page_reference,
        result.entry.activity_stream_item_reference,
        activityReference,
        objectReference
      ]
    });
  }
}

metrics.evidence_bound_pairs_selected = pairs.length;
if (pairs.length !== targetPairCount) throw new Error(`GETTY_EVIDENCE_BOUND_PAIRS_NE_${targetPairCount}:${pairs.length}`);
if (selectedActivityReferences.size !== targetPairCount) throw new Error('DISTINCT_ACTIVITY_COUNT_INVALID');
if (selectedObjectReferences.size !== targetPairCount) throw new Error('DISTINCT_OBJECT_COUNT_INVALID');
if (new Set(pairs.map(pair => pair.pair_id)).size !== targetPairCount) throw new Error('DUPLICATE_LINKED_PAIR');

const artifact = {
  id: 'kidults-er-provenance-source-corpus-r1',
  status: 'REAL_SOURCE_EXPLICITLY_LINKED_PAIR_CORPUS_UNLABELED',
  stratum_id: 'er-stratum-provenance-unique-object',
  source_id: sourceId,
  acquired_at: new Date().toISOString(),
  pair_count: pairs.length,
  distinct_activity_count: selectedActivityReferences.size,
  distinct_object_count: selectedObjectReferences.size,
  entity_payload_digest_count: pairs.length * 2,
  explicit_link_predicate: 'part[*].transferred_title_of[*]',
  labels_present: false,
  model_predictions_present: false,
  reviewer_assignment_required: true,
  production: 'HOLD',
  public_release: 'HOLD',
  acquisition_metrics: metrics,
  corpus_evidence_sha256: digest(pairs),
  pairs
};

await fs.writeFile(out, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  id: artifact.id,
  pair_count: artifact.pair_count,
  distinct_activity_count: artifact.distinct_activity_count,
  distinct_object_count: artifact.distinct_object_count,
  entity_payload_digest_count: artifact.entity_payload_digest_count,
  activity_stream_pages_scanned: metrics.activity_stream_pages_scanned,
  activity_payloads_fetched: metrics.activity_payloads_fetched,
  human_made_object_payloads_fetched: metrics.human_made_object_payloads_fetched,
  explicit_links_observed: metrics.explicit_transferred_title_of_links_observed,
  labels_present: false,
  model_predictions_present: false,
  production: 'HOLD',
  public_release: 'HOLD'
}));
