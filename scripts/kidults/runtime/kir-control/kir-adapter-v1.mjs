import { evaluateKirRuntime, loadKirRuntime } from '../kir-runtime-kernel-v1.mjs';

export function evaluateRuntime(identity) {
  return evaluateKirRuntime({ ...loadKirRuntime(), identity });
}
