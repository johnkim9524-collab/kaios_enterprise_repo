import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {assertAutonomousFileScope,sha256,validateLiveChangedPaths} from '../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {evaluateSemanticCapabilityDelta} from '../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
import {delegatedTransitionId,matchesFinalizerReadyEvidenceTransitionFile} from '../../scripts/kidults/kpmo/lib/natural-reserve-transition-exception-v1.mjs';
import {routeAuthorizationControl} from '../../scripts/governance/lib/approval-policy-routing-v1.mjs';

const read = path => JSON.parse(fs.readFileSync(path,'utf8'));
const delegated=read('coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json');
const landing=read('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json');
const governed=read('coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json');

test('AI-020 forbids routine Owner orchestration and human independent review',()=>{
  assert.equal(delegated.normal_activation.manual_owner_orchestration_for_eligible_work,'FORBIDDEN');
  assert.equal(delegated.normal_activation.manual_independent_review_required,false);
  assert.equal(delegated.normal_activation.automated_machine_verification_required,true);
  assert.equal(governed.routing.routine_owner_reapproval_for_delegated_work,'FORBIDDEN');
  assert.equal(governed.routing.internal_reversible_workflow_and_governance_strengthening,'AI_020_AUTONOMOUS');
  assert.equal(governed.review_policy.manual_independent_review_required_for_ai_020_eligible_work,false);
  assert.equal(governed.approval_generation_policy.scope,'OWNER_RESERVED_OR_LEGACY_OWNER_COMMENT_GENERATION_ONLY');
  assert.equal(governed.approval_generation_policy.delegated_machine_quorum_exempt,true);
  assert.equal(governed.approval_generation_policy.delegated_finalizer_draft_ready_transition_invalidates_quorum,false);
  assert.equal(governed.approval_generation_policy.delegated_routine_owner_comment_required,false);
  const envelope=read('coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json');
  assert.equal(envelope.classes.INTERNAL_REVERSIBLE.owner_comment_generation_policy_applies,false);
  assert.equal(envelope.classes.INTERNAL_REVERSIBLE.owner_comment_recovery_fallback_for_normal_path,'FORBIDDEN');
  assert.equal(envelope.classes.INTERNAL_REVERSIBLE.finalizer_lifecycle_transition_preserves_exact_tuple_quorum,true);
  assert.equal(envelope.classes.UNKNOWN.decision,'QUARANTINE_RECLASSIFY_THEN_OWNER_IF_UNRESOLVED');
  assert.equal(envelope.classes.UNKNOWN.owner_escalation_only_after_unresolved_reclassification,true);
});

test('autonomous-named workflows cannot be manual-only unless an explicit Owner-reserved boundary is documented',()=>{
  for(const file of fs.readdirSync('.github/workflows').filter(name=>name.startsWith('kidults-autonomous-')&&name.endsWith('.yml'))){
    const source=fs.readFileSync(`.github/workflows/${file}`,'utf8');
    if(!source.includes('workflow_dispatch:')) continue;
    const hasAutomatic=/^  (schedule|push|repository_dispatch|workflow_run|pull_request|pull_request_target):/m.test(source);
    const ownerReserved=/OWNER_RESERVED_(STAGING_INFRA_CHANGE|EXTERNAL_SECRET_CALL)/.test(source);
    assert.ok(hasAutomatic||ownerReserved,`MANUAL_ONLY_AUTONOMOUS_WORKFLOW_UNCLASSIFIED:${file}`);
  }
});

test('explicit Owner-reserved workflow markers override legacy internal or staging routing',()=>{
  for(const [file,marker] of [
    ['.github/workflows/kidults-autonomous-smithsonian-sample.yml','OWNER_RESERVED_EXTERNAL_SECRET_CALL'],
    ['.github/workflows/kidults-autonomous-event-broker-deploy-v1.yml','OWNER_RESERVED_STAGING_INFRA_CHANGE'],
    ['.github/workflows/kidults-autonomous-landing-staging-deploy-v1.yml','OWNER_RESERVED_STAGING_INFRA_CHANGE'],
  ]){
    const source=fs.readFileSync(file,'utf8');
    assert.ok(source.includes(marker));
    assert.equal(routeAuthorizationControl(file,source).route,'OWNER_RESERVED');
  }
});

