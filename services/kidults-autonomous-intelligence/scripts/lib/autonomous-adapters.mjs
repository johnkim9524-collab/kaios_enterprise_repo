function createAdapter(name) {
  return {
    name,
    async discover(operation) {
      return { adapter: name, resource: operation.resource ?? 'synthetic', discovered: true };
    },
    async preflight(operation) {
      if (operation.forcePreflightFailure) return { passed: false, reason: 'forced-preflight-failure' };
      return { passed: true, nonInteractive: true };
    },
    async plan(operation) {
      return {
        mode: operation.mode ?? 'dry-run',
        rollbackReady: operation.rollbackReady !== false,
        canaryPassed: operation.canaryPassed !== false,
        estimatedCostUsd: operation.estimatedCostUsd ?? 0,
        blastRadius: operation.blastRadius ?? 1
      };
    },
    async execute(operation, plan) {
      if (operation.forceExecutionFailure) throw new Error('forced-execution-failure');
      return { executed: true, mode: plan.mode, mutationApplied: plan.mode === 'apply' && Boolean(operation.mutation) };
    },
    async verify(operation) {
      if (operation.forceVerificationFailure) return { passed: false, reason: 'forced-verification-failure' };
      return { passed: true };
    },
    async rollback(operation) {
      return { passed: operation.forceRollbackFailure !== true };
    },
    async cleanup(operation) {
      return { passed: operation.forceCleanupFailure !== true };
    }
  };
}

export const autonomousAdapters = {
  cloudflare: createAdapter('cloudflare'),
  github: createAdapter('github'),
  digitalocean: createAdapter('digitalocean'),
  provider: createAdapter('provider'),
  database: createAdapter('database'),
  storage: createAdapter('storage'),
  dns: createAdapter('dns'),
  server: createAdapter('server')
};
