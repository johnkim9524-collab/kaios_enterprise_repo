#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
MODE="${1:---inventory}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-preview-cleanup}"
MAX_PAGES="${MAX_PAGES:-100}"
PAGE_SIZE="${PAGE_SIZE:-25}"
API_ROOT="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-MISSING}/pages/projects/${PROJECT_NAME}"

if [[ "$PROJECT_NAME" != "kidults-workspace-staging" ]]; then
  echo "Refusing unexpected Pages project: $PROJECT_NAME" >&2
  exit 64
fi
if [[ "$MODE" != "--inventory" && "$MODE" != "--delete-preview" ]]; then
  echo "Usage: $0 [--inventory|--delete-preview]" >&2
  exit 64
fi
if [[ ! "$MAX_PAGES" =~ ^[1-9][0-9]*$ ]] || (( MAX_PAGES > 100 )); then
  echo "MAX_PAGES must be an integer from 1 to 100" >&2
  exit 64
fi
if [[ ! "$PAGE_SIZE" =~ ^[1-9][0-9]*$ ]] || (( PAGE_SIZE > 25 )); then
  echo "PAGE_SIZE must be an integer from 1 to 25" >&2
  exit 64
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Cloudflare credentials are absent" >&2
  exit 65
fi

mkdir -p "$RECEIPT_DIR"
: > "$RECEIPT_DIR/deletions.ndjson"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

write_capacity_failure_receipt() {
  local inventory_stage="$1" deleted_count="${deleted:-0}"
  jq -n --arg project "$PROJECT_NAME" --arg mode "$MODE" --arg inventory_stage "$inventory_stage" \
    --argjson deleted_preview_count "$deleted_count" '{
      id:"kidults-cloudflare-preview-cleanup-receipt-v1",project:$project,mode:$mode,
      state:"BLOCKED_INVENTORY_CAPACITY",reason_code:"DEPLOYMENT_INVENTORY_PAGE_LIMIT",exit_code:68,
      inventory_stage:$inventory_stage,deleted_preview_count:$deleted_preview_count,
      deletion_performed:($deleted_preview_count > 0),post_mutation_verification_complete:false,
      production_preservation_verified:false,production_delete_forbidden:true,
      capacity_state:"EXHAUSTED",promotion_eligible:false,
      platform_environment:"STAGING",public_release:"HOLD",production:"HOLD",g5:"HOLD"
    }' > "$RECEIPT_DIR/final.json"
  cat "$RECEIPT_DIR/final.json"
  exit 68
}

api_request() {
  local method="$1" url="$2" output="$3"
  shift 3
  curl --fail-with-body --silent --show-error \
    --retry 3 --retry-delay 1 --retry-all-errors \
    --connect-timeout 10 --max-time 45 \
    --request "$method" \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    --header "Content-Type: application/json" \
    "$@" "$url" > "$output"
}

list_all_deployments() {
  local output="$1" prefix="$2" page=1 total_pages=1 page_file ndjson
  ndjson="$tmp_dir/${prefix}-deployments.ndjson"
  : > "$ndjson"
  while (( page <= total_pages )); do
    if (( page > MAX_PAGES )); then
      echo "Deployment pagination exceeded MAX_PAGES=$MAX_PAGES" >&2
      return 68
    fi
    page_file="$tmp_dir/${prefix}-page-${page}.json"
    api_request GET "$API_ROOT/deployments?per_page=${PAGE_SIZE}&page=$page" "$page_file"
    jq -e '.success == true and (.result | type == "array")' "$page_file" >/dev/null
    jq -c '.result[]' "$page_file" >> "$ndjson"
    total_pages="$(jq -r '(.result_info.total_pages // 1) | if type == "number" and . >= 1 and floor == . then . else error("invalid total_pages") end' "$page_file")"
    if (( total_pages > MAX_PAGES )); then
      echo "Cloudflare deployment inventory exceeds bounded pagination: $total_pages pages" >&2
      return 68
    fi
    page=$((page + 1))
  done
  if [[ -s "$ndjson" ]]; then
    jq -s '.' "$ndjson" > "$output"
  else
    printf '[]\n' > "$output"
  fi
}