test('repository-wide manual-only workflows are an exact reviewed exception set',()=>{
  const reviewed=new Set([
    'digitalocean-staging-bootstrap-exec.yml','digitalocean-staging-readonly-audit.yml',
    'kidults-agci-os-candidate-r2-preflight.yml','kidults-atomic-governed-landing-v1.yml',
    'kidults-autonomous-event-broker-deploy-v1.yml','kidults-autonomous-landing-staging-deploy-v1.yml',
    'kidults-autonomous-smithsonian-sample.yml','kidults-cloudflare-pages-boundary-readonly-v1.yml',
    'kidults-cloudflare-pages-emergency-control-v1.yml','kidults-cloudflare-pages-staging-deploy-v1.yml',
    'kidults-er-r7k-finalization-boundary.yml','kidults-er-r7k-graded-population.yml',
    'kidults-graded-authority-probe-gate-v1.yml','kidults-natural-clock-deploy-v1.yml',
    'kidults-pcgs-banknote-alias-probe-r1.yml','kidults-pcgs-live-single-record-probe-r1.yml',
    'kidults-production-release-evidence-v1.yml','kidults-runtime-remote-readonly-inventory.yml',
    'p0-postgres-target-time-restore-verification.yml','p0-remote-postgres-persistence-pitr.yml',
  ]);
  const actual=new Set();
  for(const file of fs.readdirSync('.github/workflows').filter(name=>name.endsWith('.yml'))){
    const source=fs.readFileSync(`.github/workflows/${file}`,'utf8');
    if(!source.includes('workflow_dispatch:')) continue;
    if(!/^  (schedule|push|repository_dispatch|workflow_run|pull_request|pull_request_target|issues):/m.test(source)) actual.add(file);
  }
  assert.deepEqual([...actual].sort(),[...reviewed].sort());
});

test('internal reversible PR lifecycle is autonomous end-to-end, not only approval comments',()=>{
  const lifecycle=landing.normal_internal_pr_lifecycle;
  for(const key of ['owner_comment_required','owner_review_required','owner_ready_click_required','owner_merge_click_required','manual_dispatch_required','manual_rebase_or_recut_required','manual_stale_pr_cleanup_required']) assert.equal(lifecycle[key],false,key);
  assert.equal(lifecycle.draft_to_ready,'FINALIZER_AUTOMATIC');
  assert.equal(lifecycle.merge,'FINALIZER_AUTOMATIC');
  assert.equal(lifecycle.postmerge,'EXACT_MERGE_SHA_AUTOMATIC');
  assert.equal(lifecycle.stale_base,'FINALIZER_BOUNDED_UPDATE_BRANCH');
  assert.equal(lifecycle.redundant_pr_cleanup,'FINALIZER_EXACT_BLOB_EQUALITY_ONLY');
  assert.equal(lifecycle.bounded_retry,'AUTOMATIC_FRESH_GENERATION');
  assert.equal(lifecycle.owner_escalation,'ONLY_OWNER_RESERVED_OR_UNRESOLVED_FAIL_CLOSED');
  assert.equal(landing.merge.autonomous_stale_base_convergence.executor,'FINALIZER_ONLY');
  assert.equal(landing.merge.autonomous_redundant_pr_hygiene.executor,'FINALIZER_ONLY');
  assert.equal(landing.merge.autonomous_redundant_pr_hygiene.close_only_when_all_changed_file_blobs_equal_current_main,true);
  assert.equal(landing.merge.autonomous_redundant_pr_hygiene.removed_or_renamed_files_auto_close_forbidden,true);
});

