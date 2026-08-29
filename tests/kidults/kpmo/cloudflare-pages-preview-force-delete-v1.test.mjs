#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('scripts/ops/cloudflare-pages-preview-cleanup.sh', 'utf8');
assert.match(source, /select\(\.environment == "preview" and \.materialized == true\) \| \.id/);
assert.match(source, /deployments\/\$deployment_id\?force=true/);
assert.match(source, /force_non_production_preview_delete:true/);
assert.match(source, /initial_production_ids/);
assert.match(source, /test "\$initial_production_ids" = "\$final_production_ids"/);
assert.equal(source.includes('select(.environment == "production") | .id'), true);
assert.equal(source.includes('api_request DELETE "$API_ROOT/deployments/$deployment_id?force=true"'), true);
assert.equal(source.includes('DELETE "$API_ROOT"'), false);

console.log(JSON.stringify({
  suite: 'KIDULTS_CLOUDFLARE_PAGES_PREVIEW_FORCE_DELETE_V1',
  result: 'PASS',
  preview_only_selection: true,
  force_non_production_delete: true,
  production_id_set_immutable: true,
  project_delete_path_absent: true,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