normalize() {
  jq '[.[] | {
    id,
    environment,
    branch: (.deployment_trigger.metadata.branch // null),
    commit_hash: (.deployment_trigger.metadata.commit_hash // null),
    trigger_type: (.deployment_trigger.type // null),
    url,
    created_on,
    is_skipped: (.is_skipped // false),
    skip_reason: (.skip_reason // null),
    materialized: (((.is_skipped // false) != true) and ((.url // "") | (type == "string" and length > 0)))
  }]'
}

if ! list_all_deployments "$tmp_dir/initial-raw.json" initial; then
  write_capacity_failure_receipt "PRE_MUTATION"
fi
initial="$(normalize < "$tmp_dir/initial-raw.json")"
initial_production_ids="$(jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' <<<"$initial")"
initial_preview_ids="$(jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' <<<"$initial")"
if [[ "$(jq 'length' <<<"$initial_production_ids")" -lt 1 ]]; then
  echo "Fail closed: no production-environment deployment visible before preview cleanup" >&2
  exit 66
fi

jq -n \
  --arg project "$PROJECT_NAME" \
  --arg mode "$MODE" \
  --argjson production_ids "$initial_production_ids" \
  --argjson preview_ids "$initial_preview_ids" \
  '{
    project:$project,mode:$mode,
    production_ids:$production_ids,
    preview_ids:$preview_ids,
    production_delete_forbidden:true
  }' > "$RECEIPT_DIR/preflight.json"

if [[ "$MODE" == "--inventory" ]]; then
  jq -n \
    --arg project "$PROJECT_NAME" \
    --arg state "INVENTORY_VERIFIED" \
    --argjson preview_ids "$initial_preview_ids" \
    --argjson production_ids "$initial_production_ids" \
    '{
      id:"kidults-cloudflare-preview-inventory-receipt-v1",
      project:$project,state:$state,
      preview_ids:$preview_ids,
      production_ids_preserved:$production_ids,
      deletion_performed:false,
      production_mutation:false,
      platform_environment:"STAGING",
      public_release:"HOLD",production:"HOLD",g5:"HOLD"
    }' > "$RECEIPT_DIR/final.json"
  cat "$RECEIPT_DIR/final.json"
  exit 0
fi

deleted=0
failed=0
while IFS= read -r deployment_id; do
  [[ -n "$deployment_id" ]] || continue
  set +e
  api_request DELETE "$API_ROOT/deployments/$deployment_id" "$tmp_dir/delete-$deployment_id.json"
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]] && jq -e '.success == true' "$tmp_dir/delete-$deployment_id.json" >/dev/null 2>&1; then
    deleted=$((deleted + 1))
    jq -cn --arg id "$deployment_id" '{deployment_id:$id,result:"DELETED_PREVIEW"}' >> "$RECEIPT_DIR/deletions.ndjson"
  else
    failed=$((failed + 1))
    jq -cn --arg id "$deployment_id" '{deployment_id:$id,result:"FAILED"}' >> "$RECEIPT_DIR/deletions.ndjson"
  fi
done < <(jq -r '.[]' <<<"$initial_preview_ids")

if ! list_all_deployments "$tmp_dir/final-raw.json" final; then
  write_capacity_failure_receipt "POST_MUTATION"
fi
final="$(normalize < "$tmp_dir/final-raw.json")"
final_production_ids="$(jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' <<<"$final")"
remaining_preview_ids="$(jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' <<<"$final")"
test "$initial_production_ids" = "$final_production_ids"

state="COMPLETE_VERIFIED"
if [[ "$(jq 'length' <<<"$remaining_preview_ids")" -ne 0 || "$failed" -ne 0 ]]; then
  state="BLOCKED"
fi

jq -n \
  --arg project "$PROJECT_NAME" \
  --arg state "$state" \
  --arg control_reason "${CONTROL_REASON:-NOT_PROVIDED}" \
  --argjson deleted "$deleted" \
  --argjson failed "$failed" \
  --argjson remaining_preview_ids "$remaining_preview_ids" \
  --argjson production_ids "$final_production_ids" \
  '{
    id:"kidults-cloudflare-preview-cleanup-receipt-v1",
    project:$project,state:$state,control_reason:$control_reason,
    deleted_preview_count:$deleted,
    failed_attempts:$failed,
    remaining_preview_ids:$remaining_preview_ids,
    production_ids_preserved:$production_ids,
    production_mutation:false,
    platform_environment:"STAGING",
    public_release:"HOLD",production:"HOLD",g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
[[ "$state" == "COMPLETE_VERIFIED" ]]
