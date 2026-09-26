#!/usr/bin/env bash
set -euo pipefail

: "${EXPECTED_MAIN_SHA:?EXPECTED_MAIN_SHA is required}"
: "${RECEIPT_BUCKET:?RECEIPT_BUCKET is required}"
: "${RECEIPT_KEY_ARN:?RECEIPT_KEY_ARN is required}"
: "${CLOUDTRAIL_STACK:?CLOUDTRAIL_STACK is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${ASSURANCE_SESSION_NAME:?ASSURANCE_SESSION_NAME is required}"

ACCOUNT_ID="528314240275"
EXPECTED_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/kidults-cloudtrail-assurance-staging-role"
NEGATIVE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/kidults-autonomous-finalizer-staging-role"
NEGATIVE_BUCKET="kidults-cloudtrail-negative-boundary-staging-${ACCOUNT_ID}"
NEGATIVE_BUCKET_ARN="arn:aws:s3:::${NEGATIVE_BUCKET}"
WRONG_KEY_ARN="arn:aws:kms:${AWS_REGION}:${ACCOUNT_ID}:key/00000000-0000-0000-0000-000000000000"
WRONG_REGION="us-east-1"
OUT_DIR="out/cloudtrail-continuous-assurance-v1"
SESSION_ARN="arn:aws:sts::${ACCOUNT_ID}:assumed-role/kidults-cloudtrail-assurance-staging-role/${ASSURANCE_SESSION_NAME}"
START_EPOCH="$(( $(date -u +%s) - 60 ))"
mkdir -p "$OUT_DIR/events" "$OUT_DIR/negative"
CURRENT_STAGE="INITIALIZE"
trap 'exit_code=$?; jq -n --arg stage "$CURRENT_STAGE" --argjson exit_code "$exit_code" --arg failed_at "$(date -u "+%Y-%m-%dT%H:%M:%SZ")" '\''{id:"kidults-cloudtrail-canary-failure-v1",state:"VERIFIED_FAIL",stage:$stage,exit_code:$exit_code,failed_at:$failed_at,production:"HOLD",public:"HOLD",g5:"HOLD"}'\'' > "$OUT_DIR/canary-failure.json"; exit "$exit_code"' ERR

LOG_GROUP=$(aws cloudformation describe-stacks \
  --stack-name "$CLOUDTRAIL_STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudTrailLogGroupName`].OutputValue | [0]' \
  --output text)
test -n "$LOG_GROUP"
test "$LOG_GROUP" != None

fail_call_expected() {
  local label="$1"
  shift
  set +e
  "$@" >"$OUT_DIR/negative/${label}.stdout" 2>"$OUT_DIR/negative/${label}.stderr"
  local exit_code=$?
  set -e
  test "$exit_code" -ne 0
  grep -Eqi 'AccessDenied|UnauthorizedOperation|NotFoundException|NotFound|InvalidArn|NoSuchBucket' \
    "$OUT_DIR/negative/${label}.stderr"
  printf '%s\n' "$exit_code" >"$OUT_DIR/negative/${label}.exit"
}

query_one_event() {
  local label="$1"
  local filter="$2"
  local result_file="$OUT_DIR/events/${label}.query.json"
  local event_file="$OUT_DIR/events/${label}.event.json"
  local query_id status count end_epoch

  for attempt in $(seq 1 60); do
    end_epoch="$(date -u +%s)"
    query_id=$(aws logs start-query \
      --log-group-name "$LOG_GROUP" \
      --start-time "$START_EPOCH" \
      --end-time "$end_epoch" \
      --query-string "fields @timestamp, @message | filter ${filter} | sort @timestamp desc | limit 3" \
      --query queryId \
      --output text)

    for poll in $(seq 1 30); do
      aws logs get-query-results --query-id "$query_id" --output json >"$result_file"
      status=$(jq -r '.status' "$result_file")
      case "$status" in
        Complete) break ;;
        Failed|Cancelled|Timeout|Unknown) echo "LOG_QUERY_${label}_FAILED:${status}" >&2; exit 1 ;;
      esac
      test "$poll" -lt 30
      sleep 1
    done

    count=$(jq '.results | length' "$result_file")
    if [ "$count" -eq 1 ]; then
      jq -er '.results[0][] | select(.field == "@message") | .value | fromjson' \
        "$result_file" >"$event_file"
      printf '%s\n' "$event_file"
      return 0
    fi
    if [ "$count" -gt 1 ]; then
      echo "LOG_QUERY_${label}_DUPLICATE:${count}" >&2
      exit 1
    fi
    test "$attempt" -lt 60
    sleep 5
  done
  echo "LOG_QUERY_${label}_NOT_OBSERVED" >&2
  exit 1
}

