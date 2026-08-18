const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const nominationCount = (row) => Array.isArray(row?.candidate_nominations) ? row.candidate_nominations.length : 0;

export function compileChallengerRoleEvidenceWorkPackets({ diagnostic, contract } = {}) {
  if (!isRecord(diagnostic)) throw new TypeError('CHALLENGER_DIAGNOSTIC_REQUIRED');
  if (!isRecord(contract)) throw new TypeError('CHALLENGER_ROLE_EVIDENCE_CONTRACT_REQUIRED');
  if (diagnostic.production !== 'HOLD' || contract.production !== 'HOLD') throw new Error('PRODUCTION_MUST_REMAIN_HOLD');
  if (diagnostic.provider_contact !== 'HOLD' || contract.provider_contact !== 'HOLD') throw new Error('PROVIDER_CONTACT_MUST_REMAIN_HOLD');
  if (Number(diagnostic.selected ?? 0) !== 0) throw new Error('FAIL_CLOSED_DIAGNOSTIC_REQUIRED');

  const roles = Array.isArray(contract.roles) ? contract.roles : [];
  const topologyClasses = Array.isArray(contract.source_topology_classes) ? contract.source_topology_classes : [];
  const rows = Array.isArray(diagnostic.rows) ? diagnostic.rows : [];
  const roleMap = new Map(roles.map((role) => [role.role, role]));
  const sourceFamilyFloor = Number(contract.selection_gate?.independent_source_family_floor ?? 0);

  const packets = rows.map((row) => {
    const role = roleMap.get(row.challenger_role);
    if (!role) {
      return {
        scope_id: row.scope_id ?? null,
        challenger_role: row.challenger_role ?? null,
        status: 'ROLE_CONTRACT_MISSING',
        nomination_count: nominationCount(row),
        role_evidence_state: 'NOT_VERIFIED',
        required_evidence: [],
        evidence_topology: [],
        unresolved_requirements: ['ROLE_CONTRACT_MISSING'],
        independent_source_family_floor: sourceFamilyFloor,
        selection_allowed: false,
      };
    }

    const requiredEvidence = Array.isArray(role.minimum_evidence) ? role.minimum_evidence : [];
    const evidenceTopology = requiredEvidence.map((requirement) => {
      const sourceClasses = topologyClasses
        .filter((entry) => Array.isArray(entry.supports) && entry.supports.includes(requirement))
        .map((entry) => ({ class: entry.class, default_rights: entry.default_rights ?? 'UNKNOWN' }));
      return { requirement, mapped: sourceClasses.length > 0, source_classes: sourceClasses };
    });
    const unresolvedRequirements = evidenceTopology.filter((entry) => !entry.mapped).map((entry) => entry.requirement);

    return {
      scope_id: row.scope_id ?? null,
      challenger_role: row.challenger_role,
      status: unresolvedRequirements.length > 0 ? 'ROLE_EVIDENCE_TOPOLOGY_GAP' : 'ROLE_EVIDENCE_WORK_REQUIRED',
      nomination_count: nominationCount(row),
      role_evidence_state: 'NOT_VERIFIED',
      required_evidence: requiredEvidence,
      evidence_topology: evidenceTopology,
      unresolved_requirements: unresolvedRequirements,
      independent_source_family_floor: sourceFamilyFloor,
      selection_allowed: false,
    };
  });

  const topologyGapCount = packets.reduce((count, packet) => count + packet.unresolved_requirements.length, 0);
  const nominations = Number.isFinite(Number(diagnostic.nominations))
    ? Number(diagnostic.nominations)
    : rows.reduce((count, row) => count + nominationCount(row), 0);

  return {
    id: 'challenger-role-evidence-work-packets-v1',
    version: '1.0.0',
    status: packets.length === 0 ? 'NO_WORK' : topologyGapCount > 0 ? 'WORK_REQUIRED_TOPOLOGY_GAPS' : 'WORK_REQUIRED',
    source: 'ENGINEERING_DIAGNOSTIC_ONLY',
    productionEvidence: false,
    createsEvidence: false,
    mutatesSelection: false,
    autoSelectionAllowed: false,
    slots: Number.isFinite(Number(diagnostic.slots)) ? Number(diagnostic.slots) : rows.length,
    nominations,
    work_packet_count: packets.length,
    topology_gap_count: topologyGapCount,
    packets,
    provider_contact: 'HOLD',
    production: 'HOLD',
  };
}
