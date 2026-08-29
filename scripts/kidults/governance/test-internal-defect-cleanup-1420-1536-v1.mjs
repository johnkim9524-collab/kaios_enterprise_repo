import fs from 'node:fs';

const transition = fs.readFileSync('.github/workflows/kpmo-canonical-issue-transition-guard-v1.yml', 'utf8');
const supersession = fs.readFileSync('.github/workflows/kpmo-exact-head-ci-supersession-v1.yml', 'utf8');

const requireText = (text, needle, name) => {
  if (!text.includes(needle)) throw new Error(`MISSING_${name}`);
};
const forbidText = (text, needle, name) => {
  if (text.includes(needle)) throw new Error(`FORBIDDEN_${name}`);
};

requireText(transition, 'MONOTONIC_ANCESTOR_OR_EQUAL', 'MONOTONIC_POLICY');
requireText(transition, '/compare/${recorded}...${mainSha}', 'COMPARE_API');
requireText(transition, "status === 'identical' || status === 'ahead'", 'ANCESTOR_OR_EQUAL_CLASSIFIER');
requireText(transition, "['behind', false]", 'BEHIND_NEGATIVE');
requireText(transition, "['diverged', false]", 'DIVERGED_NEGATIVE');
forbidText(transition, 'recorded !== mainSha) throw', 'EXACT_SHA_ONLY_REJECTION');

requireText(supersession, 'cancellation_authority "NORMAL_CANCEL_ONLY"', 'NORMAL_CANCEL_ONLY_RECEIPT');
requireText(supersession, 'terminal_readback_bound:{attempts:24,sleep_seconds:5}', 'PASSIVE_READBACK_BOUND');
requireText(supersession, 'same_head_runs_cancelled:0', 'SAME_HEAD_GUARD');
forbidText(supersession, '/force-cancel', 'FORCE_CANCEL_ENDPOINT');
forbidText(supersession, 'force_cancel_run', 'FORCE_CANCEL_FUNCTION');

console.log(JSON.stringify({
  suite: 'KPMO_INTERNAL_DEFECT_CLEANUP_1420_1536_V1',
  result: 'PASS',
  monotonic_ancestor_or_equal: 'PASS',
  divergent_future_fail_closed: 'PASS',
  force_cancel_absent: 'PASS',
  passive_terminal_readback: 'PASS',
  same_head_preserved: 'PASS',
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
}));