test('internal workflow strengthening is autonomous while added authority is Owner-reserved',()=>{
  const safe={filename:'.github/workflows/internal-recovery.yml',patch:'@@ -1 +1,2 @@\n name: recovery\n+concurrency: bounded-recovery'};
  assert.deepEqual(assertAutonomousFileScope({files:[safe],policy:landing}),[safe.filename]);
  for(const line of ['+permissions: write-all','+  id-token: write','+environment: production','+value: ${{ secrets.ADMIN }}','+force: true']){
    assert.throws(()=>assertAutonomousFileScope({files:[{...safe,patch:`@@ -1 +1,2 @@\n name: recovery\n${line}`}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);
  }
});

test('trust roots and external-effect surfaces remain Owner-reserved',()=>{
  for(const filename of [
    'CONSTITUTION.md',
    'coordination/kidults/governance/delegated-autonomous-internal-authority-policy-v1.json',
    'secrets/rotation.json',
    'production/release.yml',
    'public/publish.json',
    'g5/promotion.json',
  ]) assert.throws(()=>assertAutonomousFileScope({files:[{filename,patch:'@@ -1 +1 @@'}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);
});

test('missing patch for governed workflow or governance code fails closed',()=>{
  for(const filename of ['.github/workflows/internal.yml','scripts/kidults/kpmo/internal.mjs']){
    assert.throws(()=>assertAutonomousFileScope({files:[{filename}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_CLASSIFICATION_UNKNOWN/);
  }
});

test('capability expansion fails before dispatch while replacements reach semantic verification',()=>{
  const filename='.github/workflows/internal-recovery.yml';
  for(const line of [
    '+permissions:\n+  contents: write',
    '+permissions:\n+  pull-requests: write',
    '+on:\n+  workflow_dispatch:',
    '+run: curl https://example.invalid',
    '+uses: aws-actions/configure-aws-credentials@v5',
  ]) assert.throws(()=>assertAutonomousFileScope({files:[{filename,patch:`@@ -1 +1,2 @@\n name: recovery\n${line}`}],policy:landing}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);

  for(const removed of [
    '-environment: protected-staging',
    '-if: github.ref == refs/heads/main',
    '-run: node scripts/validate-authority.mjs',
    '-permissions: read-all',
  ]) assert.deepEqual(
    assertAutonomousFileScope({files:[{filename,patch:`@@ -1,2 +1 @@\n${removed}\n name: recovery`}],policy:landing}),
    [filename],
  );
});

test('exact exceptions are classified and cannot weaken routing coverage',()=>{
  const filename='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch:'@@ -1,2 +1 @@\n-  "authorization_routing": {"route":"CANONICAL_ENVELOPE"}\n+  "state":"updated"'}],policy:landing}),[filename]);
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch:'@@ -1 +1,2 @@\n {\n+  "verification_evidence": "monotonic-hardening"'}],policy:landing}),[filename]);
});

test('natural Reserve repair is the only autonomous trigger-expansion exception',()=>{
  const files=[
    {
      filename:'.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml',
      base_content:"if: github.event_name == 'workflow_dispatch'\n",
      head_content:"# reviewed repair\nif: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'\n",
      patch:"@@ -1 +1,2 @@\n if: github.event_name == 'workflow_dispatch'\n+# reviewed repair\n+if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
    },
    {
      filename:'.github/workflows/kidults-asi-p0b-bounded-discovery-candidates-v1.yml',
      base_content:'schedule:\n  - cron: \'37 * * * *\'\n',
      head_content:'# reviewed repair\nschedule:\n  - cron: \'7 * * * *\'\n  - cron: \'37 * * * *\'\n',
      patch:"@@ -1,2 +1,4 @@\n schedule:\n+  - cron: '7 * * * *'\n   - cron: '37 * * * *'",
    },
    {
      filename:'.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
      base_content:'schedule:\n  - cron: \'29 * * * *\'\n',
      head_content:'# reviewed repair\nschedule:\n  - cron: \'14 * * * *\'\n  - cron: \'29 * * * *\'\n  - cron: \'44 * * * *\'\n',
      patch:"@@ -1,2 +1,4 @@\n schedule:\n+  - cron: '14 * * * *'\n   - cron: '29 * * * *'\n+  - cron: '44 * * * *'",
    },
    {
      filename:'.github/workflows/kidults-platform-continuous-assurance-v1.yml',
      base_content:'[[ "$TRUTH_UPSTREAM_EVENT" =~ ^(push|issues|workflow_dispatch|pull_request)$ ]]\n',
      head_content:'# reviewed repair\n[[ "$TRUTH_UPSTREAM_EVENT" =~ ^(push|issues|workflow_dispatch|pull_request|workflow_run)$ ]]\n',
      patch:'@@ -1 +1,2 @@\n-[[ "$TRUTH_UPSTREAM_EVENT" =~ ^(push|issues|workflow_dispatch|pull_request)$ ]]\n+[[ "$TRUTH_UPSTREAM_EVENT" =~ ^(push|issues|workflow_dispatch|pull_request|workflow_run)$ ]]',
    },
  ];
  assert.deepEqual(assertAutonomousFileScope({files,policy:landing}),files.map(value=>value.filename).sort());
  assert.equal(evaluateSemanticCapabilityDelta({files,policy:landing}).exception,'NATURAL_RESERVE_CHAIN_REPAIR_V1');
  assert.equal(independentlyVerifyCapabilityDelta({files,policy:landing}).exception,'NATURAL_RESERVE_CHAIN_REPAIR_V1');
  assert.throws(()=>assertAutonomousFileScope({files:files.slice(0,3),policy:landing}),/AUTONOMOUS_OWNER_RESERVED_ACTION/);
});

test('natural clock repair is an exact immutable transition, not a broad exemption',()=>{
  const base='name: clock\non:\n  schedule:\n    - cron: "37 * * * *"\n';
  const head='name: clock\non:\n  schedule:\n    - cron: "37 * * * *"\n    - cron: "47 * * * *"\n';
  const baseSha=`sha256:${crypto.createHash('sha256').update(base).digest('hex')}`;
  const headSha=`sha256:${crypto.createHash('sha256').update(head).digest('hex')}`;
  const policy={delegated_internal_transition_exceptions:[{
    id:'NATURAL_CLOCK_DUAL_SOURCE_REPAIR_V1',
    paths:['.github/workflows/clock.yml'],
    require_complete_path_set:true,
    content_binding:'EXACT_IMMUTABLE_BASE_HEAD_SHA256',
    content_digests:[{path:'.github/workflows/clock.yml',base_sha256:baseSha,head_sha256:headSha}],
  }]};
  const file={filename:'.github/workflows/clock.yml',base_content:base,head_content:head};
  assert.equal(delegatedTransitionId({files:[file],policy}),'NATURAL_CLOCK_DUAL_SOURCE_REPAIR_V1');
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy}).exception,'NATURAL_CLOCK_DUAL_SOURCE_REPAIR_V1');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy}).exception,'NATURAL_CLOCK_DUAL_SOURCE_REPAIR_V1');
  assert.equal(delegatedTransitionId({files:[{...file,head_content:head+'# drift\n'}],policy}),null);
});

