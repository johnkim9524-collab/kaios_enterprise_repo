#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
CANONICAL_ACCOUNT_ID="${CANONICAL_CLOUDFLARE_ACCOUNT_ID:-235eaa51d04e7f4436a9faa507a04f9d}"
CANONICAL_ACCOUNT_ID_DIGEST="sha256:b44611d7b4a31965ba18e4099a76b50faba95101a4a14d405ce07bee9d580683"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-staging-credential-diagnostic}"
EFFECTIVE_ACCOUNT_ID_FILE="${EFFECTIVE_ACCOUNT_ID_FILE:-/tmp/kidults-cloudflare-effective-account-id}"
API_BASE="https://api.cloudflare.com/client/v4"

mkdir -p "$RECEIPT_DIR"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

sha256_text() {
  printf '%s' "$1" | sha256sum | awk '{print "sha256:" $1}'
}

write_preflight_failure() {
  local state="$1" reason_code="$2" exit_code="$3"
  local token_present=false account_present=false
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] && token_present=true
  [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] && account_present=true
  jq -n \
    --arg state "$state" \
    --arg reason_code "$reason_code" \
    --arg project "$PROJECT_NAME" \
    --arg expected_repository "$EXPECTED_REPOSITORY" \
    --arg canonical_account_id_digest "$CANONICAL_ACCOUNT_ID_DIGEST" \
    --argjson exit_code "$exit_code" \
    --argjson api_token_present "$token_present" \
    --argjson account_id_present "$account_present" \
    '{
      id:"kidults-cloudflare-staging-credential-diagnostic-v1",
      state:$state,
      reason_code:$reason_code,
      exit_code:$exit_code,
      project:$project,
      expected_repository:$expected_repository,
      credential_presence:{api_token_present:$api_token_present,account_id_present:$account_id_present},
      canonical_account_id_digest:$canonical_account_id_digest,
      cloudflare_api_called:false,
      effective_account_source:"NONE",
      read_only:true,
      settings_mutated:false,
      deployment_created:false,
      deployment_deleted:false,
      public_release:"HOLD",
      production:"HOLD",
      g5:"HOLD"
    }' > "$RECEIPT_DIR/final.json"
  cat "$RECEIPT_DIR/final.json"
  exit "$exit_code"
}