assert_actor_binding() {
  local event_file="$1"
  jq -e \
    --arg account "$ACCOUNT_ID" \
    --arg role "$EXPECTED_ROLE_ARN" \
    --arg session "$ASSURANCE_SESSION_NAME" \
    --arg session_arn "$SESSION_ARN" '
      .recipientAccountId == $account and
      .userIdentity.sessionContext.sessionIssuer.arn == $role and
      .userIdentity.arn == $session_arn and
      (.userIdentity.principalId | endswith(":" + $session))
    ' "$event_file" >/dev/null
}

RETAIN_UNTIL=$(date -u -d '+10 years' '+%Y-%m-%dT%H:%M:%SZ')
PREFIX="receipts/cloudtrail-assurance/${EXPECTED_MAIN_SHA}/${GITHUB_RUN_ID}"
PROBE_KEY="${PREFIX}/probe.json"
TERMINAL_KEY="${PREFIX}/terminal.json"
FORBIDDEN_KEY="receipts/cloudtrail-assurance-forbidden/${GITHUB_RUN_ID}.json"
WRONG_BUCKET_KEY="cloudtrail-assurance/${EXPECTED_MAIN_SHA}/${GITHUB_RUN_ID}.json"

jq -n \
  --arg exact_sha "$EXPECTED_MAIN_SHA" \
  --arg run_id "$GITHUB_RUN_ID" \
  --arg session "$ASSURANCE_SESSION_NAME" \
  --arg created_at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  '{id:"kidults-cloudtrail-assurance-probe-v2",exact_sha:$exact_sha,run_id:$run_id,session_name:$session,created_at:$created_at,production:"HOLD",public:"HOLD",g5:"HOLD"}' \
  >"$OUT_DIR/probe.json"

CURRENT_STAGE="POSITIVE_PROBE_PUT"
PUT=$(aws s3api put-object \
  --bucket "$RECEIPT_BUCKET" \
  --key "$PROBE_KEY" \
  --body "$OUT_DIR/probe.json" \
  --checksum-algorithm SHA256 \
  --server-side-encryption aws:kms \
  --ssekms-key-id "$RECEIPT_KEY_ARN" \
  --object-lock-mode COMPLIANCE \
  --object-lock-retain-until-date "$RETAIN_UNTIL" \
  --metadata "exact-head-sha=$EXPECTED_MAIN_SHA,run-id=$GITHUB_RUN_ID,session-name=$ASSURANCE_SESSION_NAME" \
  --output json)
VERSION_ID=$(jq -er '.VersionId' <<<"$PUT")
CURRENT_STAGE="POSITIVE_PROBE_CHECKSUM_READBACK"
HEAD=$(aws s3api head-object \
  --bucket "$RECEIPT_BUCKET" \
  --key "$PROBE_KEY" \
  --version-id "$VERSION_ID" \
  --output json)
printf '%s\n' "$HEAD" >"$OUT_DIR/probe-head-object.json"
RETENTION=$(aws s3api get-object-retention \
  --bucket "$RECEIPT_BUCKET" \
  --key "$PROBE_KEY" \
  --version-id "$VERSION_ID" \
  --output json)
printf '%s\n' "$RETENTION" >"$OUT_DIR/probe-object-retention.json"
ATTRIBUTES=$(aws s3api get-object-attributes \
  --bucket "$RECEIPT_BUCKET" \
  --key "$PROBE_KEY" \
  --version-id "$VERSION_ID" \
  --object-attributes Checksum ObjectSize \
  --output json)