test('comment-only deletion and monotonic hardening remain autonomous',()=>{
  const filename='scripts/kidults/kpmo/internal-recovery.mjs';
  const patch='@@ -1,2 +1,2 @@\n-// stale comment\n+// corrected comment\n+export const failClosed = true;';
  assert.deepEqual(assertAutonomousFileScope({files:[{filename,patch}],policy:landing}),[filename]);
});

const workflow=(extra='')=>`name: internal\non:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  validate:\n    if: github.ref == 'refs/heads/main'\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Validate\n        run: node scripts/validate.mjs\n${extra}`;
const semanticFile=(head,overrides={})=>({filename:'.github/workflows/internal.yml',status:'modified',base_content:workflow(),head_content:head,...overrides});

test('immutable before and after blobs are mandatory',()=>{
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[{filename:'.github/workflows/internal.yml'}],policy:landing}),/CAPABILITY_IMMUTABLE_BLOBS_REQUIRED/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[{filename:'.github/workflows/internal.yml'}],policy:landing}),/INDEPENDENT_IMMUTABLE_BLOBS_REQUIRED/);
});

test('semantic classifier rejects every P1 negative capability mutation',()=>{
  const mutations=[
    workflow().replace('contents: read','contents: write'),
    workflow().replace("    if: github.ref == 'refs/heads/main'\n",''),
    workflow().replace('  pull_request:','  pull_request:\n  workflow_dispatch:'),
    workflow('      - name: Network\n        run: curl https://example.invalid\n'),
    workflow('      - name: Provider\n        uses: aws-actions/configure-aws-credentials@v5\n'),
    workflow('    environment: protected-staging\n'),
    workflow('    secrets:\n      TOKEN: ${{ secrets.ADMIN }}\n'),
  ];
  for(const [index,head] of mutations.entries()) {
    assert.throws(()=>evaluateSemanticCapabilityDelta({files:[semanticFile(head)],policy:landing}),/CAPABILITY_/);
    assert.throws(()=>independentlyVerifyCapabilityDelta({files:[semanticFile(head)],policy:landing}),/INDEPENDENT_/,`mutation ${index}`);
  }
});

