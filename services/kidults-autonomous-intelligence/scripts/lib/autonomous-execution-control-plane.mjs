import { authorizeAction } from './autonomous-policy-engine.mjs';

const now = () => new Date().toISOString();

export class ExecutionControlPlane {
  constructor({ policy, adapters, evidenceSink }) {
    this.policy = policy;
    this.adapters = adapters;
    this.evidenceSink = evidenceSink ?? (() => {});
  }

  async run(operation) {
    const adapter = this.adapters[operation.adapter];
    if (!adapter) throw new Error(`adapter-not-registered:${operation.adapter}`);

    const evidence = {
      operationId: operation.id,
      adapter: operation.adapter,
      risk: operation.risk,
      environment: operation.environment,
      startedAt: now(),
      stages: []
    };

    const stage = (name, detail = {}) => {
      const entry = { name, at: now(), ...detail };
      evidence.stages.push(entry);
      return entry;
    };

    try {
      stage('discover');
      const discovery = await adapter.discover(operation);

      stage('preflight');
      const preflight = await adapter.preflight(operation, discovery);
      if (!preflight?.passed) throw new Error(`preflight-failed:${preflight?.reason ?? 'unknown'}`);

      stage('plan');
      const plan = await adapter.plan(operation, discovery, preflight);

      stage('authorize');
      const decision = authorizeAction(this.policy, {
        ...operation,
        preflightPassed: true,
        interactive: false,
        rollbackReady: Boolean(plan.rollbackReady),
        canaryPassed: Boolean(plan.canaryPassed),
        evidenceContract: true,
        estimatedCostUsd: plan.estimatedCostUsd ?? operation.estimatedCostUsd ?? 0,
        blastRadius: plan.blastRadius ?? operation.blastRadius ?? 0
      });
      if (!decision.allowed) throw new Error(`policy-denied:${decision.reason}`);

      stage('execute');
      const execution = await adapter.execute(operation, plan);

      stage('verify');
      const verification = await adapter.verify(operation, execution, plan);
      if (!verification?.passed) {
        stage('cleanup_or_rollback', { mode: 'rollback' });
        const rollback = await adapter.rollback(operation, execution, plan);
        if (!rollback?.passed) throw new Error('verification-failed-and-rollback-failed');
        throw new Error(`verification-failed:${verification?.reason ?? 'unknown'}`);
      }

      stage('cleanup_or_rollback', { mode: 'cleanup' });
      const cleanup = await adapter.cleanup(operation, execution, plan);
      if (!cleanup?.passed) throw new Error(`cleanup-failed:${cleanup?.reason ?? 'unknown'}`);

      stage('evidence');
      evidence.status = 'PASS';
      evidence.completedAt = now();
      evidence.discovery = discovery;
      evidence.plan = plan;
      evidence.execution = execution;
      evidence.verification = verification;
      evidence.cleanup = cleanup;
      await this.evidenceSink(evidence);

      stage('finalize');
      return { status: 'PASS', decision, evidence };
    } catch (error) {
      evidence.status = 'FAIL';
      evidence.completedAt = now();
      evidence.error = String(error?.message ?? error);
      await this.evidenceSink(evidence);
      throw error;
    }
  }
}

export function validateAdapterContract(adapter) {
  const required = ['discover','preflight','plan','execute','verify','rollback','cleanup'];
  const missing = required.filter((name) => typeof adapter?.[name] !== 'function');
  return { valid: missing.length === 0, missing };
}