printf '%s\n' "$ATTRIBUTES" >"$OUT_DIR/probe-object-attributes.json"
[[ "$(jq -r '.Retention.Mode' <<<"$RETENTION")" == COMPLIANCE ]] || { CURRENT_STAGE="PROBE_OBJECT_LOCK_READBACK"; false; }
[[ "$(jq -r '.SSEKMSKeyId' <<<"$HEAD")" == "$RECEIPT_KEY_ARN" ]] || { CURRENT_STAGE="PROBE_KMS_KEY_READBACK"; false; }
[[ "$(jq -r '.Metadata["exact-head-sha"]' <<<"$HEAD")" == "$EXPECTED_MAIN_SHA" ]] || { CURRENT_STAGE="PROBE_EXACT_SHA_METADATA_READBACK"; false; }
[[ "$(jq -r '.Metadata["run-id"]' <<<"$HEAD")" == "$GITHUB_RUN_ID" ]] || { CURRENT_STAGE="PROBE_RUN_ID_METADATA_READBACK"; false; }
[[ "$(jq -r '.Metadata["session-name"]' <<<"$HEAD")" == "$ASSURANCE_SESSION_NAME" ]] || { CURRENT_STAGE="PROBE_SESSION_METADATA_READBACK"; false; }
[[ "$(jq -r '.Checksum.ChecksumSHA256 | length > 0' <<<"$ATTRIBUTES")" == true ]] || { CURRENT_STAGE="PROBE_CHECKSUM_ATTRIBUTE_READBACK"; false; }

CURRENT_STAGE="NEGATIVE_BOUNDARY_CALLS"
fail_call_expected forbidden_prefix \
  aws s3api put-object --bucket "$RECEIPT_BUCKET" --key "$FORBIDDEN_KEY" \
  --body "$OUT_DIR/probe.json" --server-side-encryption aws:kms --ssekms-key-id "$RECEIPT_KEY_ARN"
fail_call_expected wrong_bucket \
  aws s3api put-object --bucket "$NEGATIVE_BUCKET" --key "$WRONG_BUCKET_KEY" \
  --body "$OUT_DIR/probe.json" --region "$AWS_REGION"
fail_call_expected wrong_key \
  aws kms generate-data-key --key-id "$WRONG_KEY_ARN" --key-spec AES_256 --region "$AWS_REGION"
fail_call_expected wrong_region \
  aws kms generate-data-key --key-id "$RECEIPT_KEY_ARN" --key-spec AES_256 --region "$WRONG_REGION"
fail_call_expected wrong_role \
  aws sts assume-role --role-arn "$NEGATIVE_ROLE_ARN" \
  --role-session-name "kidults-cloudtrail-denied-${GITHUB_RUN_ID}" --duration-seconds 900

CURRENT_STAGE="CLOUDTRAIL_EVENT_OBSERVATION"
POSITIVE_S3_EVENT=$(query_one_event positive_s3 \
  "eventSource = 's3.amazonaws.com' and eventName = 'PutObject' and awsRegion = '${AWS_REGION}' and requestParameters.bucketName = '${RECEIPT_BUCKET}' and requestParameters.key = '${PROBE_KEY}' and userIdentity.arn = '${SESSION_ARN}'")
assert_actor_binding "$POSITIVE_S3_EVENT"

POSITIVE_KMS_EVENT=$(query_one_event positive_kms \
  "eventSource = 'kms.amazonaws.com' and eventName = 'GenerateDataKey' and awsRegion = '${AWS_REGION}' and strcontains(@message, '${RECEIPT_KEY_ARN}') and userIdentity.arn = '${SESSION_ARN}' and not ispresent(errorCode)")
assert_actor_binding "$POSITIVE_KMS_EVENT"

NEGATIVE_PREFIX_EVENT=$(query_one_event negative_forbidden_prefix \
  "eventSource = 's3.amazonaws.com' and eventName = 'PutObject' and awsRegion = '${AWS_REGION}' and requestParameters.bucketName = '${RECEIPT_BUCKET}' and requestParameters.key = '${FORBIDDEN_KEY}' and userIdentity.arn = '${SESSION_ARN}' and ispresent(errorCode)")
assert_actor_binding "$NEGATIVE_PREFIX_EVENT"

NEGATIVE_BUCKET_EVENT=$(query_one_event negative_wrong_bucket \
  "eventSource = 's3.amazonaws.com' and eventName = 'PutObject' and awsRegion = '${AWS_REGION}' and requestParameters.bucketName = '${NEGATIVE_BUCKET}' and requestParameters.key = '${WRONG_BUCKET_KEY}' and userIdentity.arn = '${SESSION_ARN}' and ispresent(errorCode)")