[[ "$PROJECT_NAME" == "kidults-workspace-staging" ]] || write_preflight_failure "REFUSED_INVALID_INPUT" "UNEXPECTED_PAGES_PROJECT" 64
[[ "$EXPECTED_REPOSITORY" == "johnkim9524-collab/kaios_enterprise_repo" ]] || write_preflight_failure "REFUSED_INVALID_INPUT" "UNEXPECTED_REPOSITORY" 64
[[ "$CANONICAL_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]] || write_preflight_failure "REFUSED_INVALID_INPUT" "INVALID_CANONICAL_ACCOUNT_ID" 64
[[ "$(sha256_text "$CANONICAL_ACCOUNT_ID")" == "$CANONICAL_ACCOUNT_ID_DIGEST" ]] || write_preflight_failure "REFUSED_INVALID_INPUT" "CANONICAL_ACCOUNT_ID_DIGEST_MISMATCH" 64
[[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || write_preflight_failure "BLOCKED_CREDENTIALS_ABSENT" "CLOUDFLARE_STAGING_CREDENTIALS_ABSENT" 65

configured_format_valid=false
[[ "$CLOUDFLARE_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]] && configured_format_valid=true
configured_digest="$(sha256_text "$CLOUDFLARE_ACCOUNT_ID")"
configured_matches_canonical=false
[[ "$configured_digest" == "$CANONICAL_ACCOUNT_ID_DIGEST" ]] && configured_matches_canonical=true

http_get() {
  local url="$1" output="$2" status_file="$3"
  local http_code rc
  set +e
  http_code="$(curl --silent --show-error \
    --connect-timeout 10 --max-time 45 \
    --request GET \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    --header "Accept: application/json" \
    --output "$output" \
    --write-out '%{http_code}' \
    "$url")"
  rc=$?
  set -e
  [[ "$http_code" =~ ^[0-9]{3}$ ]] || http_code="000"
  jq -n --argjson curl_exit "$rc" --arg http_status "$http_code" '{curl_exit:$curl_exit,http_status:$http_status}' > "$status_file"
}

http_get "$API_BASE/user/tokens/verify" "$tmp_dir/token.json" "$tmp_dir/token-status.json"
http_get "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME" "$tmp_dir/configured-project.json" "$tmp_dir/configured-status.json"
if [[ "$configured_matches_canonical" == "true" ]]; then
  cp "$tmp_dir/configured-project.json" "$tmp_dir/canonical-project.json"
  cp "$tmp_dir/configured-status.json" "$tmp_dir/canonical-status.json"
else
  http_get "$API_BASE/accounts/$CANONICAL_ACCOUNT_ID/pages/projects/$PROJECT_NAME" "$tmp_dir/canonical-project.json" "$tmp_dir/canonical-status.json"
fi

json_success() {
  local file="$1"
  jq -r 'if type == "object" then (.success == true) else false end' "$file" 2>/dev/null || printf 'false\n'
}

project_visible() {
  local body="$1" status="$2"
  local http_status
  http_status="$(jq -r '.http_status' "$status")"
  [[ "$http_status" == "200" ]] || return 1
  jq -e --arg project "$PROJECT_NAME" --arg expected_repository "$EXPECTED_REPOSITORY" '
    .success == true
    and .result.name == $project
    and .result.source.type == "github"
    and (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $expected_repository)
  ' "$body" >/dev/null 2>&1
}

token_http_status="$(jq -r '.http_status' "$tmp_dir/token-status.json")"
token_curl_exit="$(jq -r '.curl_exit' "$tmp_dir/token-status.json")"
token_success="$(json_success "$tmp_dir/token.json")"
token_status="$(jq -r 'if type == "object" then (.result.status // "UNKNOWN") else "UNREADABLE" end' "$tmp_dir/token.json" 2>/dev/null || printf 'UNREADABLE\n')"
token_error_codes="$(jq -c 'if type == "object" then [(.errors // [])[]?.code] else [] end' "$tmp_dir/token.json" 2>/dev/null || printf '[]\n')"

configured_http_status="$(jq -r '.http_status' "$tmp_dir/configured-status.json")"
configured_curl_exit="$(jq -r '.curl_exit' "$tmp_dir/configured-status.json")"
canonical_http_status="$(jq -r '.http_status' "$tmp_dir/canonical-status.json")"
canonical_curl_exit="$(jq -r '.curl_exit' "$tmp_dir/canonical-status.json")"
configured_error_codes="$(jq -c 'if type == "object" then [(.errors // [])[]?.code] else [] end' "$tmp_dir/configured-project.json" 2>/dev/null || printf '[]\n')"
canonical_error_codes="$(jq -c 'if type == "object" then [(.errors // [])[]?.code] else [] end' "$tmp_dir/canonical-project.json" 2>/dev/null || printf '[]\n')"

configured_visible=false
canonical_visible=false
project_visible "$tmp_dir/configured-project.json" "$tmp_dir/configured-status.json" && configured_visible=true
project_visible "$tmp_dir/canonical-project.json" "$tmp_dir/canonical-status.json" && canonical_visible=true

effective_account_source="NONE"
effective_account_id=""
state="BLOCKED_PROJECT_NOT_VISIBLE"
reason_code="PROJECT_NOT_VISIBLE_WITH_CONFIGURED_OR_CANONICAL_ACCOUNT"
exit_code=67

if [[ "$configured_visible" == "true" ]]; then
  effective_account_source="CONFIGURED"
  effective_account_id="$CLOUDFLARE_ACCOUNT_ID"
  state="COMPLETE_VERIFIED"
  reason_code="CONFIGURED_ACCOUNT_PROJECT_VISIBLE"
  exit_code=0
elif [[ "$canonical_visible" == "true" ]]; then
  effective_account_source="CANONICAL_FALLBACK"
  effective_account_id="$CANONICAL_ACCOUNT_ID"
  state="COMPLETE_VERIFIED"
  reason_code="CANONICAL_ACCOUNT_PROJECT_VISIBLE"
  exit_code=0
elif [[ "$token_curl_exit" -ne 0 || "$token_http_status" == "000" ]]; then
  state="BLOCKED_TOKEN_VERIFY_TRANSPORT"
  reason_code="TOKEN_VERIFY_TRANSPORT_FAILURE"
  exit_code=68
elif [[ "$token_success" != "true" || "$token_status" != "active" ]]; then
  state="BLOCKED_TOKEN_INVALID_OR_INACTIVE"
  reason_code="TOKEN_INVALID_OR_INACTIVE"
  exit_code=65
elif [[ "$configured_http_status" == "404" && "$canonical_http_status" == "404" ]]; then
  state="BLOCKED_TOKEN_SCOPE_OR_ACCOUNT_RESOURCE_MISMATCH"
  reason_code="ACTIVE_TOKEN_CANNOT_SEE_CANONICAL_PAGES_PROJECT"
  exit_code=67
elif [[ "$configured_curl_exit" -ne 0 || "$canonical_curl_exit" -ne 0 ]]; then
  state="BLOCKED_PROJECT_READ_TRANSPORT"
  reason_code="PROJECT_READ_TRANSPORT_FAILURE"
  exit_code=68
fi

jq -n \
  --arg state "$state" \
  --arg reason_code "$reason_code" \
  --arg project "$PROJECT_NAME" \
  --arg expected_repository "$EXPECTED_REPOSITORY" \
  --arg configured_account_id_digest "$configured_digest" \
  --arg canonical_account_id_digest "$CANONICAL_ACCOUNT_ID_DIGEST" \
  --arg effective_account_source "$effective_account_source" \
  --arg token_http_status "$token_http_status" \
  --arg token_status "$token_status" \
  --arg configured_project_http_status "$configured_http_status" \
  --arg canonical_project_http_status "$canonical_http_status" \
  --argjson exit_code "$exit_code" \
  --argjson configured_account_id_format_valid "$configured_format_valid" \
  --argjson configured_matches_canonical "$configured_matches_canonical" \
  --argjson token_success "$token_success" \
  --argjson token_error_codes "$token_error_codes" \
  --argjson configured_project_visible "$configured_visible" \
  --argjson canonical_project_visible "$canonical_visible" \
  --argjson configured_error_codes "$configured_error_codes" \
  --argjson canonical_error_codes "$canonical_error_codes" \
  '{
    id:"kidults-cloudflare-staging-credential-diagnostic-v1",
    state:$state,
    reason_code:$reason_code,
    exit_code:$exit_code,
    project:$project,
    expected_repository:$expected_repository,
    configured_account_id:{
      digest:$configured_account_id_digest,
      format_valid:$configured_account_id_format_valid,
      matches_canonical:$configured_matches_canonical
    },
    canonical_account_id_digest:$canonical_account_id_digest,
    token_verify:{
      http_status:$token_http_status,
      success:$token_success,
      status:$token_status,
      error_codes:$token_error_codes
    },
    project_visibility:{
      configured:{http_status:$configured_project_http_status,visible:$configured_project_visible,error_codes:$configured_error_codes},
      canonical:{http_status:$canonical_project_http_status,visible:$canonical_project_visible,error_codes:$canonical_error_codes}
    },
    effective_account_source:$effective_account_source,
    cloudflare_api_called:true,
    read_only:true,
    settings_mutated:false,
    deployment_created:false,
    deployment_deleted:false,
    public_release:"HOLD",
    production:"HOLD",
    g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
if [[ "$exit_code" -eq 0 ]]; then
  umask 077
  printf '%s' "$effective_account_id" > "$EFFECTIVE_ACCOUNT_ID_FILE"
fi
exit "$exit_code"
