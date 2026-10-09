export const CANONICAL_ENVELOPE_PATH="coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json";
export const CANONICAL_ENVELOPE_ID="kidults-autonomous-approval-policy-envelope-v1";
export const MUTATING_EXECUTION_LIBRARIES=Object.freeze([
  "scripts/kidults/kpmo/lib/autonomous-terminal-immutable-v1.mjs",
  "scripts/kidults/kpmo/lib/postmerge-recovery-signed-ledger-client-v1.mjs",
  "scripts/kidults/kpmo/lib/resume-dispatch-fanout-v1.mjs",
  "scripts/kidults/staging-operations/lib/broker-resume-dispatch-v1.mjs",
  "scripts/kidults/staging-operations/lib/resume-operation-v1.mjs",
  "scripts/kidults/staging-operations/lib/dynamodb-operation-ledger-v1.mjs",
  "scripts/kidults/staging-operations/lib/postgres-transition-ledger-v1.mjs",
]);
export const EXPLICIT_EXECUTION_CONTROLS=Object.freeze([
  "infrastructure/aws/staging/autonomous-landing-deployer-bootstrap-v1.json",
  "scripts/governance/validate-autonomous-landing-staging-deployment-v1.mjs",
  "scripts/kidults/staging-operations/lib/github-lifecycle-resume-v1.mjs",
  "scripts/kidults/staging-operations/lib/github-lifecycle-readback-v1.mjs",
  "scripts/kidults/staging-operations/lib/github-lifecycle-executor-v1.mjs",
  ...MUTATING_EXECUTION_LIBRARIES,
]);

