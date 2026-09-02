const CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'CURRENT_SOLD_CHANGED',
    producer: 'CURRENT_SOLD_CHANGED: ${{ steps.landing.outputs.current_sold_changed }}',
    consumer: 'const landingCurrentSoldChanged = process.env.CURRENT_SOLD_CHANGED || null;',
  }),
]);

const fail = code => {
  const error = new Error(code);
  error.code = code;
  throw error;
};

export function assertAtomicLandingHandoffCompatibility({
  baseWorkflow,
  candidateTerminalReconciler,
} = {}) {
  if (typeof baseWorkflow !== 'string' || baseWorkflow.length === 0) {
    fail('ATOMIC_HANDOFF_BASE_WORKFLOW_INVALID');
  }
  if (typeof candidateTerminalReconciler !== 'string' || candidateTerminalReconciler.length === 0) {
    fail('ATOMIC_HANDOFF_CANDIDATE_RECONCILER_INVALID');
  }

  const required = [];
  for (const contract of CONTRACTS) {
    if (!candidateTerminalReconciler.includes(contract.consumer)) continue;
    required.push(contract.id);
    if (!baseWorkflow.includes(contract.producer)) {
      fail(`ATOMIC_HANDOFF_BASE_WORKFLOW_INCOMPATIBLE:${contract.id}`);
    }
  }

  return Object.freeze({
    state: 'BASE_WORKFLOW_CANDIDATE_HANDOFF_COMPATIBLE',
    required_contracts: Object.freeze(required),
    checked_before_authorization_consumption: true,
    mutation_authority_created: false,
    public: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}