test('ordered workflow steps cannot hide risky capabilities behind later safe steps',()=>{
  const safeStep='      - name: Safe after risk\n        run: node scripts/validate.mjs\n';
  const riskyStep='      - name: Network\n        run: curl https://example.invalid\n';
  const cases=[
    workflow(`${riskyStep}${safeStep}`),
    workflow(`${safeStep}${riskyStep}${safeStep}`),
  ];
  for(const [index,head] of cases.entries()) {
    assert.throws(()=>evaluateSemanticCapabilityDelta({files:[semanticFile(head)],policy:landing}),/CAPABILITY_EXPANSION/,`primary ordered mutation ${index}`);
    assert.throws(()=>independentlyVerifyCapabilityDelta({files:[semanticFile(head)],policy:landing}),/INDEPENDENT_SECURITY_CAPABILITY_ADDED/,`independent ordered mutation ${index}`);
  }
});

test('unknown YAML indirection and unavailable blobs fail closed',()=>{
  for(const head of [workflow('\npermissions: &privileged\n  contents: write\n'),workflow('\npermissions:\n  <<: *privileged\n')]) {
    assert.throws(()=>evaluateSemanticCapabilityDelta({files:[semanticFile(head)],policy:landing}),/CAPABILITY_YAML_UNSUPPORTED_SYNTAX/);
  }
});

