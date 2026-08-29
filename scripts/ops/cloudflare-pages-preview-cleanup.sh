#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
MODE="${1:---dry-run}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-preview-cleanup}"
MAX_PASSES="${MAX_PASSES:-100}"

if [[ "$PROJECT_NAME" != "kidults-workspace-staging" ]]; then
  echo "Refusing unexpected Pages project: $PROJECT_NAME" >&2
  exit 64
fi

if [[ "$MODE" != "--dry-run" && "$MODE" != "--execute" ]]; then
  echo "Usage: $0 [--dry-run|--execute]" >&2
  exit 64
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Cloudflare credentials are absent" >&2
  exit 65
fi

mkdir -p "$RECEIPT_DIR"
touch "$RECEIPT_DIR/deletions.ndjson"

list_deployments() {
  local output_file error_file status
  output_file="$(mktemp)"
  error_file="$(mktemp)"
  set +e
  npx --yes wrangler@4.127.1 pages deployment list \
    --project-name "$PROJECT_NAME" --json >"$output_file" 2>"$error_file"
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    mkdir -p "$RECEIPT_DIR"
    jq -n \
      --arg project "$PROJECT_NAME" \
      --arg state "BLOCKED" \
      --arg blocker "CLOUDFLARE_AUTHENTICATION_OR_API_LIST_FAILURE" \
      --arg detail "$(tail -n 12 "$error_file" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-700)" \
      '{project:$project,state:$state,blocker:$blocker,detail:$detail,production_mutation:false,preview_deletions:0}' \
      > "$RECEIPT_DIR/final.json"
    rm -f "$output_file" "$error_file"
    return 69
  fi
  cat "$output_file"
  rm -f "$output_file" "$error_file"
}

normalize() {
  jq '[.[] | {
    id: (.Id // .id // ""),
    environment: (.Environment // .environment // ""),
    branch: (.Branch // .branch // ""),
    url: (.Url // .url // "")
  }]'
}

initial="$(list_deployments | normalize)"
initial_production_ids="$(jq -c '[.[] | select((.environment | ascii_downcase) == "production") | .id] | sort' <<<"$initial")"
initial_preview_count="$(jq '[.[] | select((.environment | ascii_downcase) == "preview")] | length' <<<"$initial")"

if [[ "$(jq 'length' <<<"$initial_production_ids")" -lt 1 ]]; then
  echo "Fail closed: no Production deployment was visible before cleanup" >&2
  exit 66
fi

jq -n \
  --arg project "$PROJECT_NAME" \
  --arg mode "$MODE" \
  --argjson production_ids "$initial_production_ids" \
  --argjson preview_count "$initial_preview_count" \
  '{project:$project,mode:$mode,production_ids:$production_ids,visible_preview_count:$preview_count}' \
  > "$RECEIPT_DIR/preflight.json"

if [[ "$MODE" == "--dry-run" ]]; then
  jq '[.[] | select((.environment | ascii_downcase) == "preview")]' <<<"$initial" \
    > "$RECEIPT_DIR/preview-candidates.json"
  echo "Dry run complete: $initial_preview_count visible Preview deployments; Production untouched."
  exit 0
fi

deleted=0
failed=0
pass=0
while (( pass < MAX_PASSES )); do
  pass=$((pass + 1))
  current="$(list_deployments | normalize)"
  candidates="$(jq -c '[.[] | select((.environment | ascii_downcase) == "preview") | .id | select(length > 0)] | unique' <<<"$current")"
  count="$(jq 'length' <<<"$candidates")"
  if [[ "$count" -eq 0 ]]; then
    break
  fi

  progress=0
  while IFS= read -r deployment_id; do
    [[ -n "$deployment_id" ]] || continue
    set +e
    output="$(npx --yes wrangler@4.127.1 pages deployment delete "$deployment_id" \
      --project-name "$PROJECT_NAME" --force 2>&1)"
    status=$?
    set -e
    if [[ "$status" -eq 0 ]]; then
      deleted=$((deleted + 1))
      progress=$((progress + 1))
      jq -cn --arg id "$deployment_id" --arg result "DELETED" \
        '{deployment_id:$id,result:$result}' >> "$RECEIPT_DIR/deletions.ndjson"
    else
      failed=$((failed + 1))
      reason="$(printf '%s' "$output" | tail -n 8 | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-500)"
      jq -cn --arg id "$deployment_id" --arg result "FAILED" --arg reason "$reason" \
        '{deployment_id:$id,result:$result,reason:$reason}' >> "$RECEIPT_DIR/deletions.ndjson"
    fi
  done < <(jq -r '.[]' <<<"$candidates")

  if [[ "$progress" -eq 0 ]]; then
    break
  fi
done

final="$(list_deployments | normalize)"
final_production_ids="$(jq -c '[.[] | select((.environment | ascii_downcase) == "production") | .id] | sort' <<<"$final")"
remaining_preview_count="$(jq '[.[] | select((.environment | ascii_downcase) == "preview")] | length' <<<"$final")"

if [[ "$final_production_ids" != "$initial_production_ids" ]]; then
  echo "Fail closed: Production deployment set changed" >&2
  exit 67
fi

jq -n \
  --arg project "$PROJECT_NAME" \
  --arg state "$([[ "$remaining_preview_count" -eq 0 ]] && echo COMPLETE_VERIFIED || echo BLOCKED)" \
  --argjson deleted "$deleted" \
  --argjson failed "$failed" \
  --argjson passes "$pass" \
  --argjson remaining_preview_count "$remaining_preview_count" \
  --argjson production_ids "$final_production_ids" \
  '{project:$project,state:$state,deleted:$deleted,failed_attempts:$failed,passes:$passes,remaining_visible_preview_count:$remaining_preview_count,production_ids_preserved:$production_ids}' \
  > "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
if [[ "$remaining_preview_count" -ne 0 ]]; then
  echo "Preview cleanup is incomplete; see receipt for undeletable latest branch deployments" >&2
  exit 68
fi
