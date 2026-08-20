import crypto from 'node:crypto';

const RIGHTS_ACTIONS = ['collect', 'store', 'transform'];

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function normalizeNumericGrade(rawGrade, {min = 0, max = 10, higherIsBetter = true} = {}) {
  const value = Number(rawGrade);
  if (!Number.isFinite(value) || max <= min || value < min || value > max) return null;
  const ratio = (value - min) / (max - min);
  return Number((higherIsBetter ? ratio : 1 - ratio).toFixed(6));
}

export function gradingAdmissionErrors(record) {
  const errors = [];
  for (const action of RIGHTS_ACTIONS) {
    if (record.rights?.[action] !== 'ALLOW') errors.push(`RIGHTS_${action.toUpperCase()}_NOT_ALLOWED`);
  }
  if (!record.lineage?.source_owner || !record.lineage?.source_record_ref) errors.push('LINEAGE_INCOMPLETE');
  if (!record.canonical_entity_id || !record.provider_item_id) errors.push('IDENTITY_INCOMPLETE');
  if (record.population?.scope === 'PROVIDER_CENSUS' && record.population?.as_of == null) errors.push('POPULATION_AS_OF_REQUIRED');
  return errors;
}

export function canonicalizeGradingEvidence(input) {
  const normalizedScore = input.grade?.normalized_score ?? normalizeNumericGrade(
    input.grade?.raw_grade,
    input.grade?.scale ?? {min: 0, max: 10, higherIsBetter: true}
  );
  const normalized = {
    schema_version: 'grading-evidence-v1',
    grading_evidence_id: input.grading_evidence_id,
    provider_id: input.provider_id,
    canonical_entity_id: input.canonical_entity_id,
    provider_item_id: input.provider_item_id,
    certification_number: input.certification_number ?? null,
    identity: {
      year: input.identity?.year ?? null,
      set: input.identity?.set ?? null,
      card_number: input.identity?.card_number ?? null,
      subject: input.identity?.subject ?? null,
      variant: input.identity?.variant ?? null,
      language: input.identity?.language ?? null
    },
    grade: {
      raw_grade: String(input.grade?.raw_grade ?? ''),
      scale_id: input.grade?.scale_id ?? 'UNKNOWN',
      normalized_score: normalizedScore,
      qualifiers: [...new Set(input.grade?.qualifiers ?? [])].sort()
    },
    population: {
      at_grade: input.population?.at_grade ?? null,
      higher: input.population?.higher ?? null,
      total: input.population?.total ?? null,
      scope: input.population?.scope ?? 'UNKNOWN',
      as_of: input.population?.as_of ?? null
    },
    observed_at: input.observed_at,
    rights: {
      collect: input.rights?.collect ?? 'UNKNOWN',
      store: input.rights?.store ?? 'UNKNOWN',
      transform: input.rights?.transform ?? 'UNKNOWN',
      internal_display: input.rights?.internal_display ?? 'UNKNOWN',
      redistribute: input.rights?.redistribute ?? 'UNKNOWN',
      retention_days: input.rights?.retention_days ?? null,
      terms_ref: input.rights?.terms_ref ?? null
    },
    lineage: {
      source_owner: input.lineage?.source_owner ?? '',
      source_record_ref: input.lineage?.source_record_ref ?? '',
      raw_digest: input.lineage?.raw_digest ?? sha256(input.raw ?? input),
      normalized_digest: 'sha256:'.padEnd(71, '0'),
      adapter_version: input.lineage?.adapter_version ?? 'unknown-adapter'
    },
    admission: {state: 'HOLD', reason_codes: [], confidence: input.admission?.confidence ?? 0}
  };
  normalized.lineage.normalized_digest = sha256({...normalized, lineage: {...normalized.lineage, normalized_digest: null}});
  const errors = gradingAdmissionErrors(normalized);
  normalized.admission = {
    state: errors.length ? 'HOLD' : 'ADMITTED',
    reason_codes: errors,
    confidence: input.admission?.confidence ?? 0
  };
  return normalized;
}

export function reconcileGradingEvidence(records) {
  const admitted = records.filter((r) => r.admission?.state === 'ADMITTED');
  const byEntity = new Map();
  for (const record of admitted) {
    const list = byEntity.get(record.canonical_entity_id) ?? [];
    list.push(record);
    byEntity.set(record.canonical_entity_id, list);
  }
  return [...byEntity.entries()].map(([canonical_entity_id, evidence]) => {
    const providerCensuses = evidence
      .filter((r) => r.population.scope === 'PROVIDER_CENSUS')
      .map((r) => ({
        provider_id: r.provider_id,
        at_grade: r.population.at_grade,
        higher: r.population.higher,
        total: r.population.total,
        as_of: r.population.as_of
      }));
    const scores = evidence.map((r) => r.grade.normalized_score).filter(Number.isFinite);
    return {
      canonical_entity_id,
      evidence_count: evidence.length,
      source_owner_count: new Set(evidence.map((r) => r.lineage.source_owner)).size,
      normalized_grade_range: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
      provider_censuses: providerCensuses,
      global_population: null,
      global_population_reason: 'PROVIDER_CENSUSES_ARE_NOT_SUMMED'
    };
  });
}