assert_actor_binding "$NEGATIVE_BUCKET_EVENT"

NEGATIVE_KEY_EVENT=$(query_one_event negative_wrong_key \
  "eventSource = 'kms.amazonaws.com' and eventName = 'GenerateDataKey' and awsRegion = '${AWS_REGION}' and strcontains(@message, '${WRONG_KEY_ARN}') and userIdentity.arn = '${SESSION_ARN}' and ispresent(errorCode)")
assert_actor_binding "$NEGATIVE_KEY_EVENT"

NEGATIVE_REGION_EVENT=$(query_one_event negative_wrong_region \
  "eventSource = 'kms.amazonaws.com' and eventName = 'GenerateDataKey' and awsRegion = '${WRONG_REGION}' and strcontains(@message, '${RECEIPT_KEY_ARN}') and userIdentity.arn = '${SESSION_ARN}' and ispresent(errorCode)")
assert_actor_binding "$NEGATIVE_REGION_EVENT"

NEGATIVE_ROLE_EVENT=$(query_one_event negative_wrong_role \
  "eventSource = 'sts.amazonaws.com' and eventName = 'AssumeRole' and strcontains(@message, '${NEGATIVE_ROLE_ARN}') and userIdentity.arn = '${SESSION_ARN}' and ispresent(errorCode)")
assert_actor_binding "$NEGATIVE_ROLE_EVENT"