test('workflow block scalars are parsed without weakening capability checks',()=>{
  const base=workflow('      - name: Script\n        run: |\n          set -euo pipefail\n          node scripts/validate.mjs\n');
  const safe=base.replace('    runs-on: ubuntu-24.04','    runs-on: ubuntu-24.04\n    timeout-minutes: 10');
  assert.equal(evaluateSemanticCapabilityDelta({files:[semanticFile(safe,{base_content:base})],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');

  const network=base.replace('          node scripts/validate.mjs','          node scripts/validate.mjs\n          curl https://example.invalid');
  assert.throws(
    ()=>evaluateSemanticCapabilityDelta({files:[semanticFile(network,{base_content:base})],policy:landing}),
    /CAPABILITY_(?:GUARD_WEAKENED|EXPANSION)/,
  );

  const shellOperators=workflow('      - name: Shell operators\n        run: |-\n          ! test -z "$VALUE"\n          printf "* literal"\n');
  assert.equal(evaluateSemanticCapabilityDelta({files:[semanticFile(shellOperators,{base_content:shellOperators})],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
});

test('exact exception policy weakening fails while monotonic evidence addition passes',()=>{
  const filename='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  const base=JSON.stringify({authorization_routing:{route:'CANONICAL_ENVELOPE'},evidence:['a']});
  const weakened=JSON.stringify({authorization_routing:{route:'NON_EXECUTING_REFERENCE'},evidence:['a']});
  const strengthened=JSON.stringify({authorization_routing:{route:'CANONICAL_ENVELOPE'},evidence:['a'],verification_evidence:'monotonic-hardening'});
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[{filename,base_content:base,head_content:weakened}],policy:landing}),/CAPABILITY_EXISTING_VALUE_CHANGED/);
  assert.equal(evaluateSemanticCapabilityDelta({files:[{filename,base_content:base,head_content:strengthened}],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
});

test('derived approval metadata digest rebinding is autonomous but routing mutation is not',()=>{
  const manifest='coordination/kidults/governance/approval-policy-file-manifest-v1.json';
  const inventory='coordination/kidults/governance/approval-policy-inventory-v1.json';
  const manifestBase=JSON.stringify({files:[{path:'scripts/a.mjs',classification:'EXECUTION_AUTHORIZATION_CONTROL',git_blob:'a',sha256:'sha256:a',authorization_routing:{route:'INTERNAL_REVERSIBLE'}}],manifest_sha256:'sha256:old'});
  const manifestHead=JSON.stringify({files:[{path:'scripts/a.mjs',classification:'EXECUTION_AUTHORIZATION_CONTROL',git_blob:'b',sha256:'sha256:b',authorization_routing:{route:'INTERNAL_REVERSIBLE'}}],manifest_sha256:'sha256:new'});
  const inventoryBase=JSON.stringify({audit:{manifest_sha256:'sha256:old',routing_coverage:{route_counts:{INTERNAL_REVERSIBLE:1}}}});
  const inventoryHead=JSON.stringify({audit:{manifest_sha256:'sha256:new',routing_coverage:{route_counts:{INTERNAL_REVERSIBLE:1}}}});
  for(const [filename,base_content,head_content] of [[manifest,manifestBase,manifestHead],[inventory,inventoryBase,inventoryHead]]){
    const file={filename,base_content,head_content};
    assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
    assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
  }
  const routed=JSON.stringify({files:[{path:'scripts/a.mjs',classification:'EXECUTION_AUTHORIZATION_CONTROL',git_blob:'b',sha256:'sha256:b',authorization_routing:{route:'OWNER_RESERVED'}}],manifest_sha256:'sha256:new'});
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[{filename:manifest,base_content:manifestBase,head_content:routed}],policy:landing}),/CAPABILITY_DERIVED_METADATA_SCOPE_CHANGED/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[{filename:manifest,base_content:manifestBase,head_content:routed}],policy:landing}),/INDEPENDENT_(?:SECURITY_CAPABILITY|DERIVED_METADATA_SCOPE_CHANGED)/);
});

test('safe monotonic workflow hardening passes both independent models',()=>{
  const file=semanticFile(workflow('    timeout-minutes: 10\n'));
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});

test('safe internal implementation replacement is autonomous in both independent models',()=>{
  const file={
    filename:'scripts/kidults/kpmo/internal-normalizer.mjs',
    base_content:'export const normalize = value => String(value).trim();\n',
    head_content:'export const normalize = value => String(value ?? "").trim();\n',
  };
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});

test('exact Finalizer reservation-before-token reorder passes independent verifier without broad reorder exemption',()=>{
  const filename='scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs';
  const prefix="if (!authorized) throw new Error('AUTHORIZATION_REQUIRED');\n";
  const reservation="      invokeFinalizerWriter({\n        action:'CREATE_RESERVATION',\n        authorization_generation:envelope.authorization_generation,\n        nonce_digest:envelope.nonce_digest,\n        run_id:required('GITHUB_RUN_ID'),\n        head_sha:envelope.head_sha,\n      });\n";
  const token="      const eventToken=await acquireEventToken();\n      await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});\n";
  const base_content=prefix+token+reservation;
  const head_content=prefix+reservation+token;
  assert.equal(independentlyVerifyCapabilityDelta({files:[{filename,base_content,head_content}],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
  const mutated=prefix+reservation.replace("head_sha:envelope.head_sha","head_sha:'unbound'")+token;
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[{filename,base_content,head_content:mutated}],policy:landing}),/INDEPENDENT_(?:GUARD_DEPENDENCY_CHANGED|EXACT_REORDER_SCOPE_CHANGED)/);
});

test('finalizer Ready evidence preservation exception is exact and mutation-sensitive',()=>{
  const filename='scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs';
  const base_content=fs.readFileSync(filename,'utf8');
  let head_content=base_content;
  const reservation=`      invokeFinalizerWriter({
        action:'CREATE_RESERVATION',
        authorization_generation:envelope.authorization_generation,
        nonce_digest:envelope.nonce_digest,
        run_id:required('GITHUB_RUN_ID'),
        head_sha:envelope.head_sha,
      });
`;
  const token=`      const eventToken=await acquireEventToken();
      await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});
`;
  for(const [before,after] of [
    [token+reservation,reservation+token],
    ['const validateLiveCandidate = async ({allowDraft=false,includeLandingStatus=true,requireEnvelopeBinding=true}={}) => {','const validateLiveCandidate = async ({allowDraft=false,includeLandingStatus=true,requireEnvelopeBinding=true,preserveDraftDevelopmentEvidence=false}={}) => {'],
    ['liveRequiredChecks({includeLandingStatus,draftDevelopment:requireEnvelopeBinding?envelopeRequiresDraftDevelopment:pr.draft===true})','liveRequiredChecks({includeLandingStatus,draftDevelopment:preserveDraftDevelopmentEvidence||(requireEnvelopeBinding?envelopeRequiresDraftDevelopment:pr.draft===true)})'],
    ['const waitForReadyCandidate = async () => {','const waitForReadyCandidate = async ({preserveDraftDevelopmentEvidence=false}={}) => {'],
    ['validateLiveCandidate({includeLandingStatus:false,requireEnvelopeBinding:false})','validateLiveCandidate({includeLandingStatus:false,requireEnvelopeBinding:false,preserveDraftDevelopmentEvidence})'],
    ['await waitForReadyCandidate();','await waitForReadyCandidate({preserveDraftDevelopmentEvidence:candidate.pr.draft===true});'],
  ]){assert.ok(head_content.includes(before));head_content=head_content.replace(before,after)}
  assert.equal(matchesFinalizerReadyEvidenceTransitionFile({filename,base_content,head_content}),true);
  assert.equal(evaluateSemanticCapabilityDelta({files:[{filename,base_content,head_content}],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[{filename,base_content,head_content}],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
  assert.equal(matchesFinalizerReadyEvidenceTransitionFile({filename,base_content,head_content:head_content.replace('candidate.pr.draft===true','true')}),false);
});

test('fail-closed guard replacement remains Owner-reserved',()=>{
  const file={
    filename:'scripts/kidults/kpmo/internal-normalizer.mjs',
    base_content:'if (!authorized) throw new Error("AUTHORIZATION_REQUIRED");\n',
    head_content:'export const normalize = value => String(value).trim();\n',
  };
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[file],policy:landing}),/CAPABILITY_(?:GUARD_REMOVED|GUARD_DEPENDENCY_CHANGED)/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[file],policy:landing}),/INDEPENDENT_(?:SECURITY_CAPABILITY_CHANGED|GUARD_DEPENDENCY_CHANGED)/);
});


