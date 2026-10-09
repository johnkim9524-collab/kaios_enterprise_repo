import { validateKirReadinessStructure } from '../validate-kir-readiness-structure-v1.mjs';
import {
  DIGEST,
  EVIDENCE_KEY,
  EXPECTED_DAG,
  FORWARD_STATE,
  req,
  sameStringSet,
} from './constants-v1.mjs';

function requireTransitionEvidence(contract, module) {
  if (module.state !== FORWARD_STATE[module.id]) return;
  const required = contract?.transition_evidence_requirements?.[EVIDENCE_KEY[module.id]];
  req(Array.isArray(required) && required.length > 0, `KIR_TRANSITION_EVIDENCE_CONTRACT_MISSING:${module.id}`);
  req(module.transition_evidence && typeof module.transition_evidence === 'object'
    && !Array.isArray(module.transition_evidence), `KIR_TRANSITION_EVIDENCE_MISSING:${module.id}`);
  for (const field of required) {
    req(DIGEST.test(module.transition_evidence[field] || ''), `KIR_TRANSITION_EVIDENCE_INVALID:${module.id}:${field}`);
  }
  const extras = Object.keys(module.transition_evidence).filter(field => !required.includes(field));
  req(extras.length === 0, `KIR_TRANSITION_EVIDENCE_UNDECLARED:${module.id}:${extras.join(',')}`);
}

export function createModuleMap(registry) {
  req(Array.isArray(registry?.modules)
    && registry.modules.length === Object.keys(EXPECTED_DAG).length, 'KIR_MODULE_COUNT');
  const modules = new Map();
  for (const module of registry.modules) {
    req(typeof module?.id === 'string' && module.id.length > 0, 'KIR_MODULE_ID');
    req(Object.hasOwn(EXPECTED_DAG, module.id), `KIR_MODULE_UNKNOWN:${module.id}`);
    req(!modules.has(module.id), `KIR_MODULE_DUPLICATE:${module.id}`);
    modules.set(module.id, module);
  }
  for (const id of Object.keys(EXPECTED_DAG)) req(modules.has(id), `KIR_MODULE_MISSING:${id}`);
  return modules;
}

export function validateExactDag(modules) {
  for (const [id, expected] of Object.entries(EXPECTED_DAG)) {
    req(sameStringSet(modules.get(id).dependencies, expected), `KIR_MODULE_DEPENDENCY_DRIFT:${id}`);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visited.has(id)) return;
    req(!visiting.has(id), `KIR_MODULE_DEPENDENCY_CYCLE:${id}`);
    visiting.add(id);
    for (const dependency of modules.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of modules.keys()) visit(id);
}

export function validateForwardDependencyClosure(modules) {
  for (const [id, module] of modules) {
    if (module.state !== FORWARD_STATE[id]) continue;
    for (const dependency of EXPECTED_DAG[id]) {
      req(modules.get(dependency).state === FORWARD_STATE[dependency],
        `KIR_FORWARD_DEPENDENCY_NOT_SATISFIED:${id}:${dependency}`);
    }
  }
}

export function validateModuleReadinessBinding(modules, registry, readiness) {
  const stages = new Map((readiness?.stages || []).map(stage => [stage.stage, stage]));
  req(stages.size >= Object.keys(EXPECTED_DAG).length, 'KIR_READINESS_STAGES');
  for (const [id, module] of modules) {
    const stage = stages.get(module.source_stage);
    req(stage, `KIR_SOURCE_STAGE_MISSING:${id}`);
    req(stage.state === module.state, `KIR_STAGE_STATE_DRIFT:${id}`);
    req(stage.owner === module.owner, `KIR_STAGE_OWNER_DRIFT:${id}`);
    if (module.runtime_owner && stage.runtime_owner) {
      req(stage.runtime_owner === module.runtime_owner, `KIR_RUNTIME_OWNER_DRIFT:${id}`);
    }
    if (Number.isInteger(module.empirical_count) && Number.isInteger(stage.empirical_increment)) {
      req(module.empirical_count === stage.empirical_increment, `KIR_STAGE_EMPIRICAL_COUNT_DRIFT:${id}`);
    }
    if (id === 'APPEND_ONLY_LEDGER') {
      req(stage.postgres_migration_applied === module.postgres_migration_applied, 'KIR_LEDGER_MIGRATION_DRIFT');
      req(stage.postgres_rows_written === module.postgres_rows_written, 'KIR_LEDGER_ROW_DRIFT');
    }
    if (id === 'CANDIDATE_EVIDENCE_PAIR') {
      req(stage.candidate === module.candidate, 'KIR_CANDIDATE_DRIFT');
      req(stage.evidence_package === module.evidence_package, 'KIR_EVIDENCE_PACKAGE_DRIFT');
    }
  }
}

export function validateReadinessStructure(registry, readiness) {
  return validateKirReadinessStructure(registry, readiness);
}

export function validateTransitionEvidence(contract, modules) {
  for (const module of modules.values()) requireTransitionEvidence(contract, module);
}
