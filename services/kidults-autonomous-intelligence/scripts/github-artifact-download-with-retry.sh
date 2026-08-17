#!/usr/bin/env bash
set -u
set -o pipefail

api_path="${1:-}"
output_path="${2:-}"
max_attempts="${3:-3}"
base_delay_seconds="${KIDULTS_GH_ARTIFACT_RETRY_BASE_DELAY_SECONDS:-2}"

if [[ -z "$api_path" || -z "$output_path" ]]; then
  echo "usage: $0 <artifact-api-path> <output-file> [max-attempts]" >&2
  exit 64
fi

if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "max-attempts must be a positive integer" >&2
  exit 64
fi

if ! [[ "$base_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "KIDULTS_GH_ARTIFACT_RETRY_BASE_DELAY_SECONDS must be a non-negative integer" >&2
  exit 64
fi

mkdir -p "$(dirname "$output_path")"
tmp_path="${output_path}.partial.$$"
err_path="${output_path}.error.$$"

cleanup() {
  rm -f "$tmp_path" "$err_path"
}
trap cleanup EXIT

is_retryable_status() {
  case "$1" in
    429|500|502|503|504) return 0 ;;
    *) return 1 ;;
  esac
}

attempt=1
last_code=1
while [[ "$attempt" -le "$max_attempts" ]]; do
  rm -f "$tmp_path" "$err_path"

  gh api -H 'Accept: application/vnd.github+json' "$api_path" >"$tmp_path" 2>"$err_path"
  code=$?
  effective_code="$code"
  if [[ "$effective_code" -eq 0 ]]; then
    effective_code=1
  fi
  last_code="$effective_code"

  if [[ "$code" -eq 0 && -s "$tmp_path" ]]; then
    mv "$tmp_path" "$output_path"
    rm -f "$err_path"
    echo "artifact download PASS attempt=${attempt}/${max_attempts}" >&2
    exit 0
  fi

  status="$(grep -oE 'HTTP [0-9]{3}' "$err_path" 2>/dev/null | tail -n 1 | awk '{print $2}')"
  rm -f "$tmp_path"

  if [[ "$code" -eq 0 ]]; then
    echo "artifact download returned an empty body on attempt ${attempt}/${max_attempts}" >>"$err_path"
  fi

  if [[ -n "$status" ]] && ! is_retryable_status "$status"; then
    cat "$err_path" >&2
    echo "artifact download FAIL_CLOSED non-retryable HTTP ${status}" >&2
    exit "$effective_code"
  fi

  if [[ "$attempt" -ge "$max_attempts" ]]; then
    cat "$err_path" >&2
    echo "artifact download FAIL_CLOSED after ${attempt}/${max_attempts} attempts" >&2
    exit "$last_code"
  fi

  delay=$((base_delay_seconds * attempt))
  echo "artifact download transient failure attempt=${attempt}/${max_attempts} http=${status:-unknown}; retrying in ${delay}s" >&2
  if [[ "$delay" -gt 0 ]]; then
    sleep "$delay"
  fi
  attempt=$((attempt + 1))
done

exit "$last_code"
