import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflowPath=fileURLToPath(new URL('../../.github/workflows/p0-remote-postgres-persistence-pitr.yml',import.meta.url));
const workflow=fs.readFileSync(workflowPath,'utf8');

test('standing authorization cannot admit provider credentials',()=>{
  assert.match(workflow,/STANDING_ACTIVATION.*KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED/);
  assert.match(workflow,/test "\$STANDING_ACTIVATION" = "false"/);
  assert.match(workflow,/vars\.KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED == 'false'/);
  assert.doesNotMatch(workflow,/vars\.KIDULTS_REMOTE_POSTGRES_AUTO_ACTIVATION_AUTHORIZED == 'true'/);
});

test('one-shot is bound to exact SHA, first attempt, nonce, expiry and Program Owner environment review',()=>{
  for(const token of ['exact_main_sha','authorization_nonce','authorization_expires_at','GITHUB_RUN_ATTEMPT" = "1"','required_reviewers','can_admins_bypass','ONE_SHOT_NONCE_REPLAY','actions/runs/$GITHUB_RUN_ID/approvals','KPMO_PROGRAM_OWNER_APPROVED_STAGING_POSTGRES_ONE_SHOT','297161720','johnkim9524-collab']) assert.ok(workflow.includes(token),token);
  assert.match(workflow,/environment: kidults-do-staging-ssh/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
});

test('canonical and step-independent terminal receipts are non-empty always-path artifacts',()=>{
  assert.match(workflow,/Initialize non-empty canonical source terminal receipt/);
  assert.match(workflow,/Finalize canonical source terminal receipt on every outcome\n\s+if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow,/name: Remote PostgreSQL step-independent terminal receipt/);
  assert.match(workflow,/if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow,/test -s "\$RECEIPT"/);
  assert.match(workflow,/if-no-files-found: error/g);
  assert.doesNotMatch(workflow,/\| tee artifacts\/p0-remote-postgres\/postgres-persistence-pitr-readiness\.json/);
});

test('STAGING migration and 19-source load remain inside the approved verifier with release HOLD',()=>{
  const verifier=fs.readFileSync(fileURLToPath(new URL('../../scripts/staging/verify-remote-postgres-persistence-pitr.sh',import.meta.url)),'utf8');
  const migration=fs.readFileSync(fileURLToPath(new URL('../../scripts/staging/migrate-and-load-global-sold-source-registry-v1.sh',import.meta.url)),'utf8');
  assert.match(verifier,/migrate-and-load-global-sold-source-registry-v1\.sh/);
  assert.match(migration,/\[\[ "\$KAIOS_ENVIRONMENT" == staging \]\]/);
  assert.match(migration,/\[\[ "\$KAIOS_PRODUCTION_PROMOTION_AUTHORIZED" == false \]\]/);
  assert.match(migration,/\[\[ "\$after_counts" == '1\|19' \]\]/);
  assert.match(migration,/'production':'HOLD','public_release':'HOLD','g5':'HOLD'/);
  const tunnel=fs.readFileSync(fileURLToPath(new URL('../../scripts/staging/run-postgres-verifier-through-ssh-tunnel.sh',import.meta.url)),'utf8');
  assert.match(tunnel,/KAIOS_TUNNEL_DIAGNOSTIC_OUTPUT/);
  assert.match(tunnel,/REMOTE_DNS_FAILURE/);
  assert.match(tunnel,/REMOTE_TCP_UNREACHABLE/);
  assert.match(tunnel,/REMOTE_TCP_REACHABLE/);
});