for file in "$OUT_DIR"/events/*.event.json; do
  jq -e --arg sha "$EXPECTED_MAIN_SHA" --arg run "$GITHUB_RUN_ID" --arg session "$ASSURANCE_SESSION_NAME" '
    (.userIdentity.arn | endswith("/" + $session)) and
    ((.requestParameters.key // "") | (contains($sha) or contains($run) or . == ""))
  ' "$file" >/dev/null
done

EVENT_EVIDENCE=$(jq -n \
  --arg positive_s3 "$(sha256sum "$POSITIVE_S3_EVENT" | cut -d' ' -f1)" \
  --arg positive_kms "$(sha256sum "$POSITIVE_KMS_EVENT" | cut -d' ' -f1)" \
  --arg negative_prefix "$(sha256sum "$NEGATIVE_PREFIX_EVENT" | cut -d' ' -f1)" \
  --arg negative_bucket "$(sha256sum "$NEGATIVE_BUCKET_EVENT" | cut -d' ' -f1)" \
  --arg negative_key "$(sha256sum "$NEGATIVE_KEY_EVENT" | cut -d' ' -f1)" \
  --arg negative_region "$(sha256sum "$NEGATIVE_REGION_EVENT" | cut -d' ' -f1)" \
  --arg negative_role "$(sha256sum "$NEGATIVE_ROLE_EVENT" | cut -d' ' -f1)" \
  '{positive_s3:{state:"OBSERVED_EXACTLY_ONCE",sha256:$positive_s3},positive_kms:{state:"OBSERVED_EXACTLY_ONCE",sha256:$positive_kms},negative_prefix:{state:"DENIED_AND_OBSERVED_EXACTLY_ONCE",sha256:$negative_prefix},negative_bucket:{state:"DENIED_AND_OBSERVED_EXACTLY_ONCE",sha256:$negative_bucket},negative_key:{state:"DENIED_AND_OBSERVED_EXACTLY_ONCE",sha256:$negative_key},negative_region:{state:"DENIED_AND_OBSERVED_EXACTLY_ONCE",sha256:$negative_region},negative_role:{state:"DENIED_AND_OBSERVED_EXACTLY_ONCE",sha256:$negative_role}}')

jq -n \
  --arg exact_sha "$EXPECTED_MAIN_SHA" \
  --arg run_id "$GITHUB_RUN_ID" \
  --arg session "$ASSURANCE_SESSION_NAME" \
  --arg log_group "$LOG_GROUP" \
  --arg probe_key "$PROBE_KEY" \
  --arg probe_version_id "$VERSION_ID" \
  --arg checksum_sha256 "$(jq -r '.Checksum.ChecksumSHA256' <<<"$ATTRIBUTES")" \
  --arg retain_until "$(jq -r '.ObjectLockRetainUntilDate' <<<"$HEAD")" \
  --argjson event_evidence "$EVENT_EVIDENCE" \
  '{id:"kidults-cloudtrail-continuous-assurance-terminal-v2",version:"2.0.0",state:"VERIFIED_PASS",exact_sha:$exact_sha,run_id:$run_id,session_name:$session,cloudtrail_log_group:$log_group,event_evidence:$event_evidence,positive_canary:"PASS",negative_canary:"PASS",probe:{key:$probe_key,version_id:$probe_version_id,checksum_sha256:$checksum_sha256,retain_until:$retain_until},production:"HOLD",public:"HOLD",g5:"HOLD"}' \
  >"$OUT_DIR/terminal-receipt.json"

CURRENT_STAGE="TERMINAL_RECEIPT_SEAL"
TERMINAL_PUT=$(aws s3api put-object \
  --bucket "$RECEIPT_BUCKET" --key "$TERMINAL_KEY" \
  --body "$OUT_DIR/terminal-receipt.json" --checksum-algorithm SHA256 \
  --server-side-encryption aws:kms --ssekms-key-id "$RECEIPT_KEY_ARN" \
  --object-lock-mode COMPLIANCE --object-lock-retain-until-date "$RETAIN_UNTIL" \
  --metadata "exact-head-sha=$EXPECTED_MAIN_SHA,run-id=$GITHUB_RUN_ID,terminal-receipt=pass" \
  --output json)
TERMINAL_VERSION_ID=$(jq -er '.VersionId' <<<"$TERMINAL_PUT")
TERMINAL_HEAD=$(aws s3api head-object \
  --bucket "$RECEIPT_BUCKET" --key "$TERMINAL_KEY" --version-id "$TERMINAL_VERSION_ID" \
  --output json)
printf '%s\n' "$TERMINAL_HEAD" >"$OUT_DIR/terminal-head-object.json"
TERMINAL_RETENTION=$(aws s3api get-object-retention \
  --bucket "$RECEIPT_BUCKET" --key "$TERMINAL_KEY" --version-id "$TERMINAL_VERSION_ID" \
  --output json)
printf '%s\n' "$TERMINAL_RETENTION" >"$OUT_DIR/terminal-object-retention.json"
TERMINAL_ATTRIBUTES=$(aws s3api get-object-attributes \
  --bucket "$RECEIPT_BUCKET" --key "$TERMINAL_KEY" --version-id "$TERMINAL_VERSION_ID" \
  --object-attributes Checksum ObjectSize --output json)
printf '%s\n' "$TERMINAL_ATTRIBUTES" >"$OUT_DIR/terminal-object-attributes.json"
[[ "$(jq -r '.Retention.Mode' <<<"$TERMINAL_RETENTION")" == COMPLIANCE ]] || { CURRENT_STAGE="TERMINAL_OBJECT_LOCK_READBACK"; false; }
[[ "$(jq -r '.SSEKMSKeyId' <<<"$TERMINAL_HEAD")" == "$RECEIPT_KEY_ARN" ]] || { CURRENT_STAGE="TERMINAL_KMS_KEY_READBACK"; false; }
[[ "$(jq -r '.Checksum.ChecksumSHA256 | length > 0' <<<"$TERMINAL_ATTRIBUTES")" == true ]] || { CURRENT_STAGE="TERMINAL_CHECKSUM_ATTRIBUTE_READBACK"; false; }

jq \
  --arg bucket "$RECEIPT_BUCKET" --arg key "$TERMINAL_KEY" \
  --arg version_id "$TERMINAL_VERSION_ID" \
  --arg checksum_sha256 "$(jq -r '.Checksum.ChecksumSHA256' <<<"$TERMINAL_ATTRIBUTES")" \
  --arg retain_until "$(jq -r '.Retention.RetainUntilDate' <<<"$TERMINAL_RETENTION")" \
  '. + {immutable_copy:{state:"OBJECT_LOCK_COMPLIANCE_VERIFIED",bucket:$bucket,key:$key,version_id:$version_id,checksum_sha256:$checksum_sha256,retain_until:$retain_until}}' \
  "$OUT_DIR/terminal-receipt.json" >"$OUT_DIR/terminal-envelope.json"

echo 'POSITIVE_CANARY=PASS'
echo 'NEGATIVE_CANARY=PASS'
echo 'CLOUDTRAIL_EXACT_EVENT_BINDING=PASS'
echo 'TERMINAL_RECEIPT=PASS'
