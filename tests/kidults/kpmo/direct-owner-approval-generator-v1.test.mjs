import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/kidults/kpmo/generate-direct-owner-approval-v1.mjs','utf8');

test('generator derives exact authorization id, remote tree, bounded expiry and nonce',()=>{
  assert.match(source,/DIRECT-PR-\$\{pr\}-\$\{view\.headRefOid\.slice\(0,12\)\}/);
  assert.match(source,/repos\/\$\{repository\}\/git\/commits\/\$\{view\.headRefOid\}/);
  assert.match(source,/crypto\.randomBytes\(16\)\.toString\('hex'\)/);
  assert.match(source,/lifetime<15\|\|lifetime>55/);
  assert.match(source,/GENERATED_NOT_APPROVED/);
  assert.match(source,/owner_action_required:true/);
});

test('generator preserves promotion HOLD and one-use owner scope',()=>{
  assert.match(source,/ONE_DIRECT_OWNER_MERGE_ONLY/);
  assert.match(source,/approval_rebind:'FORBIDDEN'/);
  assert.match(source,/production:'HOLD',public:'HOLD',g5:'HOLD'/);
});
