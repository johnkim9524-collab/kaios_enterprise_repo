export const CANONICAL_ENVELOPE_PATH="coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json";
export const CANONICAL_ENVELOPE_ID="kidults-autonomous-approval-policy-envelope-v1";

export const ALLOWED_ROUTES=new Set(["CANONICAL_ENVELOPE","INTERNAL_REVERSIBLE","STAGING_BOUNDED","OWNER_RESERVED","DOMAIN_ADJUDICATION","NON_EXECUTING_REFERENCE"]);
export const ALLOWED_EXEMPTIONS=new Set([
  "NON_EXECUTING_POLICY_TEST_DOCUMENT_OR_RECORD",
  "NON_MUTATING_VALIDATOR_OR_LIBRARY",
  "EXACT_ACTION_OWNER_OR_EXTERNAL_BOUNDARY",
  "LEGACY_STAGING_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER",
  "LEGACY_INTERNAL_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER",
]);

export const routeAuthorizationControl = (file, source) => {
  const referencesEnvelope=source.includes(CANONICAL_ENVELOPE_PATH)||source.includes(CANONICAL_ENVELOPE_ID);
  if (referencesEnvelope) return {
    route:"CANONICAL_ENVELOPE",
    coverage:{mode:"CONSUMER",consumer:file,source_reference:source.includes(CANONICAL_ENVELOPE_PATH)?CANONICAL_ENVELOPE_PATH:CANONICAL_ENVELOPE_ID},
  };
  if (/^(tests\/|docs\/)|\.(md|json)$/.test(file)) return {route:"NON_EXECUTING_REFERENCE",coverage:{mode:"EXEMPTION",reason_code:"NON_EXECUTING_POLICY_TEST_DOCUMENT_OR_RECORD"}};
  if (/validate-|\/lib\//.test(file)) return {route:"DOMAIN_ADJUDICATION",coverage:{mode:"EXEMPTION",reason_code:"NON_MUTATING_VALIDATOR_OR_LIBRARY"}};
  if (/(authorization_id|program owner|owner[_ -]?approval|production|public|g5|external[_ -]?(communication|spend)|credential|permission)/i.test(source)) return {route:"OWNER_RESERVED",coverage:{mode:"EXEMPTION",reason_code:"EXACT_ACTION_OWNER_OR_EXTERNAL_BOUNDARY"}};
  if (/staging/i.test(source)) return {route:"STAGING_BOUNDED",coverage:{mode:"EXEMPTION",reason_code:"LEGACY_STAGING_CONTROL_FAILS_CLOSED_PENDING_CANONICAL_CONSUMER"}};
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
    } else fail(`EXECUTION_CONTROL_COVERAGE_MODE_INVALID:${entry.path}`);
  }
  return {execution_authorization_controls:executionControls.length,consumers,exemptions,route_counts:Object.fromEntries(Object.entries(routeCounts).sort())};
};
