#!/usr/bin/env bash
set -euo pipefail
# One synchronous protected request. No AWS/provider retry or exposed token.
binding=$1 operation=$2 output=$3
mkdir -p "$(dirname "$output")"
write_failure() {
  jq -n --arg code "$1" --argjson binding "$binding" '{state:"HOLD_RECONCILE",failure_code:$code,binding:$binding,retry_without_reconciliation:false,production:"HOLD",public:"HOLD",g5:"HOLD"}' > "$output"
  echo "::error::$1" >&2
  exit 1
}
trap 'unset CREDS OIDC_JSON OIDC_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_REGION' EXIT
export AWS_MAX_ATTEMPTS=1 AWS_RETRY_MODE=standard
OIDC_JSON=$(curl --fail --silent --show-error -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com") || write_failure LIFECYCLE_OIDC_REQUEST_FAILED
OIDC_TOKEN=$(jq -er '.value | select(type=="string" and length>0)' <<< "$OIDC_JSON") || write_failure LIFECYCLE_OIDC_RESPONSE_INVALID
echo "::add-mask::$OIDC_TOKEN" >&2
CREDS=$(aws sts assume-role-with-web-identity --role-arn "$AWS_ROLE_ARN" --role-session-name "kidults-lifecycle-${GITHUB_RUN_ID}" --web-identity-token "$OIDC_TOKEN" --duration-seconds 900 --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text) || write_failure LIFECYCLE_STS_FAILED
read -r AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN extra <<< "$CREDS"
for credential in "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$AWS_SESSION_TOKEN"; do
  [[ -n "$credential" && "$credential" != None ]] || write_failure LIFECYCLE_STS_RESPONSE_INVALID
  echo "::add-mask::$credential" >&2
done
[[ -z "$extra" ]] || write_failure LIFECYCLE_STS_RESPONSE_INVALID
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_REGION=ap-northeast-2
unset CREDS OIDC_JSON
request=$(jq -cn --arg repo "$GITHUB_REPOSITORY" --arg rid "$GITHUB_REPOSITORY_ID" --arg operation "$operation" --arg run "$GITHUB_RUN_ID" --arg caller "$OIDC_TOKEN" --argjson attempt "$GITHUB_RUN_ATTEMPT" --argjson binding "$binding" '{action:"RESUME_LIFECYCLE_OPERATION",repository:$repo,repository_id:$rid,operation:$operation,binding:$binding,run_id:$run,run_attempt:$attempt,caller_oidc_token:$caller}') || write_failure LIFECYCLE_REQUEST_INVALID
unset OIDC_TOKEN
metadata=$(aws lambda invoke --function-name "$BROKER_FUNCTION" --cli-connect-timeout 10 --cli-read-timeout 200 --cli-binary-format raw-in-base64-out --payload "$request" "$output") || write_failure LIFECYCLE_INVOKE_OUTCOME_UNKNOWN
jq -e '.StatusCode==200 and (.FunctionError // null)==null' <<< "$metadata" >/dev/null || write_failure LIFECYCLE_BROKER_OUTCOME_UNKNOWN
target=$(jq -er '[.pull_request,.old_base_sha,.expected_head_sha,.current_main_sha]|map(tostring)|join(":")' <<< "$binding") || write_failure LIFECYCLE_BINDING_INVALID
jq -e --arg repo "$GITHUB_REPOSITORY" --arg operation "$operation" --arg target "$target" '.ok==true and (.state=="EXECUTED_VERIFIED" or .state=="REUSED_SUCCESS") and .receipt.id=="kidults-broker-lifecycle-receipt-v1" and .receipt.state=="VERIFIED_PASS" and .receipt.binding.repository==$repo and .receipt.binding.operation_kind==$operation and .receipt.binding.exact_target==$target and (.receipt.signature|type)=="string" and (.receipt.signature|length)>0 and .receipt.production=="HOLD" and .receipt.public=="HOLD" and .receipt.g5=="HOLD" and (.token // null)==null' "$output" >/dev/null || write_failure LIFECYCLE_BROKER_NOT_VERIFIED
