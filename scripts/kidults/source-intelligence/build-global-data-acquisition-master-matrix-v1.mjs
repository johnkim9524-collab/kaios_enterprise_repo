import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const contract = await read('coordination/kidults/source-intelligence/global-data-acquisition-master-matrix-v1.json');
const scopesDoc = await read(contract.overlay_contracts.scope_registry);
const regionalPolicy = await read(contract.overlay_contracts.regional_policy);
const sourceMesh = await read(contract.overlay_contracts.source_mesh);
const outPath = process.argv[2] || '/tmp/global-data-acquisition-master-matrix-v1.json';

const scopes = scopesDoc.scopes || scopesDoc.collection_scopes || scopesDoc.rows || [];
const scopeIds = scopes.map(s => s.scope_id || s.id).filter(Boolean);
const regions = regionalPolicy.canonical_macroregions || [];
const channels = contract.canonical_sourcing_channels || [];
const evidenceClasses = sourceMesh.evidence_classes || [];
const sha = v => `sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

if (scopeIds.length !== contract.expected_structural_counts.categories) throw new Error(`CATEGORY_COUNT:${scopeIds.length}`);
if (new Set(scopeIds).size !== scopeIds.length) throw new Error('DUPLICATE_CATEGORY_SCOPE');
if (regions.length !== contract.expected_structural_counts.macroregions) throw new Error(`MACROREGION_COUNT:${regions.length}`);
if (channels.length !== contract.expected_structural_counts.sourcing_channels) throw new Error(`SOURCING_CHANNEL_COUNT:${channels.length}`);
if (evidenceClasses.length !== 8) throw new Error(`EVIDENCE_CLASS_COUNT:${evidenceClasses.length}`);

const evidenceSet = new Set(evidenceClasses);
for (const channel of channels) {
  if (!channel.id || !Array.isArray(channel.eligible_evidence_classes) || !channel.eligible_evidence_classes.length) throw new Error(`CHANNEL_SCHEMA:${channel.id || 'UNKNOWN'}`);
  for (const e of channel.eligible_evidence_classes) if (!evidenceSet.has(e)) throw new Error(`UNKNOWN_EVIDENCE_CLASS:${channel.id}:${e}`);
}

const baseCells = [];
const rows = [];
for (const categoryScope of scopeIds) {
  for (const region of regions) {
    for (const channel of channels) {
      const baseId = `${categoryScope}::${region.id}::${channel.id}`;
      baseCells.push({
        base_acquisition_cell_id: baseId,
        category_scope: categoryScope,
        macroregion_id: region.id,
        sourcing_channel: channel.id,
        structural_bootstrap_collection_share: region.bootstrap_collection_share,
        bootstrap_is_market_share: false,
        production: 'HOLD'
      });
      for (const evidenceClass of channel.eligible_evidence_classes) {
        const lane = sourceMesh.lane_templates?.[evidenceClass];
        if (!lane) throw new Error(`MISSING_LANE_TEMPLATE:${evidenceClass}`);
        const priority = 2 * Number(lane.decision_utility || 0) + Number(lane.evidence_strength || 0) + Number(lane.rights_clarity || 0) + Number(lane.autonomy || 0) - Number(lane.dependency_risk || 0);
        rows.push({
          acquisition_cell_id: `${baseId}::${evidenceClass}`,
          category_scope: categoryScope,
          macroregion_id: region.id,
          sourcing_channel: channel.id,
          evidence_class: evidenceClass,
          source_role: lane.source_lane_class,
          selection_state: 'GAP',
          rights_state: 'UNASSESSED',
          admission_state: 'NOT_ADMITTED',
          runtime_state: 'NOT_CONNECTED',
          evidence_state: 'GAP',
          claim_state: 'NOT_VERIFIED',
          freshness_state: 'UNKNOWN',
          minimum_independent_source_owners: contract.redundancy_policy.default_minimum_independent_source_owners,
          observed_independent_source_owners: 0,
          coverage_debt_state: 'OPEN',
          priority_score: priority,
          claim_ceiling: lane.claim_ceiling,
          provenance_requirement: 'REQUIRED_BEFORE_EVIDENCE_PROMOTION',
          next_action: 'DISCOVER_AND_RIGHTS_SCREEN_PURPOSE_SPECIFIC_SOURCE',
          raw_record_count_weight: 0,
          analytical_weight: null,
          production: 'HOLD'
        });
      }
    }
  }
}

const artifact = {
  id: 'kidults-global-data-acquisition-master-matrix-v1-built',
  contract_id: contract.id,
  version: contract.version,
  status: 'STRUCTURE_COMPLETE_OPERATIONAL_STATES_FAIL_CLOSED',
  generated_at: 'DETERMINISTIC_FROM_COMMITTED_CONTRACTS',
  input_refs: {
    scope_registry: contract.overlay_contracts.scope_registry,
    regional_policy: contract.overlay_contracts.regional_policy,
    source_mesh: contract.overlay_contracts.source_mesh
  },
  input_digest: sha({ scopeIds, regions, channels, evidenceClasses, laneTemplates: sourceMesh.lane_templates }),
  structural_counts: {
    categories: scopeIds.length,
    macroregions: regions.length,
    sourcing_channels: channels.length,
    evidence_classes: evidenceClasses.length,
    base_execution_cells: baseCells.length,
    evidence_binding_rows: rows.length
  },
  acquisition_state_summary: {
    rights_allow_rows: rows.filter(r => r.rights_state === 'ALLOW').length,
    admitted_rows: rows.filter(r => r.admission_state === 'ADMITTED').length,
    connected_rows: rows.filter(r => r.runtime_state !== 'NOT_CONNECTED').length,
    verified_evidence_rows: rows.filter(r => r.evidence_state === 'VERIFIED_BOUNDED').length,
    open_coverage_debt_rows: rows.filter(r => r.coverage_debt_state === 'OPEN').length
  },
  base_cells: baseCells,
  evidence_bindings: rows,
  truth_boundary: contract.truth_boundary,
  public_release: 'HOLD',
  production: 'HOLD'
};

await fs.writeFile(outPath, JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({
  status: artifact.status,
  ...artifact.structural_counts,
  verified_evidence_rows: artifact.acquisition_state_summary.verified_evidence_rows,
  production: artifact.production
}));
