// Stable Current-SOLD control façade. Validation and execution stay behind declared boundaries.
import { executeKirCurrentSoldControl } from './kir-control/executor-v1.mjs';

/**
 * Exercise the real atomic admission/evidence implementation with synthetic
 * inputs. This deliberately returns no bundle, raw row, evidence object or
 * ledger eligibility. It is not an activation or empirical-admission API.
 */
export function evaluateKirCurrentSoldControl(options) {
  return executeKirCurrentSoldControl(options);
}