export const ALLOWED_ROUTES=new Set(["CANONICAL_ENVELOPE","INTERNAL_REVERSIBLE","STAGING_BOUNDED","OWNER_RESERVED","DOMAIN_ADJUDICATION","NON_EXECUTING_REFERENCE"]);
export const classifyApprovalInventoryPath=file=>{
  if(EXPLICIT_EXECUTION_CONTROLS.includes(file)||/^(coordination\/kidults\/(governance|kpmo)\/|docs\/governance\/|\.github\/workflows\/|scripts\/(governance|kidults\/kpmo)\/|tests\/governance\/)/.test(file))return 'EXECUTION_AUTHORIZATION_CONTROL';
  return /^(docs\/|coordination\/)/.test(file)?'DOMAIN_ADJUDICATION_OR_DOCUMENTATION':'REFERENCE_OR_IMPLEMENTATION';
};
export const ALLOWED_EXEMPTIONS=new Set([
  "NON_EXECUTING_POLICY_TEST_DOCUMENT_OR_RECORD",
  "NON_MUTATING_VALIDATOR_OR_LIBRARY",
  "EXACT_ACTION_OWNER_OR_EXTERNAL_BOUNDARY",
  "LEGACY_STAGING_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER",
  "LEGACY_INTERNAL_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER",
]);
// Conservative source indicators cover renamed/new adapters as well as the
// exact registry above. Classification grants no execution authority.
const protectedMutationSource=/\b(?:put-object|CREATE_RECOVERY_APPROVAL|CONSUME_RECOVERY_RESERVATION|ACK_RECOVERY_IMMUTABLE_RECEIPT)\b|\b(?:resumeOperation|resumeDispatchFanout)\s*\(|\bawait\s+(?:execute|send)\s*\(|\.request\(\s*['"](?:Put|Update|Delete)['"]|\bmethod\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/;

export const routeAuthorizationControl = (file, source) => {
  if (/OWNER_RESERVED_(STAGING_INFRA_CHANGE|EXTERNAL_SECRET_CALL)/.test(source)) return {
    route:"OWNER_RESERVED",
    coverage:{mode:"EXEMPTION",reason_code:"EXACT_ACTION_OWNER_OR_EXTERNAL_BOUNDARY"},
  };
  const referencesEnvelope=source.includes(CANONICAL_ENVELOPE_PATH)||source.includes(CANONICAL_ENVELOPE_ID);
  if (referencesEnvelope) return {
    route:"CANONICAL_ENVELOPE",
    coverage:{mode:"CONSUMER",consumer:file,source_reference:source.includes(CANONICAL_ENVELOPE_PATH)?CANONICAL_ENVELOPE_PATH:CANONICAL_ENVELOPE_ID},
  };
  if (/^infrastructure\/aws\/staging\//.test(file)) return {route:"STAGING_BOUNDED",coverage:{mode:"EXEMPTION",reason_code:"LEGACY_STAGING_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER"}};
  if (/^(tests\/|docs\/)|\.(md|json)$/.test(file)) return {route:"NON_EXECUTING_REFERENCE",coverage:{mode:"EXEMPTION",reason_code:"NON_EXECUTING_POLICY_TEST_DOCUMENT_OR_RECORD"}};
  // These libraries compose actual protected writes; /lib/ does not make
  // them non-mutating validators. Keep activation fail-closed and inventoried.
  if (/^scripts\/kidults\/staging-operations\/lib\/github-lifecycle-(resume|readback|executor)-v1\.mjs$/.test(file)) return {route:"STAGING_BOUNDED",coverage:{mode:"EXEMPTION",reason_code:"LEGACY_STAGING_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER"}};
  if (/(production-release|direct-owner|emergency|legal-commercial|provider-contact|credential|atomic-governed-landing|governed-landing-authorization)/i.test(file)) return {route:"OWNER_RESERVED",coverage:{mode:"EXEMPTION",reason_code:"EXACT_ACTION_OWNER_OR_EXTERNAL_BOUNDARY"}};
  if (MUTATING_EXECUTION_LIBRARIES.includes(file)||/\/lib\//.test(file)&&protectedMutationSource.test(source)) return {route:"STAGING_BOUNDED",coverage:{mode:"EXEMPTION",reason_code:"LEGACY_STAGING_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER"}};
  // A validator name or /lib/ directory is not evidence of non-mutation.
  // Unknown implementations retain the fail-closed pending-consumer route.
  if (/(staging|shadow|postgres|object-lock|cloudtrail)/i.test(file)) return {route:"STAGING_BOUNDED",coverage:{mode:"EXEMPTION",reason_code:"LEGACY_STAGING_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER"}};
  return {route:"INTERNAL_REVERSIBLE",coverage:{mode:"EXEMPTION",reason_code:"LEGACY_INTERNAL_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER"}};
};

export const validateAuthorizationRoutingCoverage = ({files,readSource,fail}) => {
  const executionControls=files.filter(value=>value.classification==="EXECUTION_AUTHORIZATION_CONTROL");
  const routeCounts={};
  let consumers=0;
  let exemptions=0;
  for (const entry of executionControls) {
    const routing=entry.authorization_routing;
    if (!routing||!ALLOWED_ROUTES.has(routing.route)||!routing.coverage) fail(`EXECUTION_CONTROL_ROUTE_MISSING:${entry.path}`);
    routeCounts[routing.route]=(routeCounts[routing.route]||0)+1;
    const source=readSource(entry.path);
    if (routing.coverage.mode==="CONSUMER") {
      consumers+=1;
      if (routing.route!=="CANONICAL_ENVELOPE"||routing.coverage.consumer!==entry.path) fail(`EXECUTION_CONTROL_CONSUMER_INVALID:${entry.path}`);
      if (![CANONICAL_ENVELOPE_PATH,CANONICAL_ENVELOPE_ID].includes(routing.coverage.source_reference)) fail(`EXECUTION_CONTROL_REFERENCE_INVALID:${entry.path}`);
      if (!source.includes(routing.coverage.source_reference)) fail(`EXECUTION_CONTROL_CONSUMER_NOT_REFERENCING_ENVELOPE:${entry.path}`);
    } else if (routing.coverage.mode==="EXEMPTION") {
      exemptions+=1;
      if (!ALLOWED_EXEMPTIONS.has(routing.coverage.reason_code)) fail(`EXECUTION_CONTROL_EXEMPTION_INVALID:${entry.path}`);
      const actual=routeAuthorizationControl(entry.path,source);
      if(actual.route!==routing.route||actual.coverage.mode!=="EXEMPTION"
        ||actual.coverage.reason_code!==routing.coverage.reason_code) fail(`EXECUTION_CONTROL_EXEMPTION_SOURCE_MISMATCH:${entry.path}`);
    } else fail(`EXECUTION_CONTROL_COVERAGE_MODE_INVALID:${entry.path}`);
  }
  return {execution_authorization_controls:executionControls.length,consumers,exemptions,route_counts:Object.fromEntries(Object.entries(routeCounts).sort())};
};
