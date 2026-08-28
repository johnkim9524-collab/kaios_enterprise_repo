#!/usr/bin/env node
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const contractPath='coordination/kidults/portal/mobile-portal-public-promotion-gate-v1.json';
const receiptPath='coordination/kidults/portal/mobile-portal-physical-ios-acceptance-v1.json';
const authorizationPath='coordination/kidults/portal/mobile-portal-public-authorization-v1.json';
const qaWorkflowPath='.github/workflows/kidults-mobile-portal-release-qa-v1.yml';
const qaRunnerPath='scripts/kidults/portal/capture-mobile-portal-v1.mjs';
const artifactValidatorPath='scripts/kidults/portal/validate-independent-mobile-portal-v1.mjs';
const qaPackagePath='tooling/kidults-mobile-portal-browser-qa/package.json';
const qaLockPath='tooling/kidults-mobile-portal-browser-qa/package-lock.json';
const qaReceiptBuilderPath='scripts/kidults/kpmo/build-mobile-portal-browser-qa-toolchain-receipt-v1.mjs';
const qaSupplyValidatorPath='scripts/kidults/kpmo/validate-mobile-portal-browser-qa-supply-chain-v1.mjs';
const governedWorkflowPath='.github/workflows/kidults-governed-landing-authorization-v1.yml';
const governedPolicyPath='coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json';
const surfaceRoot='apps/kidults-mobile-portal';
const surfaceFiles=[];
const redirectsPath='apps/kidults-mobile-portal/public/_redirects';
const headersPath='apps/kidults-mobile-portal/public/_headers';
const mode=process.argv.includes('--promotion')?'promotion':process.argv.includes('--self-test')?'self-test':'contract';
const requiredPhysicalResults=[
  'CANONICAL_ROOT_ROUTE_PASS',
  'INDEPENDENT_MOBILE_SHELL_PASS',
  'HIDDEN_INITIAL_LOAD_PASS',
  'BFCACHE_RESTORE_PASS',
  'BACKGROUND_FOREGROUND_30_CYCLES_PASS',
  'MOBILE_EVIDENCE_NAVIGATION_RELOAD_PASS',
  'PORTRAIT_320_375_390_430_PASS',
  'LANDSCAPE_ROTATION_PASS',
  'TOUCH_TARGETS_44PX_PASS',
  'CRASH_ZERO',
  'STALE_RENDER_ZERO',
  'HORIZONTAL_OVERFLOW_ZERO',
];
const requiredCaseMatrix=[
  'chromium|/|control|320x844|journey',
  'chromium|/|control|375x812|journey',
  'chromium|/|control|390x844|journey',
  'chromium|/|control|430x932|journey',
  'webkit|/|control|320x844|journey',
  'webkit|/|control|375x812|journey',
  'webkit|/|control|390x844|journey',
  'webkit|/|control|430x932|journey',
  'chromium|/mobile|control|390x844|no-journey',
  'webkit|/mobile/|control|390x844|no-journey',
  'chromium|/|live|390x844|no-journey',
  'webkit|/|invalid|390x844|no-journey',
  'chromium|/|forged|390x844|no-journey',
];
const requiredHeaders={
  'content-security-policy_contains':"frame-ancestors 'none'",
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'permissions-policy_contains':'camera=()',
  'referrer-policy':'no-referrer',
  'x-robots-tag':'noindex, nofollow',
};

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const contract=readJson(contractPath);
const receipt=readJson(receiptPath);
const authorization=readJson(authorizationPath);
const qaWorkflow=fs.readFileSync(qaWorkflowPath,'utf8');
const qaRunner=fs.readFileSync(qaRunnerPath,'utf8');
const governedWorkflow=fs.readFileSync(governedWorkflowPath,'utf8');
const governedPolicy=readJson(governedPolicyPath);
execFileSync(process.execPath,[artifactValidatorPath],{stdio:'ignore'});

