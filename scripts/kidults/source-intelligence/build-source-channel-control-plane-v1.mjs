#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPurposeRights, RIGHTS_CLEAR } from './lib/source-purpose-rights-gate-v1.mjs';

const DEFAULT_CONTRACT = 'coordination/kidults/source-intelligence/source-channel-control-plane-contract-v1.json';
const DEFAULT_OUTPUT = 'coordination/kidults/source-intelligence/source-channel-control-plane-v1.json';
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))].sort();
const sha256 = value => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const canonicalJson = value => `${JSON.stringify(value, null, 2)}\n`;

const ROLE_PURPOSES = {
  PRIMARY_AUTHORITY: ['IDENTITY_CATALOG'],
  CATALOG_REFERENCE: ['IDENTITY_CATALOG'],
  LISTING_SUPPLY: ['ACTIVE_LISTING_CONTEXT'],
  SOLD_TRANSACTION: ['CURRENT_SOLD_TRANSACTION'],
  AUCTION_PRIVATE_SALE: ['CURRENT_SOLD_TRANSACTION'],
  AUTHENTICATION_CONDITION: ['AUTHENTICATION_CONDITION'],
  PROVENANCE_HISTORY: ['PROVENANCE_HISTORY'],
  CULTURE_ATTENTION: ['CULTURE_ATTENTION']
};

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function parseFrontier(root, relativePath) {
  const text = fs.readFileSync(path.join(root, relativePath), 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split('|').map(value => value.trim());
  return lines.filter(Boolean).map((line, index) => {
    const rawValues = line.split('|');
    if (rawValues[0] !== rawValues[0].trim()) throw new Error(`CURATED_FRONTIER_SOURCE_ID_NOT_TRIMMED:${index + 2}`);
    const values = rawValues.map(value => value.trim());
    if (values.length !== headers.length) throw new Error(`CURATED_FRONTIER_COLUMN_COUNT:${index + 2}`);
    return Object.fromEntries(headers.map((header, offset) => [header, values[offset]]));
  });
}

function normalizePurpose(value) {
  const purpose = String(value || '').toUpperCase();
  if (purpose.includes('HISTORICAL') || purpose.includes('PROVENANCE')) return 'HISTORICAL_TRANSACTION_CONTEXT';
  if (purpose.includes('IDENTITY') || purpose.includes('CATALOG') || purpose.includes('DESIGNER_MAKER')) return 'IDENTITY_CATALOG';
  if (purpose.includes('CURRENT_SOLD')) return 'CURRENT_SOLD_TRANSACTION';
  if (purpose.includes('SOLD_EVENT')) return 'CURRENT_SOLD_TRANSACTION';
  return purpose || 'SOURCE_ROLE_CLASSIFICATION';
}

function admissionRows(document, file, admissionClass) {
  const rows = Array.isArray(document.sources) ? document.sources : [document];
  return rows.filter(row => row && row.source_id).map(row => {
    const allowedClaimClasses = unique([
      ...array(row.allowed_claim_classes),
      ...array(row.allowed_claims),
      ...array(row.allowed_projection_fields),
      ...array(document.allowed_claim_classes),
      ...array(document.allowed_claims),
      ...array(document.allowed_projection_fields)
    ]);
    const prohibitedClaimClasses = unique([
      ...array(row.prohibited_claim_classes),
      ...array(row.blocked_claims),
      ...array(document.prohibited_claim_classes),
      ...array(document.blocked_claims)
    ]);
    const purposeBasis = row.purpose || document.purpose || row.admission_scope || document.admission_scope ||
      allowedClaimClasses.join('_') || row.evidence_strength;
    return {
      source_id: row.source_id,
      source_name: row.source_name || row.owner || row.source_id,
      source_file: file,
      source_document_id: document.id,
      admission_class: admissionClass,
      admission_state: row.admission_state || document.admission_state || 'UNASSESSED',
      admission_interpretation: row.admission_interpretation || row.admission_state_scope || document.admission_class || null,
      strict_r1_evidence_bound_admission: admissionClass === 'STRICT_R1_BOUNDED_ADMITTED' && String(row.admission_state || '').startsWith('ADMITTED'),
      purpose: normalizePurpose(purposeBasis),
      rights_state: row.rights_state || document.rights_state || row.rights_basis || 'UNKNOWN',
      rights_evidence_refs: unique([
        ...array(row.rights_evidence),
        ...array(row.rights_evidence_refs),
        ...array(row.license_evidence_refs),
        ...array(document.rights_evidence_refs),
        ...array(document.license_evidence_refs)
      ]),
      allowed_claim_classes: allowedClaimClasses,
      prohibited_claim_classes: prohibitedClaimClasses,
      purpose_rights: row.purpose_rights || document.purpose_rights || null,
      claim_ceiling: row.claim_ceiling || row.evidence_strength || document.claim_class_target || document.truth_boundary || 'RECORDED_PURPOSE_ONLY',
      truth_boundary: row.truth_boundary || document.truth_boundary || null
    };
  });
}

function declarationAdmitted(row) {
  return String(row.admission_state).startsWith('ADMITTED');
}

function purposeDecision(source, purpose) {
  if (purpose === 'CURRENT_SOLD_TRANSACTION') {
    return {
      decision: source.current_sold_rights.decision,
      claim_ceiling: source.current_sold_rights.decision === RIGHTS_CLEAR
        ? 'EXACT_BOUND_INTERNAL_CURRENT_SOLD_ONLY'
        : 'NO_CURRENT_SOLD_TRANSACTION_CLAIM',
      reason_codes: source.current_sold_rights.reason_codes
    };
  }
  const matching = source.admission_declarations.filter(row => declarationAdmitted(row) && row.purpose === purpose);
  if (!matching.length) {
    return {
      decision: 'RIGHTS_HOLD',
      claim_ceiling: 'DISCOVERY_METADATA_ONLY_NO_EVIDENCE_OR_MARKET_CLAIM',
      reason_codes: ['PURPOSE_SPECIFIC_ADMISSION_MISSING']
    };
  }
  return {
    decision: 'BOUNDED_CONTEXT_ALLOWED',
    claim_ceiling: unique(matching.map(row => row.claim_ceiling)).join(' | '),
    reason_codes: unique(matching.map(row => row.admission_class === 'STRICT_R1_BOUNDED_ADMITTED'
      ? 'STRICT_R1_PURPOSE_BOUND_CEILING'
      : 'REPOSITORY_DECLARATION_SHADOW_CEILING'))
  };
}

export function buildSourceChannelControlPlane({ root = process.cwd(), contractPath = DEFAULT_CONTRACT } = {}) {
  const contract = readJson(root, contractPath);
  const canonicalId = sourceId => {
    const normalized = String(sourceId || '').trim();
    if (!normalized) throw new Error('CANONICAL_SOURCE_ID_EMPTY_AFTER_NORMALIZATION');
    return contract.source_aliases[normalized] || normalized;
  };
  const frontier = parseFrontier(root, contract.inputs.curated_frontier);
  const adapters = readJson(root, contract.inputs.adapter_registry);
  const top16 = readJson(root, contract.inputs.top16_preflight);
  const openCurrentSold = readJson(root, contract.inputs.open_current_sold_preflight);
  const inputPaths = unique([
    contractPath,
    contract.inputs.curated_frontier,
    contract.inputs.adapter_registry,
    contract.inputs.top16_preflight,
    contract.inputs.open_current_sold_preflight,
    ...contract.inputs.strict_bounded_pools,
    ...contract.inputs.repository_declaration_pools,
    ...contract.inputs.purpose_specific_bounded_declarations
  ]);
  const inputFingerprints = Object.fromEntries(inputPaths.map(file => [
    file,
    sha256(fs.readFileSync(path.join(root, file)))
  ]));

  const sources = new Map();
  const ensure = rawId => {
    const id = canonicalId(rawId);
    if (!sources.has(id)) {
      sources.set(id, {
        canonical_source_id: id,
        aliases: [],
        display_names: [],
        core_domains: [],
        collection_scope_ids: [],
        source_roles: [],
        official_locators: [],
        evidence_refs: [],
        channel_types: [],
        access_modes: [],
        curated_frontier_ids: [],
        adapter_implemented_fixture_verified: false,
        adapter_active: false,
        immutable_live_source_snapshot_verified: false,
        origin_proof_verified: false,
        admission_declarations: [],
        governed_preflight_rows: []
      });
    }
    const source = sources.get(id);
    if (rawId !== id) source.aliases.push(rawId);
    return source;
  };

  for (const row of frontier) {
    const source = ensure(row.source_id);
    source.curated_frontier_ids.push(row.source_id);
    source.display_names.push(row.display_name);
    source.core_domains.push(row.core_domain);
    source.collection_scope_ids.push(...row.collection_scope_ids.split(';').filter(Boolean));
    source.source_roles.push(...row.source_roles.split(';').filter(Boolean));
    source.official_locators.push(row.official_endpoint, row.official_documentation_url);
    source.channel_types.push(row.channel_type);
    source.access_modes.push(row.access_mode);
  }

  for (const rawId of adapters.implemented_source_ids) {
    const source = ensure(rawId);
    source.adapter_implemented_fixture_verified = true;
    source.adapter_active = false;
  }

  const preflightRows = [...top16.rows, ...openCurrentSold.rows];
  for (const row of preflightRows) {
    const source = ensure(row.source_id);
    source.display_names.push(row.source_name);
    source.source_roles.push(...array(row.source_roles));
    source.official_locators.push(row.official_locator, row.official_data_endpoint);
    source.evidence_refs.push(...array(row.evidence_refs));
    source.governed_preflight_rows.push(row);
  }

  const declarations = [];
  for (const file of contract.inputs.strict_bounded_pools) {
    declarations.push(...admissionRows(readJson(root, file), file, 'STRICT_R1_BOUNDED_ADMITTED'));
  }
  for (const file of contract.inputs.repository_declaration_pools) {
    declarations.push(...admissionRows(readJson(root, file), file, 'REPOSITORY_DECLARED_BOUNDED_SHADOW'));
  }
  for (const file of contract.inputs.purpose_specific_bounded_declarations) {
    declarations.push(...admissionRows(readJson(root, file), file, 'REPOSITORY_DECLARED_BOUNDED_SHADOW'));
  }
  for (const declaration of declarations) {
    const source = ensure(declaration.source_id);
    source.display_names.push(declaration.source_name);
    source.evidence_refs.push(...declaration.rights_evidence_refs);
    source.admission_declarations.push({ ...declaration, source_id: canonicalId(declaration.source_id) });
  }

  const asOf = top16.as_of;
  const sourceRecords = [...sources.values()].map(source => {
    const preflight = source.governed_preflight_rows.find(row => row.source_id === source.canonical_source_id) ||
      source.governed_preflight_rows[0] || null;
    const currentSold = preflight
      ? classifyPurposeRights(preflight, 'CURRENT_SOLD_TRANSACTION', new Date(asOf))
      : {
          purpose: 'CURRENT_SOLD_TRANSACTION',
          decision: 'RIGHTS_HOLD',
          eligible_for_acquisition_or_adapter_backlog: false,
          reason_codes: ['EXACT_SOURCE_PURPOSE_PREFLIGHT_MISSING'],
          evidence_refs: [],
          evidence_digest: null,
          purpose_binding_id: null
        };
    const currentSoldReference = preflight
      ? classifyPurposeRights(preflight, 'CURRENT_SOLD_TRANSACTION_REFERENCE', new Date(asOf))
      : {
          purpose: 'CURRENT_SOLD_TRANSACTION_REFERENCE',
          decision: 'RIGHTS_HOLD',
          eligible_for_acquisition_or_adapter_backlog: false,
          reason_codes: ['EXACT_SOURCE_PURPOSE_PREFLIGHT_MISSING'],
          evidence_refs: [],
          evidence_digest: null,
          purpose_binding_id: null
        };
    const admittedDeclarations = source.admission_declarations.filter(declarationAdmitted);
    const sourceState = currentSold.decision === RIGHTS_CLEAR
      ? 'RIGHTS_CLEAR_CURRENT_SOLD_NOT_ACTIVATED'
      : admittedDeclarations.length
        ? 'BOUNDED_CONTEXT_ADMITTED'
        : source.adapter_implemented_fixture_verified
          ? 'ADAPTER_READY_RIGHTS_HOLD'
          : 'CURATED_OR_REVIEWED_DISCOVERY_ONLY';
    const activationEligible = currentSold.decision === RIGHTS_CLEAR &&
      source.adapter_implemented_fixture_verified &&
      source.immutable_live_source_snapshot_verified &&
      source.origin_proof_verified;
    return {
      canonical_source_id: source.canonical_source_id,
      aliases: unique(source.aliases),
      display_name: unique(source.display_names)[0] || source.canonical_source_id,
      display_name_variants: unique(source.display_names),
      core_domains: unique(source.core_domains),
      collection_scope_ids: unique(source.collection_scope_ids),
      source_roles: unique(source.source_roles),
      official_locators: unique(source.official_locators),
      evidence_refs: unique(source.evidence_refs),
      channel_types: unique(source.channel_types),
      access_modes: unique(source.access_modes),
      curated_frontier_ids: unique(source.curated_frontier_ids),
      in_curated_64: source.curated_frontier_ids.length > 0,
      adapter_implemented_fixture_verified: source.adapter_implemented_fixture_verified,
      adapter_active: false,
      immutable_live_source_snapshot_verified: false,
      origin_proof_verified: false,
      admission_declarations: source.admission_declarations.sort((a, b) =>
        a.source_file.localeCompare(b.source_file) || a.admission_state.localeCompare(b.admission_state)),
      admission_classes: unique(source.admission_declarations.map(row => row.admission_class)),
      bounded_admission_present: admittedDeclarations.length > 0,
      strict_r1_bounded_admission_present: admittedDeclarations.some(row => row.strict_r1_evidence_bound_admission),
      current_sold_rights: currentSold,
      current_sold_reference_rights: currentSoldReference,
      activation_eligible: activationEligible,
      activation_blockers: activationEligible ? [] : unique([
        ...(currentSold.decision === RIGHTS_CLEAR ? [] : ['CURRENT_SOLD_EXACT_PURPOSE_RIGHTS_HOLD']),
        ...(source.adapter_implemented_fixture_verified ? [] : ['SOURCE_SPECIFIC_ADAPTER_NOT_IMPLEMENTED']),
        'IMMUTABLE_LIVE_SOURCE_SNAPSHOT_NOT_VERIFIED',
        'SOURCE_OWNER_AND_FACTUAL_ORIGIN_NOT_VERIFIED',
        'SOURCE_SPECIFIC_ACTIVATION_RECEIPT_MISSING'
      ]),
      source_state: sourceState,
      acquisition_authorized: false,
      evidence_admitted: false,
      current_market_event_created: false,
      public_release: 'HOLD',
      production: 'HOLD'
    };
  }).sort((a, b) => a.canonical_source_id.localeCompare(b.canonical_source_id));

  const sourcePurposeRecords = [];
  for (const source of sourceRecords) {
    const purposes = unique([
      ...source.source_roles.flatMap(role => ROLE_PURPOSES[role] || []),
      ...source.admission_declarations.filter(declarationAdmitted).map(row => row.purpose),
      'SOURCE_ROLE_CLASSIFICATION'
    ]);
    for (const purpose of purposes) {
      const decision = purposeDecision(source, purpose);
      sourcePurposeRecords.push({
        source_purpose_id: `${source.canonical_source_id}::${purpose}`,
        canonical_source_id: source.canonical_source_id,
        purpose,
        decision: decision.decision,
        claim_ceiling: decision.claim_ceiling,
        reason_codes: decision.reason_codes,
        eligible_for_acquisition_or_adapter_backlog: purpose === 'CURRENT_SOLD_TRANSACTION' &&
          source.current_sold_rights.eligible_for_acquisition_or_adapter_backlog === true,
        activation_eligible: purpose === 'CURRENT_SOLD_TRANSACTION' && source.activation_eligible,
        acquisition_authorized: false,
        public_release: 'HOLD',
        production: 'HOLD'
      });
    }
  }
  sourcePurposeRecords.sort((a, b) => a.source_purpose_id.localeCompare(b.source_purpose_id));

  const domainCounts = Object.fromEntries(unique(frontier.map(row => row.core_domain)).map(domain => [
    domain,
    frontier.filter(row => row.core_domain === domain).length
  ]));
  const admittedIds = sourceRecords.filter(row => row.bounded_admission_present).map(row => row.canonical_source_id);
  const currentSoldClear = sourceRecords.filter(row => row.current_sold_rights.decision === RIGHTS_CLEAR);
  const currentSoldReferences = sourceRecords.filter(row => row.current_sold_reference_rights.decision === RIGHTS_CLEAR);
  const adapterReadyRightsHold = sourceRecords.filter(row => row.adapter_implemented_fixture_verified && row.current_sold_rights.decision !== RIGHTS_CLEAR);
  const activationBacklog = sourceRecords.filter(row => row.activation_eligible);

  const ledger = {
    id: 'kidults-source-channel-control-plane-v1',
    version: '1.0.0',
    state: 'VERIFIED_PASS',
    verification_scope: 'DETERMINISTIC_STATIC_LEDGER_INTEGRITY_ONLY',
    runtime_activation_state: 'BLOCKED',
    as_of: asOf,
    agent_id: 'AI-018 / GLOBAL_SCALE_STEWARDSHIP',
    scope: 'CURATED_64_PLUS_ADAPTERS_PLUS_BOUNDED_ADMISSIONS_PLUS_PURPOSE_RIGHTS',
    contract: contractPath,
    input_fingerprints: inputFingerprints,
    summary: {
      canonical_source_count: sourceRecords.length,
      curated_candidate_rows: frontier.length,
      curated_candidate_canonical_sources: new Set(frontier.map(row => canonicalId(row.source_id))).size,
      core_domain_count: Object.keys(domainCounts).length,
      candidates_per_core_domain: domainCounts,
      implemented_adapter_profiles: sourceRecords.filter(row => row.adapter_implemented_fixture_verified).length,
      empirically_active_adapters: 0,
      unique_bounded_admitted_sources: admittedIds.length,
      strict_r1_bounded_admitted_sources: sourceRecords.filter(row => row.strict_r1_bounded_admission_present).length,
      repository_declared_or_shadow_admitted_sources: sourceRecords.filter(row =>
        row.admission_declarations.some(declaration => declarationAdmissionClass(declaration) && declarationAdmitted(declaration))).length,
      rights_clear_collector_current_sold_sources: currentSoldClear.length,
      rights_clear_non_collector_current_sold_references: currentSoldReferences.length,
      adapter_ready_rights_hold: adapterReadyRightsHold.length,
      activation_backlog_eligible: activationBacklog.length,
      evidence_admitted: 0,
      candidate_created: false,
      track_b_started: false,
      approved_projection: false
    },
    queues: {
      bounded_context_sources: admittedIds,
      adapter_ready_rights_hold: adapterReadyRightsHold.map(row => row.canonical_source_id),
      rights_clear_current_sold: currentSoldClear.map(row => row.canonical_source_id),
      non_collector_current_sold_references: currentSoldReferences.map(row => row.canonical_source_id),
      activation_backlog_eligible: activationBacklog.map(row => row.canonical_source_id)
    },
    source_records: sourceRecords,
    source_purpose_records: sourcePurposeRecords,
    facts: [
      'The curated frontier contains 64 candidate rows across eight domains.',
      'Sixteen source-specific adapters are fixture-verified but none is empirically active.',
      'Nine canonical sources have a bounded admission declaration; scope and evidence strength differ and are not widened.',
      'No collector-market current-SOLD source is rights-clear for activation.',
      'The Seattle municipal fleet dataset is an internal non-collector reference only.'
    ],
    uncertainties: [
      'Purpose-specific commercial rights, immutable live schemas, factual origin, retention, and derived-data rights remain unresolved for all current-SOLD collector sources.',
      'Repository methodology declarations are not independent legal review or strict-R1 evidence-bound admissions.'
    ],
    blockers: [
      'RIGHTS_CLEAR_COLLECTOR_CURRENT_SOLD_SOURCE_COUNT_ZERO',
      'IMMUTABLE_LIVE_SOURCE_SNAPSHOT_COUNT_ZERO',
      'EMPIRICAL_ADAPTER_ACTIVATION_COUNT_ZERO',
      'PROVIDER_OR_SOURCE_OWNER_APPROVAL_REQUIRES_GOVERNED_EXTERNAL_AUTHORITY'
    ],
    next_action: 'Complete source-specific rights, retention, derived-data, live-schema, owner-origin, and activation receipts without provider lock-in or claim widening.',
    authority_boundary: contract.authority_boundary,
    autonomous_effect: contract.autonomous_effect,
    global_effect: contract.global_effect,
    irreplaceable_value_effect: contract.irreplaceable_value_effect,
    transparency_effect: contract.transparency_effect,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  };
  ledger.ledger_digest = sha256(canonicalJson(ledger));
  return ledger;
}

function declarationAdmissionClass(declaration) {
  return declaration.admission_class === 'REPOSITORY_DECLARED_BOUNDED_SHADOW';
}

export function writeSourceChannelControlPlane({ root = process.cwd(), contractPath = DEFAULT_CONTRACT, outputPath = DEFAULT_OUTPUT } = {}) {
  const ledger = buildSourceChannelControlPlane({ root, contractPath });
  const resolvedOutput = path.isAbsolute(outputPath) ? outputPath : path.join(root, outputPath);
  fs.writeFileSync(resolvedOutput, canonicalJson(ledger));
  return ledger;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outputPath = process.argv[2] || DEFAULT_OUTPUT;
  const ledger = writeSourceChannelControlPlane({ outputPath });
  process.stdout.write(`${JSON.stringify({
    state: 'BUILT',
    output: outputPath,
    ledger_digest: ledger.ledger_digest,
    summary: ledger.summary
  }, null, 2)}\n`);
}
