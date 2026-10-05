import { buildCurrentSoldBundle, digestEvidence, digestJson } from './current-sold-adapter-v1.mjs';
import { executeKirCurrentSoldControl } from './executor-v1.mjs';
import { evaluateRuntime } from './kir-adapter-v1.mjs';

const ports = Object.freeze({
  evaluateRuntime,
  buildCurrentSoldBundle,
  digestJson,
  digestEvidence,
});

export function evaluateComposedKirCurrentSoldControl(options) {
  return executeKirCurrentSoldControl(options, ports);
}
