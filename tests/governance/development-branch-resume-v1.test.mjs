import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDevelopmentBranchResume} from '../../scripts/governance/lib/development-branch-resume-v1.mjs';
const policy = JSON.parse(fs.readFileSync('coordination/kidults/governance/resume-contract-v1.json'));
const good = {policy, branch: 'codex/test', expectedHead: 'a'.repeat(40), liveHead: 'a'.repeat(40),
  parentSha: 'a'.repeat(40), payload: 'exact-tree', payloadDigest: `sha256:${createHash('sha256').update('exact-tree').digest('hex')}`,
  authorized: true, bootstrapVerified: true};
test('authorized exact development update needs no dispatch-ledger capability', () => {
  assert.equal(validateDevelopmentBranchResume(good).protected_landing_authority, false);
});
for (const [name, value] of Object.entries({branch: 'main', force: true, operation: 'MERGE',
  authorized: false, bootstrapVerified: false, liveHead: 'b'.repeat(40), parentSha: 'b'.repeat(40), payloadDigest: 'bad'})) {
  test(`rejects ${name}`, () => assert.throws(() => validateDevelopmentBranchResume({...good, [name]: value})));
}
test('a development policy cannot grant landing authority', () => {
  const bad = structuredClone(policy);
  bad.development_branch_resume.main_write_merge_approval_dispatch_deploy_generation_reservation_promotion_allowed = true;
  assert.throws(() => validateDevelopmentBranchResume({...good, policy: bad}));
});
