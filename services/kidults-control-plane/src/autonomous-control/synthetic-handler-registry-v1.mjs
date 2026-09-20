import { digestObject } from '../common-control/canonical-v1.mjs';
import { createSyntheticHandlerRegistry } from './task-worker-v1.mjs';

export const SYNTHETIC_HANDLER_REGISTRY_V1 = createSyntheticHandlerRegistry([{
  workflowType: 'synthetic-shadow',
  handlerId: 'synthetic-shadow-control-v1',
  async execute(context) {
    await context.checkpoint(digestObject({
      domain: 'kidults.synthetic-shadow-control.v1',
      taskId: context.taskId,
      admissionRequestDigest: context.admissionRequestDigest,
      leaseEpoch: context.leaseEpoch,
    }));
    return { outcome: 'SUCCEEDED' };
  },
}]);
