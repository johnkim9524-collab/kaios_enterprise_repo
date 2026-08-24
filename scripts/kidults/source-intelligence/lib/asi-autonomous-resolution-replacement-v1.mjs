import { uniq, short } from './asi-autonomous-resolution-common-v1.mjs';
import { buildPurposeRightsIndex, RIGHTS_CLEAR } from './source-purpose-rights-gate-v1.mjs';

export function buildReplacement({ bindings, gate1, frontier, crosswalk, adapterContract, rightsPreflight, contract }) {
  const targetToLegacy = new Map();
  for (const record of crosswalk.records) for (const target of record.target_scope_ids || []) {
    if (!targetToLegacy.has(target)) targetToLegacy.set(target, []);
    targetToLegacy.get(target).push(record.legacy_scope_id);
  }
  const adapterProfiles = new Map(adapterContract.registered_source_profiles.map(([priorityRank, sourceId, verifiedAssignmentCount, targetClaims]) => [sourceId, {
    priority_rank: priorityRank, source_id: sourceId,
    verified_assignment_count: verifiedAssignmentCount, target_claims: targetClaims
  }]));
  const rightsIndex = buildPurposeRightsIndex(
    rightsPreflight,
    adapterContract.registered_source_profiles.map(([, sourceId]) => sourceId),
    'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION'
  );
  const frontierProfiles = frontier
    .filter((record) => adapterProfiles.has(record.source_id))
    .map((record) => ({
      ...record,
      collection_scope_ids: record.collection_scope_ids.split(';').filter(Boolean),
      source_roles: record.source_roles.split(';').filter(Boolean),
      ...adapterProfiles.get(record.source_id),
      rights_eligibility: rightsIndex.get(record.source_id)
    }));
  const rightsClearProfiles = frontierProfiles.filter((profile) => profile.rights_eligibility?.decision === RIGHTS_CLEAR);
  const rightsHoldProfiles = frontierProfiles.filter((profile) => profile.rights_eligibility?.decision !== RIGHTS_CLEAR);

  const missionById = new Map(bindings.bindings.map((binding) => [binding.mission_id, binding]));
  const missions = [];
  for (const missionId of uniq(gate1.decisions.map((decision) => decision.mission_id))) {
    const binding = missionById.get(missionId);
    if (!binding) throw new Error(`REPLACEMENT_MISSION_BINDING_MISSING:${missionId}`);
    const requiredClaim = contract.replacement_policy.claim_mapping[binding.evidence_class];
    const legacyScopes = targetToLegacy.get(binding.scope_id) || [];
    const eligible = frontierProfiles
      .filter((profile) => profile.rights_eligibility?.decision === RIGHTS_CLEAR)
      .filter((profile) => profile.target_claims.includes(requiredClaim) && profile.collection_scope_ids.some((scope) => legacyScopes.includes(scope)))
      .sort((a, b) => a.priority_rank - b.priority_rank || a.source_id.localeCompare(b.source_id));
    const slots = contract.replacement_policy.required_slots.map((slotName, index) => {
      const profile = eligible[index] || null;
      return profile ? {
        slot: slotName,
        state: 'REGISTERED_PROFILE_CANDIDATE_NOT_RIGHTS_OR_SEMANTICS_VERIFIED',
        source_id: profile.source_id,
        display_name: profile.display_name,
        official_endpoint: profile.official_endpoint,
        official_documentation_url: profile.official_documentation_url,
        access_mode: profile.access_mode,
        channel_type: profile.channel_type,
        declared_source_roles: profile.source_roles,
        registered_target_claims: profile.target_claims,
        adapter_state: 'ADAPTER_NOT_IMPLEMENTED',
        rights_state: profile.rights_eligibility.decision,
        rights_eligibility_state: profile.rights_eligibility.decision,
        rights_eligibility_reason_codes: profile.rights_eligibility.reason_codes,
        sold_or_liquidity_semantics_state: 'UNVERIFIED',
        factual_origin_independence_state: 'UNVERIFIED',
        evidence_admitted: false
      } : {
        slot: slotName,
        state: 'UNFILLED_REGISTERED_PROFILE_GAP',
        source_id: null,
        adapter_state: 'NOT_AVAILABLE',
        rights_state: 'HOLD',
        rights_eligibility_state: 'NO_RIGHTS_CLEAR_REGISTERED_PROFILE',
        sold_or_liquidity_semantics_state: 'UNVERIFIED',
        factual_origin_independence_state: 'UNVERIFIED',
        evidence_admitted: false
      };
    });
    missions.push({
      replacement_mission_id: short('replacement_mission', missionId),
      mission_id: missionId,
      market_cell_id: binding.market_cell_id,
      scope_id: binding.scope_id,
      scope_name: binding.scope_name,
      domain: binding.domain,
      region: binding.region,
      evidence_class: binding.evidence_class,
      required_adapter_claim: requiredClaim,
      legacy_scope_crosswalks: legacyScopes,
      state: eligible.length > 0 ? 'RIGHTS_CLEAR_REGISTERED_PROFILES_IDENTIFIED' : 'NO_RIGHTS_CLEAR_REGISTERED_PROFILE',
      eligible_registered_profile_count: eligible.length,
      rights_clear_registered_profile_count: eligible.length,
      rights_hold_registered_profile_count: rightsHoldProfiles.filter((profile) => profile.target_claims.includes(requiredClaim) && profile.collection_scope_ids.some((scope) => legacyScopes.includes(scope))).length,
      filled_slot_count: slots.filter((slot) => slot.source_id).length,
      slots,
      rights_or_admission_created: false,
      public_release: 'HOLD', production: 'HOLD'
    });
  }

  const selected = new Map();
  for (const mission of missions) for (const slot of mission.slots.filter((item) => item.source_id)) {
    if (!selected.has(slot.source_id)) selected.set(slot.source_id, {
      source_id: slot.source_id,
      display_name: slot.display_name,
      priority_rank: adapterProfiles.get(slot.source_id).priority_rank,
      mission_ids: [], required_claims: new Set(),
      access_mode: slot.access_mode,
      official_endpoint: slot.official_endpoint,
      official_documentation_url: slot.official_documentation_url,
      rights_state: slot.rights_state,
      rights_eligibility_state: slot.rights_eligibility_state,
      rights_eligibility_reason_codes: slot.rights_eligibility_reason_codes,
      rights_evidence_refs: slot.rights_evidence_refs
    });
    const profile = selected.get(slot.source_id);
    profile.mission_ids.push(mission.mission_id);
    profile.required_claims.add(mission.required_adapter_claim);
  }
  const backlog = [...selected.values()].map((profile) => ({
    source_id: profile.source_id,
    display_name: profile.display_name,
    priority_rank: profile.priority_rank,
    impacted_mission_count: uniq(profile.mission_ids).length,
    impacted_mission_ids: uniq(profile.mission_ids),
    required_claims: [...profile.required_claims].sort(),
    access_mode: profile.access_mode,
    official_endpoint: profile.official_endpoint,
    official_documentation_url: profile.official_documentation_url,
    adapter_state: 'ADAPTER_NOT_IMPLEMENTED',
    rights_state: profile.rights_state,
    rights_eligibility_state: profile.rights_eligibility_state,
    rights_eligibility_reason_codes: profile.rights_eligibility_reason_codes,
    rights_evidence_refs: profile.rights_evidence_refs,
    semantic_state: 'UNVERIFIED',
    factual_origin_state: 'UNVERIFIED',
    required_next_steps: [
      'PURPOSE_SPECIFIC_RIGHTS_ADJUDICATION',
      'SOURCE_SCHEMA_AND_DRIFT_CONTRACT',
      'SOLD_OR_EXPOSURE_SEMANTICS_VERIFICATION',
      'SOURCE_OWNER_AND_FACTUAL_ORIGIN_VERIFICATION',
      'SOURCE_SPECIFIC_ADAPTER_IMPLEMENTATION',
      'DETERMINISTIC_REPLAY_AND_MUTATION_PROOF',
      'MARKET_EVENT_ADMISSION_RECEIPT'
    ],
    evidence_admitted: false,
    public_release: 'HOLD', production: 'HOLD'
  })).sort((a, b) => a.priority_rank - b.priority_rank || a.source_id.localeCompare(b.source_id));

  return {
    adapterProfiles,
    replacementQueue: {
      id: 'kidults-asi-replacement-source-mission-queue-v1', version: '1.0.0',
      state: 'RIGHTS_GATED_REPLACEMENT_QUEUE_READY',
      mission_count: missions.length,
      missions_with_profile_candidates: missions.filter((mission) => mission.eligible_registered_profile_count > 0).length,
      missions_without_profile_candidates: missions.filter((mission) => mission.eligible_registered_profile_count === 0).length,
      filled_source_slots: missions.reduce((total, mission) => total + mission.filled_slot_count, 0),
      unique_registered_profiles_selected: backlog.length,
      missions,
      adapter_development_backlog: backlog,
      rights_clear_registered_profile_count: rightsClearProfiles.length,
      rights_hold_registered_profile_count: rightsHoldProfiles.length,
      rights_preflight_queue_count: rightsHoldProfiles.length,
      rights_preflight_queue: rightsHoldProfiles.map((profile) => ({
        source_id: profile.source_id,
        display_name: profile.display_name,
        priority_rank: profile.priority_rank,
        verified_assignment_count: profile.verified_assignment_count,
        target_claims: profile.target_claims,
        rights_eligibility_state: profile.rights_eligibility.decision,
        rights_eligibility_reason_codes: profile.rights_eligibility.reason_codes,
        rights_evidence_refs: profile.rights_eligibility.evidence_refs,
        next_action: 'PURPOSE_SPECIFIC_RIGHTS_AND_COMMERCIAL_ACCESS_PREFLIGHT',
        adapter_backlog_eligible: false
      })).sort((a, b) => a.priority_rank - b.priority_rank || a.source_id.localeCompare(b.source_id)),
      implementation_priority_rule: 'RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_REPLACEMENT_PROFILE_SELECTION',
      registered_profile_is_rights_verified: false,
      registered_profile_is_adapter_implemented: false,
      evidence_admitted: 0,
      public_release: 'HOLD', production: 'HOLD'
    }
  };
}
