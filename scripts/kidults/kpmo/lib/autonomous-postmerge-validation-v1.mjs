import {evaluatePostMergePushSuite, validatePolicy} from '../consume-direct-owner-postmerge-push-suite-v1.mjs';
import {evaluateCanonicalConvergence} from '../consume-atomic-postmerge-push-suite-v1.mjs';

// Landing integrity consumes exact protected-main push controls. Asynchronous
// producer health remains independently fail-closed at Sentinel and its gate.
export function evaluateAutonomousPostmerge(runs, policy, mergeSha, mergedAt) {
  validatePolicy(policy);
  const suite = evaluatePostMergePushSuite(runs, policy, mergeSha, mergedAt);
  const canonical = evaluateCanonicalConvergence(runs, policy, mergeSha, mergedAt);
  const failed = suite.invalid.length > 0 || suite.failure_count > 0 || canonical.state === 'VERIFIED_FAIL';
  return {
    state: failed ? 'VERIFIED_FAIL' : suite.ready && suite.all_required_success && canonical.state === 'VERIFIED_PASS' ? 'VERIFIED_PASS' : 'WAITING',
    merge_sha: mergeSha,
    required_workflows: suite.required,
    waiting: suite.waiting,
    invalid: suite.invalid,
    canonical_convergence: canonical,
    proof_scope: 'LANDING_INTEGRITY_ONLY_NOT_PROMOTION_HEALTH',
    promotion_eligible: false,
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
}