export function marketAdmissionErrors(event) {
  const errors = [];
  for (const action of RIGHTS_ACTIONS) {
    if (event.rights?.[action] !== 'ALLOW') errors.push(`RIGHTS_${action.toUpperCase()}_NOT_ALLOWED`);
  }
  if (!event.lineage?.source_family_id || !event.lineage?.evidence_id) errors.push('LINEAGE_INCOMPLETE');
  if (event.evidence_class === 'VERIFIED_SOLD_EVENT') {
    if (event.event_state !== 'SOLD') errors.push('SOLD_EVENT_STATE_MISMATCH');
    if (!Number.isFinite(event.price?.amount) || !event.price?.currency) errors.push('SOLD_PRICE_INCOMPLETE');
    if (!['HAMMER', 'ALL_IN_REALIZED', 'ACCEPTED_OFFER'].includes(event.price?.price_type)) errors.push('SOLD_PRICE_TYPE_INVALID');
  }
  return errors;
}

export function canonicalizeMarketEvent(input) {
  const event = structuredClone(input);
  event.schema_version = 'market-event-v1';
  event.lineage = {
    ...event.lineage,
    raw_digest: event.lineage?.raw_digest ?? sha256(input.raw ?? input),
    normalized_digest: event.lineage?.normalized_digest ?? sha256({...event, lineage: {...event.lineage, normalized_digest: null}})
  };
  const admissionErrors = marketAdmissionErrors(event);
  return {event, admission_errors: admissionErrors, admitted: admissionErrors.length === 0};
}

export function marketEventFingerprint(event) {
  const physical = event.physical_object_id ?? event.canonical_entity_id;
  const amount = event.price?.amount ?? 'NA';
  const currency = event.price?.currency ?? 'NA';
  return [physical, event.event_at, event.venue_id, event.event_state, amount, currency].join('|');
}

export function deduplicateMarketEvents(events) {
  const admitted = events.filter((x) => (x.event ? x.admitted : marketAdmissionErrors(x).length === 0)).map((x) => x.event ?? x);
  const groups = new Map();
  for (const event of admitted) {
    const key = marketEventFingerprint(event);
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  return [...groups.values()].map((group) => ({
    canonical_event: group[0],
    corroborating_source_owners: [...new Set(group.map((e) => e.lineage.source_family_id))].sort(),
    observation_count: group.length
  }));
}

export function computeMarketSignals(events) {
  const unique = deduplicateMarketEvents(events);
  const canonical = unique.map((x) => x.canonical_event);
  const sold = canonical.filter((e) => e.evidence_class === 'VERIFIED_SOLD_EVENT' && e.event_state === 'SOLD');
  const failed = canonical.filter((e) => e.evidence_class === 'FAILED_SALE_EVENT' || ['NO_SALE_RESERVE_NOT_MET', 'WITHDRAWN', 'EXPIRED'].includes(e.event_state));
  const terminalCount = sold.length + failed.length;
  const soldAmounts = sold.map((e) => e.price.amount).filter(Number.isFinite).sort((a, b) => a - b);
  let median = null;
  if (soldAmounts.length) {
    const middle = Math.floor(soldAmounts.length / 2);
    median = soldAmounts.length % 2 === 1 ? soldAmounts[middle] : (soldAmounts[middle - 1] + soldAmounts[middle]) / 2;
  }
  const sourceOwners = new Set(unique.flatMap((x) => x.corroborating_source_owners));
  return {
    unique_event_count: canonical.length,
    sold_event_count: sold.length,
    failed_sale_event_count: failed.length,
    transaction_activity_observed: sold.length,
    failed_sale_ratio: terminalCount ? Number((failed.length / terminalCount).toFixed(6)) : null,
    median_sold_price_unconverted: median,
    currency_set: [...new Set(sold.map((e) => e.price.currency).filter(Boolean))].sort(),
    source_owner_count: sourceOwners.size,
    liquidity_state: sold.length >= 2 ? 'OBSERVED_BOUNDED' : 'NOT_VERIFIED_INSUFFICIENT_EVENTS'
  };
}