test('live scope validation enforces the independent verifier, not only the primary model',()=>{
  const filename='scripts/kidults/kpmo/internal-normalizer.mjs';
  const file={
    filename,
    patch:'@@ -1 +1 @@\n-if (value) return "a";\n+if (value) return "b";',
    base_content:'if (value) return "a";\n',
    head_content:'if (value) return "b";\n',
  };
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.throws(()=>validateLiveChangedPaths({
    files:[file],
    expectedPaths:[filename],
    expectedScopeDigest:sha256(filename),
    policy:landing,
  }),/INDEPENDENT_SECURITY_CAPABILITY_CHANGED/);
});

const scriptFile=(base,head)=>({
  filename:'scripts/kidults/kpmo/internal-authorization.mjs',
  base_content:base,
  head_content:head,
});
const rejectGuardDependencyMutation=file=>{
  assert.throws(()=>evaluateSemanticCapabilityDelta({files:[file],policy:landing}),/CAPABILITY_GUARD_DEPENDENCY_CHANGED/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files:[file],policy:landing}),/INDEPENDENT_GUARD_DEPENDENCY_CHANGED/);
};

test('guard predicate constants cannot bypass either semantic verifier',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "const isAuthorized = evaluatePolicy(input);\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "const isAuthorized = true;\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  ));
});

test('guard helper return changes and aliases remain dependency-bound',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "function evaluatePolicy(value) { return value.authorized; }\nconst decision = evaluatePolicy(input);\nconst isAuthorized = decision;\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "function evaluatePolicy(value) { return true; }\nconst decision = evaluatePolicy(input);\nconst isAuthorized = decision;\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  ));
});

test('multi-line guard dependencies cannot be weakened through indirection',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "const policyDecision = evaluatePolicy(input);\nconst isAuthorized = policyDecision.allowed;\nif (\n  !isAuthorized\n) {\n  throw new Error('AUTHORIZATION_REQUIRED');\n}\n",
    "const policyDecision = {allowed: true};\nconst isAuthorized = policyDecision.allowed;\nif (\n  !isAuthorized\n) {\n  throw new Error('AUTHORIZATION_REQUIRED');\n}\n",
  ));
});

test('mixed safe and risky replacements still reject the risky guard mutation',()=>{
  rejectGuardDependencyMutation(scriptFile(
    "const isAuthorized = evaluatePolicy(input);\nconst label = 'old';\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "const isAuthorized = true;\nconst label = 'new';\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  ));
});

test('unrelated safe implementation replacement does not alter guard dependency graph',()=>{
  const file=scriptFile(
    "const isAuthorized = evaluatePolicy(input);\nconst normalize = value => String(value).trim();\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
    "const isAuthorized = evaluatePolicy(input);\nconst normalize = value => String(value ?? '').trim();\nif (!isAuthorized) throw new Error('AUTHORIZATION_REQUIRED');\n",
  );
  assert.equal(evaluateSemanticCapabilityDelta({files:[file],policy:landing}).state,'SEMANTIC_CAPABILITY_DELTA_PASS');
  assert.equal(independentlyVerifyCapabilityDelta({files:[file],policy:landing}).state,'INDEPENDENT_CAPABILITY_VERIFIED');
});