const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const absolute=path.join(directory,entry.name);
  return entry.isDirectory()?walk(absolute):[absolute];
});
const surfaceDigest=()=>{
  const hash=createHash('sha256');
  for(const file of [...walk(surfaceRoot),...surfaceFiles].sort()){
    hash.update(path.relative('.',file).replaceAll('\\','/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
};
const surfaceDigestAtRef=ref=>{
  const rootFiles=execFileSync('git',['ls-tree','-r','--name-only',ref,'--',surfaceRoot],{encoding:'utf8'})
    .trim().split('\n').filter(Boolean);
  const hash=createHash('sha256');
  for(const file of [...rootFiles,...surfaceFiles].sort()){
    hash.update(file.replaceAll('\\','/'));
    hash.update('\0');
    hash.update(execFileSync('git',['show',`${ref}:${file}`]));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
};
const sha256=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const isAncestor=(ancestor,descendant)=>spawnSync('git',['merge-base','--is-ancestor',ancestor,descendant],{stdio:'ignore'}).status===0;
const validateProgramOwner=(actor,expectedOwner)=>{
  assert.match(actor.github_login||'',/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,'PUBLIC_AUTHORIZATION_ACTOR_INVALID');
  assert.equal(actor.role,'PROGRAM_OWNER');
  if(expectedOwner) assert.equal(actor.github_login,expectedOwner,'PUBLIC_AUTHORIZATION_ACTOR_NOT_REPOSITORY_OWNER');
};
const validateTestedSourceBinding=({testedSourceSha,currentHeadSha,receiptSurfaceDigest,currentSurfaceDigest,ancestorCheck=isAncestor,digestAtRef=surfaceDigestAtRef})=>{
  assert.match(testedSourceSha||'',/^[0-9a-f]{40}$/,'PHYSICAL_IPHONE_TESTED_SHA_INVALID');
  assert.match(currentHeadSha||'',/^[0-9a-f]{40}$/,'CURRENT_HEAD_SHA_INVALID');
  assert.equal(ancestorCheck(testedSourceSha,currentHeadSha),true,'PHYSICAL_IPHONE_TESTED_SHA_NOT_ANCESTOR_OF_CURRENT_HEAD');
  assert.equal(receiptSurfaceDigest,currentSurfaceDigest,'PHYSICAL_IPHONE_SURFACE_DIGEST_MISMATCH');
  assert.equal(digestAtRef(testedSourceSha),currentSurfaceDigest,'PHYSICAL_IPHONE_SURFACE_DRIFT_AFTER_TEST');
  assert.equal(digestAtRef(currentHeadSha),currentSurfaceDigest,'PORTAL_SURFACE_WORKTREE_HEAD_MISMATCH');
};
const validateQaRunnerContract=text=>{
  const markers=[
    "path.join(outputRoot, '_redirects')",
    "path.join(outputRoot, '_headers')",
    "id: 'kidults-independent-mobile-portal-browser-qa-v1'",
    "public_root: 'apps/kidults-mobile-portal/public'",
    "page.goto(`${baseUrl}${entryPath}`",
    "entryPath: '/mobile'",
    "entryPath: '/mobile/'",
    "projectionMode: 'live'",
    "projectionMode: 'invalid'",
    "projectionMode: 'forged'",
    'nonMobileLinks:',
    "filter(href => !href.startsWith('#'))",
    'nonMobileResourceLoads:',
    "'/api/mobile/v1/projection'",
    "'/mobile/mobile.css'",
    "'/mobile/mobile.js'",
    "'/mobile/projection-client.js'",
    "'/mobile/data/no-projection.json'",
    'CSP_FRAME_ANCESTORS_MISSING',
    'NOSNIFF_MISSING',
    'FRAME_DENY_MISSING',
    'PERMISSIONS_POLICY_MISSING',
    'REFERRER_POLICY_MISSING',
    'ROBOTS_NOINDEX_MISSING',
    'NON_MOBILE_LINKS_',
    'NON_MOBILE_RESOURCE_LOADS_',
    'PRIVATE_SENTINEL_EXPOSED',
    'REVALIDATION_NON_ATOMIC_',
    'REVALIDATION_TIMEOUT_REASON_',
    'REVALIDATION_TIMEOUT_FOOTPRINT_',
    "document.documentElement.dataset.revalidating === 'true'",
    'const context = await browser.newContext(contextOptions)',
    'const axeContext = await browser.newContext({ ...contextOptions, bypassCSP: true })',
    'new AxeBuilder({ page: axePage })',
    'await axePage.screenshot({ path: path.join(outputDir,',
    "screenshot_context: 'AXE_ISOLATED_BYPASS_CSP'",
    'runtime_security_evidence: false',
    'await axeContext.close()',
    "animations: 'allow', caret: 'initial'",
    'if (report.failures.length)',
    'process.exit(1)',
  ];
  for(const marker of markers) assert(text.includes(marker),`QA_RUNNER_SEMANTIC_MARKER_MISSING:${marker}`);
  assert.equal((text.match(/bypassCSP:\s*true/g)||[]).length,1,'QA_AXE_BYPASS_CSP_NOT_EXACTLY_ISOLATED');
  assert.equal((text.match(/\.screenshot\s*\(/g)||[]).length,1,'QA_SCREENSHOT_CALL_NOT_EXACTLY_ONE');
  assert.equal(text.includes('new AxeBuilder({ page })'),false,'QA_AXE_MUST_NOT_MUTATE_RUNTIME_EVIDENCE_PAGE');
  assert.equal(/await\s+page\.screenshot\s*\(/.test(text),false,'QA_SCREENSHOT_MUST_NOT_MUTATE_RUNTIME_EVIDENCE_PAGE');
  assert.equal(text.includes('AXE_WEBKIT_INLINE_STYLE_PROBE_BLOCKED_BY_CSP'),false,'QA_CSP_ERROR_SUPPRESSION_FORBIDDEN');
  assert.equal(text.includes('/workspace'),false,'QA_RUNNER_DESKTOP_WORKSPACE_DEPENDENCY_FORBIDDEN');
  assert.equal(text.includes('/portal-r001'),false,'QA_RUNNER_R001_DEPENDENCY_FORBIDDEN');
};
const validatePromotionWorkflowRouting=text=>{
  assert.equal(/\bworkflow_dispatch\s*:/.test(text),false,'PROMOTION_WORKFLOW_MANUAL_DISPATCH_FORBIDDEN');
  assert(text.includes('if [ "${KIDULTS_PORTAL_SURFACE_CHANGED}" = true ]; then'),'PROMOTION_WORKFLOW_SURFACE_BRANCH_MISSING');
  assert(text.includes('validate-mobile-portal-public-promotion-gate-v1.mjs --promotion'),'PROMOTION_WORKFLOW_PROMOTION_MODE_MISSING');
  assert(text.includes('validate-mobile-portal-public-promotion-gate-v1.mjs --contract'),'PROMOTION_WORKFLOW_CONTRACT_MODE_MISSING');
  assert.equal((text.match(/changed=files\.some\(file=>\[file\.filename,file\.previous_filename\]\.filter\(Boolean\)\.some\(isPortalSurface\)\)/g)||[]).length,1,'PROMOTION_WORKFLOW_PR_SURFACE_DETECTION_DRIFT');
  assert.equal((text.match(/changed=files\.some\(isPortalSurface\)/g)||[]).length,1,'PROMOTION_WORKFLOW_PUSH_SURFACE_DETECTION_DRIFT');
  assert(text.includes("throw new Error('PUSH_COMMIT_FILE_LIST_TRUNCATED')"),'PROMOTION_WORKFLOW_PUSH_TRUNCATION_FAIL_CLOSE_MISSING');
  assert(text.includes('AUTHORIZING_GITHUB_ACTOR: ${{ github.triggering_actor }}'),'PROMOTION_WORKFLOW_TRIGGERING_OWNER_BINDING_MISSING');
};
const validateMobileQaReport=report=>{
  assert.equal(report.root,contract.browser_qa.required_root,'QA_CANONICAL_ROOT_MISMATCH');
  assert.equal(report.visual_evidence?.screenshot_context,'AXE_ISOLATED_BYPASS_CSP','QA_SCREENSHOT_CONTEXT_MISMATCH');
  assert.equal(report.visual_evidence?.runtime_security_evidence,false,'QA_SCREENSHOT_SECURITY_EVIDENCE_FALSE_REQUIRED');
  assert.equal(report.visual_evidence?.strict_runtime_evidence,'METRICS_PAGEERROR_CONSOLE_HTTP','QA_STRICT_RUNTIME_EVIDENCE_MISMATCH');
  assert(Array.isArray(report.cases),'QA_CASES_INVALID');
  assert.equal(report.cases.length,contract.browser_qa.exact_case_count,`QA_CASE_COUNT_MISMATCH:${report.cases.length}`);
  assert.deepEqual(report.failures,[],'QA_FAILURES_PRESENT');
  const caseKey=entry=>`${entry.browser}|${entry.entryPath}|${entry.projectionMode}|${entry.viewport?.width}x${entry.viewport?.height}|${entry.journey?'journey':'no-journey'}`;
  const actualMatrix=report.cases.map(caseKey);
  assert.equal(new Set(actualMatrix).size,actualMatrix.length,'QA_CASE_MATRIX_DUPLICATE');
  assert.deepEqual([...actualMatrix].sort(),[...contract.browser_qa.required_case_matrix].sort(),'QA_CASE_MATRIX_MISMATCH');
  assert.deepEqual([...new Set(report.cases.map(entry=>entry.entryPath))].sort(),[...contract.browser_qa.required_entry_paths].sort(),'QA_ENTRY_PATH_MATRIX_MISMATCH');
  for(const browser of contract.browser_qa.required_browsers) assert(report.cases.some(entry=>entry.browser===browser),`QA_BROWSER_MISSING:${browser}`);
  for(const width of contract.browser_qa.required_viewport_widths) assert(report.cases.some(entry=>entry.viewport?.width===width),`QA_VIEWPORT_MISSING:${width}`);
  for(const entry of report.cases){
    assert.deepEqual(entry.failures,[],`QA_CASE_FAILURES_PRESENT:${entry.browser}:${entry.viewport?.width}`);
    assert.deepEqual(entry.runtimeErrors,[],`QA_RUNTIME_ERRORS_PRESENT:${entry.browser}:${entry.viewport?.width}`);
    assert.deepEqual(entry.responseErrors,[],`QA_RESPONSE_ERRORS_PRESENT:${entry.browser}:${entry.viewport?.width}`);
    assert(Array.isArray(entry.harnessDiagnostics),`QA_HARNESS_DIAGNOSTICS_MISSING:${entry.browser}:${entry.viewport?.width}`);
    assert(entry.harnessDiagnostics.length<=1,`QA_HARNESS_DIAGNOSTIC_COUNT_INVALID:${entry.browser}:${entry.viewport?.width}`);
    assert.equal(new Set(entry.harnessDiagnostics).size,entry.harnessDiagnostics.length,`QA_HARNESS_DIAGNOSTIC_DUPLICATED:${entry.browser}:${entry.viewport?.width}`);
    for(const diagnostic of entry.harnessDiagnostics){
      assert.equal(entry.browser,'webkit',`QA_HARNESS_DIAGNOSTIC_NON_WEBKIT:${diagnostic}`);
      assert.equal(diagnostic,'AXE_WEBKIT_INLINE_STYLE_PROBE_BLOCKED_BY_CSP',`QA_HARNESS_DIAGNOSTIC_UNKNOWN:${diagnostic}`);
    }
    assert.deepEqual(entry.axeDetails,[],`QA_AXE_FAILURES_PRESENT:${entry.browser}:${entry.viewport?.width}`);
    assert.equal(entry.metrics?.product,contract.browser_qa.required_product,'QA_PRODUCT_MISMATCH');
    assert.equal(entry.metrics?.entrySurface,contract.browser_qa.required_entry_surface,'QA_ENTRY_SURFACE_MISMATCH');
    assert.equal(entry.metrics?.release,contract.browser_qa.required_release,'QA_RELEASE_MISMATCH');
    const expectedState=entry.projectionMode==='live'?'LIVE_APPROVED':['invalid','forged'].includes(entry.projectionMode)?'INVALID':contract.browser_qa.required_projection_state;
    assert.equal(entry.metrics?.state,expectedState,'QA_PROJECTION_STATE_MISMATCH');
    assert.equal(entry.metrics?.mobileReady,'true','QA_MOBILE_READY_MISMATCH');
    assert.equal(entry.metrics?.mainCount,1,'QA_MAIN_COUNT_MISMATCH');
    assert.equal(entry.metrics?.projectionBeforeMain,true,'QA_PROJECTION_ORDER_MISMATCH');
    assert.equal(entry.metrics?.projectionInFirstFold,true,'QA_PROJECTION_FIRST_FOLD_MISMATCH');
    assert.equal(entry.metrics?.verticalCount,8,'QA_VERTICAL_COUNT_MISMATCH');
    assert.equal(entry.metrics?.signalCount,6,'QA_SIGNAL_COUNT_MISMATCH');
    assert.equal(entry.metrics?.bottomNavCount,4,'QA_BOTTOM_NAV_COUNT_MISMATCH');
    assert.equal(entry.metrics?.activeNavCount,1,'QA_ACTIVE_NAV_COUNT_MISMATCH');
    assert.equal(entry.metrics?.horizontalOverflow,false,'QA_HORIZONTAL_OVERFLOW');
    assert(Array.isArray(entry.metrics?.nonMobileLinks),'QA_NON_MOBILE_LINKS_FIELD_INVALID');
    assert.equal(entry.metrics.nonMobileLinks.length,contract.browser_qa.required_non_mobile_link_count,'QA_NON_MOBILE_LINKS_PRESENT');
    assert(Array.isArray(entry.metrics?.nonMobileResourceLoads),'QA_NON_MOBILE_RESOURCE_LOADS_FIELD_INVALID');
    assert.equal(entry.metrics.nonMobileResourceLoads.length,contract.browser_qa.required_non_mobile_resource_load_count,'QA_NON_MOBILE_RESOURCE_LOADS_PRESENT');
    assert.equal(entry.metrics?.desktopUiMarkers,contract.browser_qa.required_desktop_ui_marker_count,'QA_DESKTOP_UI_MARKERS_PRESENT');
    assert(Array.isArray(entry.metrics?.undersized),'QA_TOUCH_TARGET_FIELD_INVALID');
    assert.deepEqual(entry.metrics.undersized,[],'QA_UNDERSIZED_TOUCH_TARGETS_PRESENT');
    assert(Array.isArray(entry.metrics?.minimumText),'QA_MINIMUM_TEXT_FIELD_INVALID');
    assert.deepEqual(entry.metrics.minimumText,[],'QA_TEXT_BELOW_MINIMUM_PRESENT');
    assert.equal(entry.metrics?.privateSentinelVisible,false,'QA_PRIVATE_SENTINEL_VISIBLE');
    if(entry.projectionMode==='live'){
      assert.equal(entry.metrics.signalAggregate,contract.browser_qa.required_live_revalidation.signal_state,'QA_EVIDENCE_BOUND_SIGNALS_NOT_LIVE');
      assert.notEqual(entry.metrics.kidult100State,'LIVE APPROVED','QA_K100_FALSE_LIVE');
      const expected=contract.browser_qa.required_live_revalidation;
      assert.equal(entry.revalidation?.atomicObservation?.state,expected.atomic_state,'QA_REVALIDATION_ATOMIC_STATE_MISMATCH');
      assert.equal(entry.revalidation?.atomicObservation?.mobileReady,expected.atomic_mobile_ready,'QA_REVALIDATION_ATOMIC_READY_MISMATCH');
      assert.equal(entry.revalidation?.atomicObservation?.verticalCount,expected.vertical_count,'QA_REVALIDATION_ATOMIC_VERTICAL_COUNT_MISMATCH');
      assert.equal(entry.revalidation?.timeoutObservation?.state,expected.timeout_state,'QA_REVALIDATION_TIMEOUT_STATE_MISMATCH');
      assert.equal(entry.revalidation?.timeoutObservation?.reason,expected.timeout_reason,'QA_REVALIDATION_TIMEOUT_REASON_MISMATCH');
      assert.equal(entry.revalidation?.timeoutObservation?.verticalCount,expected.vertical_count,'QA_REVALIDATION_TIMEOUT_VERTICAL_COUNT_MISMATCH');
      assert.equal(entry.revalidation?.timeoutObservation?.signalCount,expected.signal_count,'QA_REVALIDATION_TIMEOUT_SIGNAL_COUNT_MISMATCH');
      assert.equal(entry.revalidation?.timeoutObservation?.privateSentinelVisible,expected.private_sentinel_visible,'QA_REVALIDATION_TIMEOUT_PRIVATE_SENTINEL_VISIBLE');
    }
  }
  const journeys=report.cases.filter(entry=>entry.journey);
  assert.equal(journeys.length,contract.browser_qa.exact_mobile_owned_journey_cases,`QA_MOBILE_OWNED_JOURNEY_COUNT_MISMATCH:${journeys.length}`);
  for(const entry of journeys){
    assert.equal(entry.journey.before,contract.browser_qa.required_entry_surface,'QA_MOBILE_JOURNEY_INITIAL_SURFACE_MISMATCH');
    assert.equal(entry.journey.evidenceReached,true,'QA_MOBILE_EVIDENCE_NAVIGATION_FAILED');
    assert.equal(entry.journey.evidenceActive,true,'QA_MOBILE_EVIDENCE_NAV_NOT_ACTIVE');
    assert.equal(entry.journey.restored?.product,contract.browser_qa.required_product,'QA_MOBILE_RELOAD_PRODUCT_MISMATCH');
    assert.equal(entry.journey.restored?.entrySurface,contract.browser_qa.required_entry_surface,'QA_MOBILE_RELOAD_ENTRY_SURFACE_MISMATCH');
    assert.equal(entry.journey.restored?.horizontalOverflow,false,'QA_MOBILE_RELOAD_HORIZONTAL_OVERFLOW');
    assert.equal(entry.journey.restored?.evidenceActive,true,'QA_MOBILE_RELOAD_EVIDENCE_NAV_NOT_ACTIVE');
    assert.equal(entry.journey.landscape?.overflow,false,'QA_MOBILE_LANDSCAPE_OVERFLOW');
    assert(Number.isFinite(entry.journey.landscape?.fixedObstruction),'QA_MOBILE_LANDSCAPE_OBSTRUCTION_INVALID');
    assert(Number.isFinite(entry.journey.landscape?.viewport)&&entry.journey.landscape.viewport>0,'QA_MOBILE_LANDSCAPE_VIEWPORT_INVALID');
    assert(entry.journey.landscape.fixedObstruction<=entry.journey.landscape.viewport*.35,'QA_MOBILE_LANDSCAPE_OBSTRUCTION_EXCESSIVE');
    assert(Number.isFinite(entry.journey.landscape?.scrollPaddingTop)&&entry.journey.landscape.scrollPaddingTop<=24,'QA_MOBILE_LANDSCAPE_SCROLL_PADDING_EXCESSIVE');
  }
};

assert.equal(contract.id,'kidults-mobile-portal-public-promotion-gate-v1');
assert.equal(contract.version,'2.0.0');
assert.equal(contract.state,'CONTROL_HOLD__DEDICATED_REMOTE_PROJECT_NATIVE_OWNER_AND_DEVICE_ATTESTATION_NOT_BOUND');
assert.equal(contract.required_status_context,'KIDULTS Mobile Portal Public Promotion Gate V1');
assert.deepEqual(contract.portal_surface_paths,[`${surfaceRoot}/`]);
assert.equal(contract.browser_qa.runner,'scripts/kidults/portal/capture-mobile-portal-v1.mjs');
assert.equal(contract.browser_qa.report_path,'mobile-portal-report-v1.json');
assert.equal(contract.browser_qa.required_result,'PASS');
assert.equal(contract.browser_qa.exact_case_count,13);
assert.equal(contract.browser_qa.required_root,'/');
assert.deepEqual(contract.browser_qa.required_entry_paths,['/','/mobile','/mobile/']);
assert.deepEqual(contract.browser_qa.required_case_matrix,requiredCaseMatrix);
assert.equal(contract.browser_qa.required_product,'kidults-mobile-intelligence-portal');
assert.equal(contract.browser_qa.required_entry_surface,'mobile-independent');
assert.equal(contract.browser_qa.required_release,'mobile-release-001');
assert.equal(contract.browser_qa.required_projection_state,'NO_PROJECTION');
assert.deepEqual(contract.browser_qa.required_browsers,['chromium','webkit']);
assert.deepEqual(contract.browser_qa.required_viewport_widths,[320,375,390,430]);
assert.equal(contract.browser_qa.exact_mobile_owned_journey_cases,8);
assert.equal(contract.browser_qa.required_non_mobile_link_count,0);
assert.equal(contract.browser_qa.required_non_mobile_resource_load_count,0);
assert.equal(contract.browser_qa.required_desktop_ui_marker_count,0);
assert.equal(contract.browser_qa.required_runtime_error_count,0);
assert.equal(contract.browser_qa.required_serious_critical_axe_count,0);
assert.equal(contract.browser_qa.required_response_error_count,0);
assert.deepEqual(contract.browser_qa.required_live_revalidation,{
  atomic_state:'LIVE_APPROVED',atomic_mobile_ready:'true',signal_state:'LIVE APPROVED',timeout_state:'INVALID',timeout_reason:'MOBILE PROJECTION TIMEOUT',
  vertical_count:8,signal_count:6,private_sentinel_visible:false,
});
assert.deepEqual(contract.browser_qa.required_headers,requiredHeaders);
assert.equal(contract.physical_ios.required_for_every_portal_surface_change,true);
assert.equal(contract.physical_ios.tested_source_sha_binding,'ANCESTOR_OF_CURRENT_HEAD_WITH_IDENTICAL_SURFACE_DIGEST');
assert.equal(contract.physical_ios.bounded_checkout_depth,2);
assert.equal(contract.physical_ios.maximum_receipt_age_hours,24);
assert.equal(contract.physical_ios.minimum_lifecycle_cycles,30);
assert.deepEqual(contract.physical_ios.required_results,requiredPhysicalResults);
assert.equal(contract.physical_ios.device_identifier_collection,'FORBIDDEN');
assert.equal(contract.public_authorization.required,true);
assert.equal(contract.public_authorization.state,'VERIFIED_AUTHORIZED');
assert.equal(contract.public_authorization.maximum_authorization_age_hours,2);
assert.equal(contract.public_authorization.single_use,true);
assert.equal(contract.public_authorization.actor_binding,'GITHUB_REPOSITORY_OWNER');
assert.equal(contract.public_authorization.execution_actor_binding,'GITHUB_TRIGGERING_ACTOR_EQUALS_REPOSITORY_OWNER');
assert.equal(contract.public_authorization.nonce_issuance_receipt,'NONE');
assert.equal(contract.public_authorization.consume_once_receipt,'NONE');
assert.equal(contract.public_authorization.allowed_scope_without_approved_projection,'PUBLIC_MOBILE_PORTAL_SHELL_NON_LIVE');
assert.equal(contract.cloudflare_pages.project,'kidults-mobile-portal-staging');
assert.equal(contract.cloudflare_pages.remote_build_root,'apps/kidults-mobile-portal');
assert.equal(contract.cloudflare_pages.remote_publish_root,'apps/kidults-mobile-portal/public');
assert.equal(contract.cloudflare_pages.remote_project_binding,'UNBOUND');
assert.equal(contract.cloudflare_pages.preview_branch_policy_required,'BLOCK_NON_GOVERNED_PREVIEWS');
assert.equal(contract.cloudflare_pages.preview_is_release_evidence,false);
assert.equal(contract.truth_boundary.automated_webkit_is_physical_iphone,false);
assert.equal(contract.truth_boundary.missing_or_stale_physical_receipt,'FAIL_CLOSED');
assert.equal(contract.truth_boundary.canonical_public_entry_alias,'/');
assert.equal(contract.truth_boundary.canonical_mobile_root,'/mobile/');
assert.equal(contract.truth_boundary.canonical_public_asset,'/mobile/index.html');
assert.equal(contract.truth_boundary.cross_product_routes_in_artifact,0);
assert.equal(contract.truth_boundary.cross_product_files_in_artifact,0);
assert.equal(contract.truth_boundary.artifact_allowlist_validator,'scripts/kidults/portal/validate-independent-mobile-portal-v1.mjs');
assert.equal(contract.truth_boundary.native_required_status_binding,'UNPROVEN');
assert.equal(contract.truth_boundary.physical_device_attestation_authority,'UNBOUND');
assert.equal(contract.truth_boundary.owner_authorization_trust_root,'UNBOUND');
assert.equal(contract.truth_boundary.public,'HOLD_UNTIL_GATE_PASS');
assert.equal(contract.truth_boundary.production,'HOLD');
assert.equal(contract.truth_boundary.g5,'HOLD');

for(const marker of [
  'name: KIDULTS Mobile Portal Public Promotion Gate V1',
  'playwright/cli.js install --with-deps chromium webkit',
  'node scripts/kidults/portal/capture-mobile-portal-v1.mjs',
  'node scripts/kidults/portal/validate-independent-mobile-portal-v1.mjs --self-test',
  'mobile-portal-report-v1.json',
  "node scripts/kidults/portal/validate-mobile-portal-public-promotion-gate-v1.mjs",
  '[file.filename,file.previous_filename].filter(Boolean).some(isPortalSurface)',
  'EXPECTED_PROGRAM_OWNER: ${{ github.repository_owner }}',
  'AUTHORIZING_GITHUB_ACTOR: ${{ github.triggering_actor }}',
  'fetch-depth: 2',
  'if [ "${KIDULTS_PORTAL_SURFACE_CHANGED}" = true ]; then',
  'validate-mobile-portal-public-promotion-gate-v1.mjs --promotion',
  'validate-mobile-portal-public-promotion-gate-v1.mjs --contract',
]) assert.match(qaWorkflow,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
validatePromotionWorkflowRouting(qaWorkflow);

assert.equal(qaWorkflow.includes('apps/kidults-enterprise-staging/'),false,'ENTERPRISE_APP_MUST_NOT_GATE_INDEPENDENT_MOBILE');
assert.equal(qaWorkflow.includes('portal-r001'),false,'R001_MUST_NOT_GATE_INDEPENDENT_MOBILE');
const redirects=fs.readFileSync(redirectsPath,'utf8');
assert.match(redirects,/^\/\s+\/mobile\/index\.html\s+200$/m,'MOBILE_ROOT_ALIAS_REWRITE_REQUIRED');
assert.match(redirects,/^\/mobile\s+\/mobile\/index\.html\s+200$/m,'CANONICAL_MOBILE_ROOT_NO_SLASH_REWRITE_REQUIRED');
assert.match(redirects,/^\/mobile\/\s+\/mobile\/index\.html\s+200$/m,'CANONICAL_MOBILE_ROOT_REWRITE_REQUIRED');
const headers=fs.readFileSync(headersPath,'utf8');
const headerRules=new Map();
let activeHeaderRule=null;
for(const line of headers.split(/\r?\n/)){
  if(!line.trim()||line.trimStart().startsWith('#')) continue;
  if(!/^\s/.test(line)){
    activeHeaderRule=line.trim();
    headerRules.set(activeHeaderRule,new Map());
    continue;
  }
  const separator=line.indexOf(':');
  if(activeHeaderRule&&separator>0) headerRules.get(activeHeaderRule).set(line.slice(0,separator).trim().toLowerCase(),line.slice(separator+1).trim());
}
for(const route of ['/','/mobile*','/api/mobile/v1/projection']) assert.equal(headerRules.get(route)?.get('x-robots-tag'),'noindex, nofollow',`NOINDEX_HEADER_MISSING:${route}`);
for(const route of ['/','/mobile*']){
  const rule=headerRules.get(route);
  assert(rule?.get('content-security-policy')?.includes("frame-ancestors 'none'"),`MOBILE_CSP_HEADER_MISSING:${route}`);
  assert(rule?.get('permissions-policy')?.includes('camera=()'),`MOBILE_PERMISSIONS_HEADER_MISSING:${route}`);
  assert.equal(rule?.get('referrer-policy'),'no-referrer',`MOBILE_REFERRER_HEADER_MISSING:${route}`);
  assert.equal(rule?.get('x-content-type-options'),'nosniff',`MOBILE_NOSNIFF_HEADER_MISSING:${route}`);
  assert.equal(rule?.get('x-frame-options'),'DENY',`MOBILE_FRAME_HEADER_MISSING:${route}`);
}
validateQaRunnerContract(qaRunner);

for(const prefix of [
  'apps/kidults-mobile-portal/',
  'scripts/kidults/portal/',
  'coordination/kidults/portal/',
]){
  assert(governedPolicy.governed_path_prefixes.includes(prefix),`GOVERNED_POLICY_PREFIX_MISSING:${prefix}`);
  assert(governedWorkflow.includes(`'${prefix}'`),`GOVERNED_WORKFLOW_PREFIX_MISSING:${prefix}`);
}

assert.equal(receipt.id,'kidults-mobile-portal-physical-ios-acceptance-v1');
assert.equal(receipt.version,'2.0.0');
assert.equal(receipt.device.class,'PHYSICAL_IPHONE');
assert.equal(receipt.device.browser,'MOBILE_SAFARI');
assert.equal(receipt.device.persistent_device_identifier,null);
assert.equal(receipt.authority_boundary.simulator_or_playwright_is_physical_device,false);
assert.equal(receipt.authority_boundary.public,'HOLD');
assert.equal(receipt.authority_boundary.production,'HOLD');
assert.equal(receipt.authority_boundary.g5,'HOLD');

assert.equal(authorization.id,'kidults-mobile-portal-public-authorization-v1');
assert.equal(authorization.version,'2.0.0');
assert.equal(authorization.scope,'PUBLIC_MOBILE_PORTAL_SHELL_NON_LIVE');
assert.equal(authorization.target.provider,'CLOUDFLARE_PAGES');
assert.equal(authorization.target.project,contract.cloudflare_pages.project);
assert.equal(authorization.target.build_root,contract.cloudflare_pages.remote_build_root);
assert.equal(authorization.target.publish_root,contract.cloudflare_pages.remote_publish_root);
assert.equal(authorization.target.path,'/mobile/');
assert.equal(authorization.target.entry_alias,'/');
assert.equal(authorization.target.resolved_asset,'/mobile/index.html');
assert.equal(authorization.single_use.bound_to_one_pull_request_and_surface_digest,true);
assert.equal(authorization.single_use.reusable_after_surface_change,false);
assert.equal(authorization.truth_boundary.live_approved_projection,'NONE');
assert.equal(authorization.truth_boundary.empirical_intelligence,false);
assert.equal(authorization.truth_boundary.public_live_intelligence,'HOLD');
assert.equal(authorization.truth_boundary.production,'HOLD');
assert.equal(authorization.truth_boundary.g5,'HOLD');

if(mode!=='promotion'){
  assert.equal(receipt.state,'HOLD_NOT_EXECUTED','NON_PROMOTION_PHYSICAL_RECEIPT_MUST_HOLD');
  assert.equal(receipt.portal_surface_digest,null,'NON_PROMOTION_PHYSICAL_DIGEST_MUST_BE_NULL');
  assert.equal(receipt.tested_source_sha,null,'NON_PROMOTION_PHYSICAL_SOURCE_SHA_MUST_BE_NULL');
  assert.equal(receipt.device.model,null,'NON_PROMOTION_PHYSICAL_MODEL_MUST_BE_NULL');
  assert.equal(receipt.device.ios_version,null,'NON_PROMOTION_PHYSICAL_IOS_MUST_BE_NULL');
  assert.equal(receipt.device.browser_version,null,'NON_PROMOTION_PHYSICAL_BROWSER_MUST_BE_NULL');
  assert.equal(receipt.tester.github_login,null,'NON_PROMOTION_PHYSICAL_TESTER_MUST_BE_NULL');
  assert.equal(receipt.started_at,null,'NON_PROMOTION_PHYSICAL_START_MUST_BE_NULL');
  assert.equal(receipt.completed_at,null,'NON_PROMOTION_PHYSICAL_COMPLETION_MUST_BE_NULL');
  assert.equal(receipt.lifecycle_cycles,0,'NON_PROMOTION_PHYSICAL_CYCLES_MUST_BE_ZERO');
  assert.deepEqual(receipt.results,[],'NON_PROMOTION_PHYSICAL_RESULTS_MUST_BE_EMPTY');
  assert.deepEqual(receipt.runtime_errors,[],'NON_PROMOTION_PHYSICAL_ERRORS_MUST_BE_EMPTY');
  assert.equal(receipt.crash_count,null,'NON_PROMOTION_PHYSICAL_CRASH_COUNT_MUST_BE_NULL');
  assert.equal(receipt.stale_render_count,null,'NON_PROMOTION_PHYSICAL_STALE_COUNT_MUST_BE_NULL');
  assert.equal(receipt.horizontal_overflow_count,null,'NON_PROMOTION_PHYSICAL_OVERFLOW_COUNT_MUST_BE_NULL');
  assert.equal(authorization.state,'HOLD_NOT_AUTHORIZED','NON_PROMOTION_PUBLIC_AUTHORIZATION_MUST_HOLD');
  for(const field of ['authorization_id','authorized_at','expires_at','authorized_pull_request','authorization_nonce','portal_surface_digest']){
    assert.equal(authorization[field],null,`NON_PROMOTION_AUTHORIZATION_FIELD_MUST_BE_NULL:${field}`);
  }
  assert.equal(authorization.actor.github_login,null,'NON_PROMOTION_AUTHORIZATION_ACTOR_MUST_BE_NULL');
}

if(mode==='self-test'){
  // The closure suite intentionally uses a depth-1 checkout. Exercise the
  // binding logic with deterministic injected ancestry/digest functions so
  // the negative canary never depends on whatever history CI happened to
  // fetch. Promotion mode still proves the real Git relationship and bytes.
  const selfTestHead='1'.repeat(40);
  const selfTestAncestor='0'.repeat(40);
  const selfTestSurfaceDigest=`sha256:${'a'.repeat(64)}`;
  validateTestedSourceBinding({
    testedSourceSha:selfTestAncestor,
    currentHeadSha:selfTestHead,
    receiptSurfaceDigest:selfTestSurfaceDigest,
    currentSurfaceDigest:selfTestSurfaceDigest,
    ancestorCheck:(ancestor,descendant)=>ancestor===selfTestAncestor&&descendant===selfTestHead,
    digestAtRef:()=>selfTestSurfaceDigest,
  });
  assert.throws(
    ()=>validateProgramOwner({github_login:'non-owner',role:'PROGRAM_OWNER'},'johnkim9524-collab'),
    error=>error?.message?.startsWith('PUBLIC_AUTHORIZATION_ACTOR_NOT_REPOSITORY_OWNER'),
  );
  assert.throws(
    ()=>validateTestedSourceBinding({
      testedSourceSha:'0'.repeat(40),
      currentHeadSha:'1'.repeat(40),
      receiptSurfaceDigest:'sha256:'+'a'.repeat(64),
      currentSurfaceDigest:'sha256:'+'a'.repeat(64),
      ancestorCheck:()=>false,
      digestAtRef:()=>`sha256:${'a'.repeat(64)}`,
    }),
    error=>error?.message?.startsWith('PHYSICAL_IPHONE_TESTED_SHA_NOT_ANCESTOR_OF_CURRENT_HEAD'),
  );
  assert.throws(
    ()=>validateTestedSourceBinding({
      testedSourceSha:'0'.repeat(40),
      currentHeadSha:'1'.repeat(40),
      receiptSurfaceDigest:'sha256:'+'a'.repeat(64),
      currentSurfaceDigest:'sha256:'+'a'.repeat(64),
      ancestorCheck:()=>true,
      digestAtRef:ref=>ref==='0'.repeat(40)?`sha256:${'b'.repeat(64)}`:`sha256:${'a'.repeat(64)}`,
    }),
    error=>error?.message?.startsWith('PHYSICAL_IPHONE_SURFACE_DRIFT_AFTER_TEST'),
  );
  const qaCase=matrixEntry=>{
    const [browser,entryPath,projectionMode,size,journeyState]=matrixEntry.split('|');
    const [width,height]=size.split('x').map(Number);
    const state=projectionMode==='live'?'LIVE_APPROVED':['invalid','forged'].includes(projectionMode)?'INVALID':contract.browser_qa.required_projection_state;
    const metrics={
      product:contract.browser_qa.required_product,
      entrySurface:contract.browser_qa.required_entry_surface,
      release:contract.browser_qa.required_release,
      state,
      mobileReady:'true',
      mainCount:1,
      projectionBeforeMain:true,
      projectionInFirstFold:true,
      verticalCount:8,
      signalCount:6,
      bottomNavCount:4,
      activeNavCount:1,
      nonMobileLinks:[],
      desktopUiMarkers:0,
      nonMobileResourceLoads:[],
      signalAggregate:projectionMode==='live'?'LIVE APPROVED':'NOT AVAILABLE',
      kidult100State:'NOT AVAILABLE',
      privateSentinelVisible:false,
      horizontalOverflow:false,
      undersized:[],
      minimumText:[],
    };
    const journey={
      before:contract.browser_qa.required_entry_surface,
      evidenceReached:true,
      evidenceActive:true,
      restored:{product:contract.browser_qa.required_product,entrySurface:contract.browser_qa.required_entry_surface,horizontalOverflow:false,evidenceActive:true},
      landscape:{overflow:false,fixedObstruction:100,scrollPaddingTop:12,viewport:400},
    };
    const revalidation=projectionMode==='live'?{
      atomicObservation:{state:'LIVE_APPROVED',mobileReady:'true',verticalCount:8,verticalListHeight:488,brief:'A governed Projection is available.'},
      timeoutObservation:{state:'INVALID',reason:'MOBILE PROJECTION TIMEOUT',verticalCount:8,signalCount:6,privateSentinelVisible:false},
    }:null;
    return {browser,entryPath,projectionMode,viewport:{width,height},metrics,axeDetails:[],runtimeErrors:[],responseErrors:[],harnessDiagnostics:[],journey:journeyState==='journey'?journey:null,revalidation,failures:[]};
  };
  const validReport={
    root:'/',
    visual_evidence:{screenshot_context:'AXE_ISOLATED_BYPASS_CSP',runtime_security_evidence:false,strict_runtime_evidence:'METRICS_PAGEERROR_CONSOLE_HTTP'},
    cases:requiredCaseMatrix.map(qaCase),
    failures:[],
  };
  validateMobileQaReport(validReport);
  const desktopLinkReport=structuredClone(validReport);
  desktopLinkReport.cases[0].metrics.nonMobileLinks=['/workspace'];
  assert.throws(()=>validateMobileQaReport(desktopLinkReport),error=>error?.message?.startsWith('QA_NON_MOBILE_LINKS_PRESENT'));
  const desktopResourceReport=structuredClone(validReport);
  desktopResourceReport.cases[0].metrics.nonMobileResourceLoads=['https://example.invalid/portal-r001/portal.js'];
  assert.throws(()=>validateMobileQaReport(desktopResourceReport),error=>error?.message?.startsWith('QA_NON_MOBILE_RESOURCE_LOADS_PRESENT'));
  const missingDesktopLinks=structuredClone(validReport);
  delete missingDesktopLinks.cases[0].metrics.nonMobileLinks;
  assert.throws(()=>validateMobileQaReport(missingDesktopLinks),error=>error?.message?.startsWith('QA_NON_MOBILE_LINKS_FIELD_INVALID'));
  const missingDesktopResources=structuredClone(validReport);
  delete missingDesktopResources.cases[0].metrics.nonMobileResourceLoads;
  assert.throws(()=>validateMobileQaReport(missingDesktopResources),error=>error?.message?.startsWith('QA_NON_MOBILE_RESOURCE_LOADS_FIELD_INVALID'));
  const shortenedMatrix=structuredClone(validReport);
  shortenedMatrix.cases.pop();
  assert.throws(()=>validateMobileQaReport(shortenedMatrix),error=>error?.message?.startsWith('QA_CASE_COUNT_MISMATCH'));
  assert.throws(()=>validateQaRunnerContract(qaRunner.replace('if (report.failures.length)','if (false)')),error=>error?.message?.startsWith('QA_RUNNER_SEMANTIC_MARKER_MISSING'));
  assert.throws(()=>validateQaRunnerContract(qaRunner.replace('nonMobileLinks:','mobileOnlyLinks:')),error=>error?.message?.startsWith('QA_RUNNER_SEMANTIC_MARKER_MISSING'));
  assert.throws(()=>validateQaRunnerContract(qaRunner.replace('new AxeBuilder({ page: axePage })','new AxeBuilder({ page })')),error=>error?.message?.startsWith('QA_RUNNER_SEMANTIC_MARKER_MISSING'));
  assert.throws(()=>validateQaRunnerContract(qaRunner.replace('await axePage.screenshot(', 'await page.screenshot(')),error=>error?.message?.startsWith('QA_RUNNER_SEMANTIC_MARKER_MISSING')||error?.message?.startsWith('QA_SCREENSHOT_MUST_NOT_MUTATE_RUNTIME_EVIDENCE_PAGE'));
  assert.throws(()=>validateQaRunnerContract(qaRunner.replace("animations: 'allow', caret: 'initial'","animations: 'allow'")),error=>error?.message?.startsWith('QA_RUNNER_SEMANTIC_MARKER_MISSING'));
  assert.throws(()=>validatePromotionWorkflowRouting(qaWorkflow.replace('validate-mobile-portal-public-promotion-gate-v1.mjs --promotion','validate-mobile-portal-public-promotion-gate-v1.mjs --contract')),error=>error?.message?.startsWith('PROMOTION_WORKFLOW_PROMOTION_MODE_MISSING'));
  assert.throws(()=>validatePromotionWorkflowRouting(qaWorkflow.replace('changed=files.some(isPortalSurface);','changed=false;')),error=>error?.message?.startsWith('PROMOTION_WORKFLOW_PUSH_SURFACE_DETECTION_DRIFT'));
  assert.throws(()=>validatePromotionWorkflowRouting(qaWorkflow.replace('on:\n','on:\n  workflow_dispatch:\n')),error=>error?.message?.startsWith('PROMOTION_WORKFLOW_MANUAL_DISPATCH_FORBIDDEN'));
  assert.equal(qaWorkflow.includes('[file.filename,file.previous_filename].filter(Boolean).some(isPortalSurface)'),true,'RENAMED_PORTAL_SURFACE_PREVIOUS_FILENAME_NOT_GUARDED');
  console.log(JSON.stringify({
    id:'kidults-mobile-portal-public-promotion-gate-negative-canaries-v1',
    state:'VERIFIED_PASS',
    positive_ancestor_surface_binding:'VERIFIED_PASS',
    rejected:['NON_OWNER_PROGRAM_OWNER_ASSERTION','NON_ANCESTOR_PHYSICAL_RECEIPT','PORTAL_SURFACE_DRIFT_AFTER_PHYSICAL_TEST','PORTAL_RENAME_OLD_PATH_OMISSION','R001_CANONICAL_SURFACE_RECOUPLING','NON_MOBILE_LINK_IN_QA','NON_MOBILE_RESOURCE_IN_QA','MISSING_NON_MOBILE_LINK_FIELD','MISSING_NON_MOBILE_RESOURCE_FIELD','SHORTENED_QA_CASE_MATRIX','QA_RUNNER_FAILURE_EXIT_REMOVAL','QA_RUNNER_NON_MOBILE_DETECTOR_REMOVAL','AXE_RUNTIME_PAGE_CSP_BYPASS','SCREENSHOT_RUNTIME_PAGE_CSP_MUTATION','SCREENSHOT_CARET_STYLE_INJECTION','PROMOTION_FLAG_REMOVAL','PUSH_SURFACE_DETECTION_FORCE_FALSE','MANUAL_DISPATCH_FALSE_GREEN'],
    public:'HOLD',
    production:'HOLD',
    g5:'HOLD',
  },null,2));
  process.exit(0);
}

if(mode==='promotion'){
  const exactSurfaceDigest=surfaceDigest();
  assert.equal(authorization.state,'VERIFIED_AUTHORIZED','PUBLIC_AUTHORIZATION_NOT_PASS');
  assert.notEqual(contract.public_authorization.nonce_issuance_receipt,'NONE','PUBLIC_AUTHORIZATION_NONCE_ISSUER_UNBOUND');
  assert.notEqual(contract.public_authorization.consume_once_receipt,'NONE','PUBLIC_AUTHORIZATION_CONSUME_ONCE_UNBOUND');
  assert.notEqual(contract.truth_boundary.native_required_status_binding,'UNPROVEN','PUBLIC_PROMOTION_NATIVE_REQUIRED_STATUS_UNPROVEN');
  assert.notEqual(contract.truth_boundary.physical_device_attestation_authority,'UNBOUND','PHYSICAL_DEVICE_ATTESTATION_AUTHORITY_UNBOUND');
  assert.notEqual(contract.truth_boundary.owner_authorization_trust_root,'UNBOUND','PUBLIC_AUTHORIZATION_TRUST_ROOT_UNBOUND');
  assert.match(authorization.authorization_id||'',/^KIDULTS-PUBLIC-[A-Z0-9-]{12,}$/,'PUBLIC_AUTHORIZATION_ID_INVALID');
  const expectedOwner=process.env.EXPECTED_PROGRAM_OWNER||'';
  const authorizingActor=process.env.AUTHORIZING_GITHUB_ACTOR||'';
  assert.match(expectedOwner,/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,'EXPECTED_PROGRAM_OWNER_REQUIRED');
  assert.equal(authorizingActor,expectedOwner,'PUBLIC_AUTHORIZATION_EXECUTION_ACTOR_NOT_REPOSITORY_OWNER');
  validateProgramOwner(authorization.actor,expectedOwner);
  assert.equal(authorization.actor.github_login,authorizingActor,'PUBLIC_AUTHORIZATION_ACTOR_EVENT_MISMATCH');
  assert(Number.isInteger(authorization.authorized_pull_request)&&authorization.authorized_pull_request>0,'PUBLIC_AUTHORIZATION_PR_INVALID');
  assert.match(process.env.PR_NUMBER||'',/^[1-9]\d*$/,'PUBLIC_AUTHORIZATION_PR_CONTEXT_REQUIRED');
  assert.equal(authorization.authorized_pull_request,Number(process.env.PR_NUMBER),'PUBLIC_AUTHORIZATION_PR_MISMATCH');
  assert.match(authorization.authorization_nonce||'',/^[A-Za-z0-9_-]{24,128}$/,'PUBLIC_AUTHORIZATION_NONCE_INVALID');
  assert.equal(authorization.portal_surface_digest,exactSurfaceDigest,'PUBLIC_AUTHORIZATION_SURFACE_DIGEST_MISMATCH');
  const authorizedAt=Date.parse(authorization.authorized_at||'');
  const expiresAt=Date.parse(authorization.expires_at||'');
  assert(Number.isFinite(authorizedAt)&&Number.isFinite(expiresAt)&&expiresAt>authorizedAt,'PUBLIC_AUTHORIZATION_WINDOW_INVALID');
  assert((expiresAt-authorizedAt)/3_600_000<=contract.public_authorization.maximum_authorization_age_hours,'PUBLIC_AUTHORIZATION_WINDOW_TOO_LONG');
  assert(Date.now()>=authorizedAt&&Date.now()<=expiresAt,'PUBLIC_AUTHORIZATION_EXPIRED_OR_EARLY');
  assert.equal(receipt.state,'VERIFIED_PASS','PHYSICAL_IPHONE_RECEIPT_NOT_PASS');
  const currentHeadSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  validateTestedSourceBinding({
    testedSourceSha:receipt.tested_source_sha,
    currentHeadSha,
    receiptSurfaceDigest:receipt.portal_surface_digest,
    currentSurfaceDigest:exactSurfaceDigest,
  });
  const testedUrl=new URL(receipt.tested_url||'https://invalid.invalid/');
  assert.equal(testedUrl.protocol,'https:','PHYSICAL_IPHONE_TESTED_URL_PROTOCOL_INVALID');
  assert.equal(testedUrl.host,`${contract.cloudflare_pages.project}.pages.dev`,'PHYSICAL_IPHONE_TESTED_HOST_INVALID');
  assert.equal(testedUrl.pathname,'/mobile/','PHYSICAL_IPHONE_TESTED_PATH_INVALID');
  assert.equal(testedUrl.search,'','PHYSICAL_IPHONE_TESTED_QUERY_FORBIDDEN');
  assert.equal(testedUrl.hash,'','PHYSICAL_IPHONE_TESTED_FRAGMENT_FORBIDDEN');
  assert.match(receipt.device.model||'',/^iPhone\s.+/,'PHYSICAL_IPHONE_MODEL_REQUIRED');
  assert.match(receipt.device.ios_version||'',/^\d+\.\d+(?:\.\d+)?$/,'IOS_VERSION_REQUIRED');
  assert.match(receipt.device.browser_version||'',/^\d+(?:\.\d+){1,2}$/,'MOBILE_SAFARI_VERSION_REQUIRED');
  assert.match(receipt.tester.github_login||'',/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,'TESTER_GITHUB_LOGIN_REQUIRED');
  assert(Number.isInteger(receipt.lifecycle_cycles)&&receipt.lifecycle_cycles>=contract.physical_ios.minimum_lifecycle_cycles,'LIFECYCLE_CYCLES_INSUFFICIENT');
  assert.equal(receipt.crash_count,0,'PHYSICAL_IPHONE_CRASH_OBSERVED');
  assert.equal(receipt.stale_render_count,0,'PHYSICAL_IPHONE_STALE_RENDER_OBSERVED');
  assert.equal(receipt.horizontal_overflow_count,0,'PHYSICAL_IPHONE_HORIZONTAL_OVERFLOW_OBSERVED');
  assert.deepEqual(receipt.runtime_errors,[],'PHYSICAL_IPHONE_RUNTIME_ERROR_OBSERVED');
  assert.equal(new Set(receipt.results).size,requiredPhysicalResults.length,'PHYSICAL_IPHONE_RESULTS_DUPLICATE_OR_COUNT_MISMATCH');
  assert.deepEqual([...receipt.results].sort(),[...requiredPhysicalResults].sort(),'PHYSICAL_IPHONE_RESULTS_EXACT_SET_MISMATCH');
  const completed=Date.parse(receipt.completed_at||'');
  assert(Number.isFinite(completed),'PHYSICAL_IPHONE_COMPLETED_AT_INVALID');
  const ageHours=(Date.now()-completed)/3_600_000;
  assert(ageHours>=0&&ageHours<=contract.physical_ios.maximum_receipt_age_hours,`PHYSICAL_IPHONE_RECEIPT_STALE:${ageHours}`);

  const reportPath=process.env.KIDULTS_PORTAL_QA_REPORT||'/tmp/kidults-mobile-public-qa-v1/mobile-portal-report-v1.json';
  const toolchainPath=process.env.KIDULTS_PORTAL_QA_TOOLCHAIN_RECEIPT||'/tmp/kidults-mobile-qa/toolchain-receipt.json';
  const reportBytes=fs.readFileSync(reportPath);
  const report=JSON.parse(reportBytes.toString('utf8'));
  const toolchain=readJson(toolchainPath);
  validateMobileQaReport(report);
  assert.equal(toolchain.state,contract.browser_qa.toolchain_receipt_state);
  assert.equal(toolchain.failure_class,null,'QA_TOOLCHAIN_FAILURE_CLASS_NOT_NULL');
  assert.equal(toolchain.browser_qa_result,contract.browser_qa.required_result);
  assert.equal(toolchain.browser_qa_report_sha256,sha256(reportBytes),'QA_TOOLCHAIN_REPORT_DIGEST_MISMATCH');
  assert.equal(toolchain.source_sha,currentHeadSha,'QA_TOOLCHAIN_SOURCE_SHA_MISMATCH');
  assert.equal(toolchain.checked_out_sha,currentHeadSha,'QA_TOOLCHAIN_CHECKED_OUT_SHA_MISMATCH');
  assert.equal(toolchain.runner_path,contract.browser_qa.runner,'QA_TOOLCHAIN_RUNNER_PATH_MISMATCH');
  assert.equal(toolchain.runner_sha256,sha256(fs.readFileSync(contract.browser_qa.runner)),'QA_TOOLCHAIN_RUNNER_DIGEST_MISMATCH');
  assert.equal(toolchain.workflow_path,qaWorkflowPath,'QA_TOOLCHAIN_WORKFLOW_PATH_MISMATCH');
  assert.equal(toolchain.workflow_sha256,sha256(fs.readFileSync(qaWorkflowPath)),'QA_TOOLCHAIN_WORKFLOW_DIGEST_MISMATCH');
  assert.equal(toolchain.package_path,qaPackagePath,'QA_TOOLCHAIN_PACKAGE_PATH_MISMATCH');
  assert.equal(toolchain.package_sha256,sha256(fs.readFileSync(qaPackagePath)),'QA_TOOLCHAIN_PACKAGE_DIGEST_MISMATCH');
  assert.equal(toolchain.lock_path,qaLockPath,'QA_TOOLCHAIN_LOCK_PATH_MISMATCH');
  assert.equal(toolchain.lock_sha256,sha256(fs.readFileSync(qaLockPath)),'QA_TOOLCHAIN_LOCK_DIGEST_MISMATCH');
  assert.equal(toolchain.builder_path,qaReceiptBuilderPath,'QA_TOOLCHAIN_BUILDER_PATH_MISMATCH');
  assert.equal(toolchain.builder_sha256,sha256(fs.readFileSync(qaReceiptBuilderPath)),'QA_TOOLCHAIN_BUILDER_DIGEST_MISMATCH');
  assert.equal(toolchain.supply_validator_path,qaSupplyValidatorPath,'QA_TOOLCHAIN_SUPPLY_VALIDATOR_PATH_MISMATCH');
  assert.equal(toolchain.supply_validator_sha256,sha256(fs.readFileSync(qaSupplyValidatorPath)),'QA_TOOLCHAIN_SUPPLY_VALIDATOR_DIGEST_MISMATCH');
  assert.equal(toolchain.installed_package_records,toolchain.locked_package_records,'QA_TOOLCHAIN_INSTALLED_GRAPH_COUNT_MISMATCH');
}

console.log(JSON.stringify({
  id:'kidults-mobile-portal-public-promotion-gate-receipt-v1',
  state:mode==='promotion'?'VERIFIED_PASS':'CONTROL_HOLD_VERIFIED',
  mode,
  portal_surface_digest:surfaceDigest(),
  physical_ios_receipt_state:receipt.state,
  public_authorization_state:authorization.state,
  public:mode==='promotion'?'AUTHORIZED_FOR_EXACT_SURFACE_ONLY':'HOLD',
  production:'HOLD',
  g5:'HOLD',
},null,2));
