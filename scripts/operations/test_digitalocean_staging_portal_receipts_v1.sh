#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/scripts/operations/digitalocean_staging_portal_deploy_v1.sh"
VALIDATOR="$REPO_ROOT/scripts/operations/validate_digitalocean_staging_portal_receipts_v1.py"
PORTAL="$REPO_ROOT/apps/kidults-enterprise-staging/public/portal-r001"
SOURCE_SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'FAIL: local proof requires an exact source SHA' >&2; exit 1; }

PROOF_ROOT="$(mktemp -d)"
PROOF_HOME="$PROOF_ROOT/home"
MOCK_BIN="$PROOF_ROOT/mock-bin"
REAL_ID="$(command -v id)"
REAL_CURL="$(command -v curl)"
SUCCESS_RUN_ID="localhost-${SOURCE_SHA:0:12}-success"
ROLLBACK_RUN_ID="localhost-${SOURCE_SHA:0:12}-rollback"
SUCCESS_RELEASE_ID="portal-r001-${SOURCE_SHA:0:12}-localhost-success"
FAILED_RELEASE_ID="portal-r001-${SOURCE_SHA:0:12}-localhost-rollback"
NEGATIVE_CASES=0

cleanup() {
  local pid=""
  if [[ -f "$PROOF_HOME/kidults-runtime/portal-r001.pid" ]]; then
    pid="$(cat "$PROOF_HOME/kidults-runtime/portal-r001.pid" 2>/dev/null || true)"
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  rm -rf "$PROOF_ROOT"
}
trap cleanup EXIT

if "$REAL_CURL" -fsS --connect-timeout 1 --max-time 1 http://127.0.0.1:4173/index.html >/dev/null 2>&1; then
  echo 'FAIL: localhost proof port 4173 is already in use' >&2
  exit 1
fi

mkdir -p "$PROOF_HOME/kidults-runtime/app/portal-r001-releases" "$MOCK_BIN"
printf '%s\n' 'managed_by=kidults-digitalocean-staging-bootstrap-v1' \
  > "$PROOF_HOME/kidults-runtime/.kidults-staging-managed"

cat > "$MOCK_BIN/id" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "-un" ]]; then
  printf '%s\n' kidults-staging
else
  exec "${KIDULTS_TEST_REAL_ID:?}" "$@"
fi
SH
cat > "$MOCK_BIN/hostname" <<'SH'
#!/usr/bin/env bash
printf '%s\n' ih-staging-01
SH
cat > "$MOCK_BIN/ip" <<'SH'
#!/usr/bin/env bash
cat <<'IP'
2: eth0: <BROADCAST,UP,LOWER_UP> mtu 1500 state UP
    inet 165.232.175.45/20 scope global eth0
    inet 10.104.0.3/16 scope global eth0
IP
SH
cat > "$MOCK_BIN/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${KIDULTS_TEST_INJECT_FINAL_HEALTH:-0}" == "1" \
  && " $* " == *" --fail-with-body "* \
  && ! -e "${KIDULTS_TEST_CURL_INJECTED:?}" ]]; then
  touch "$KIDULTS_TEST_CURL_INJECTED"
  output=""
  while [[ "$#" -gt 0 ]]; do
    if [[ "$1" == "-o" ]]; then
      output="$2"
      shift 2
    else
      shift
    fi
  done
  [[ -n "$output" ]]
  printf '%s\n' '<html data-release="portal-release-001" data-state="INVALID"><body>Read the market. Know the evidence.</body></html>' > "$output"
  printf '200'
  exit 0
fi
exec "${KIDULTS_TEST_REAL_CURL:?}" "$@"
SH
chmod 755 "$MOCK_BIN/id" "$MOCK_BIN/hostname" "$MOCK_BIN/ip" "$MOCK_BIN/curl"

PREVIOUS_RELEASE="$PROOF_HOME/kidults-runtime/app/portal-r001-releases/portal-r001-localhost-previous"
mkdir -p "$PREVIOUS_RELEASE"
cp -R "$PORTAL/." "$PREVIOUS_RELEASE/"
ln -s "$PREVIOUS_RELEASE" "$PROOF_HOME/kidults-runtime/app/portal-r001-current"
tar -C "$PORTAL" -czf "$PROOF_ROOT/portal-r001.tgz" .

COMMON_ENV=(
  "HOME=$PROOF_HOME"
  "PATH=$MOCK_BIN:$PATH"
  "KIDULTS_RECEIPT_EXECUTION_MODE=LOCALHOST_CONTRACT_PROOF"
  "KIDULTS_TEST_REAL_ID=$REAL_ID"
  "KIDULTS_TEST_REAL_CURL=$REAL_CURL"
)

env "${COMMON_ENV[@]}" bash "$DEPLOY_SCRIPT" \
  ih-staging-01 165.232.175.45 10.104.0.3 \
  "$SUCCESS_RELEASE_ID" "$PROOF_ROOT/portal-r001.tgz" "$SOURCE_SHA" "$SUCCESS_RUN_ID" 1 \
  > "$PROOF_ROOT/success-deploy.log"

SUCCESS_BUNDLE="$PROOF_HOME/kidults-runtime/audit/portal-r001-deployments/$SUCCESS_RELEASE_ID"
"$REAL_CURL" -fsS http://127.0.0.1:4173/index.html > "$SUCCESS_BUNDLE/index.html"
python "$VALIDATOR" \
  --artifact-dir "$SUCCESS_BUNDLE" \
  --expected-outcome DEPLOYED \
  --expected-deployment-id "$SUCCESS_RELEASE_ID" \
  --expected-source-sha "$SOURCE_SHA" \
  --expected-run-id "$SUCCESS_RUN_ID" \
  --expected-run-attempt 1 \
  --expected-evidence-class LOCALHOST_CONTRACT_PROOF \
  --require-rollback-target \
  --output "$SUCCESS_BUNDLE/receipt-validation.json" \
  > "$PROOF_ROOT/success-validation.log"

reject_mutation() {
  local name="$1"
  local directory="$2"
  shift 2
  if python "$VALIDATOR" \
    --artifact-dir "$directory" \
    --expected-outcome DEPLOYED \
    --expected-deployment-id "$SUCCESS_RELEASE_ID" \
    --expected-source-sha "$SOURCE_SHA" \
    --expected-run-id "$SUCCESS_RUN_ID" \
    --expected-run-attempt 1 \
    --expected-evidence-class LOCALHOST_CONTRACT_PROOF \
    --require-rollback-target "$@" \
    > "$PROOF_ROOT/$name.stdout" 2> "$PROOF_ROOT/$name.stderr"; then
    echo "FAIL: validator accepted mutation $name" >&2
    exit 1
  fi
  NEGATIVE_CASES=$((NEGATIVE_CASES + 1))
}

MUTATED_SHA="$PROOF_ROOT/mutated-source-sha"
cp -R "$SUCCESS_BUNDLE" "$MUTATED_SHA"
python - "$MUTATED_SHA/health-receipt.json" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);v=json.loads(p.read_text());v['source_commit_sha']='0'*40;p.write_text(json.dumps(v,indent=2)+'\n')
PY
reject_mutation source-sha "$MUTATED_SHA"

MUTATED_BODY="$PROOF_ROOT/mutated-body"
cp -R "$SUCCESS_BUNDLE" "$MUTATED_BODY"
printf '%s\n' '<!-- tampered -->' >> "$MUTATED_BODY/index.html"
reject_mutation body-digest "$MUTATED_BODY"

MISSING_TARGET="$PROOF_ROOT/missing-rollback-target"
cp -R "$SUCCESS_BUNDLE" "$MISSING_TARGET"
python - "$MISSING_TARGET/deploy-receipt.json" "$MISSING_TARGET/rollback-receipt.json" <<'PY'
import json,sys
from pathlib import Path
deploy=Path(sys.argv[1]);d=json.loads(deploy.read_text());d['rollback_target_available']=False;d['previous_release']='NONE';deploy.write_text(json.dumps(d,indent=2)+'\n')
rollback=Path(sys.argv[2]);r=json.loads(rollback.read_text());r.update({'state':'BLOCKED','rollback_status':'NO_PREVIOUS_RELEASE','rollback_target_available':False,'rollback_target':'NONE','rollback_target_digest':''});rollback.write_text(json.dumps(r,indent=2)+'\n')
PY
reject_mutation missing-rollback-target "$MISSING_TARGET"

if python "$VALIDATOR" \
  --artifact-dir "$SUCCESS_BUNDLE" \
  --expected-outcome DEPLOYED \
  --expected-deployment-id "$SUCCESS_RELEASE_ID" \
  --expected-source-sha "$SOURCE_SHA" \
  --expected-run-id "$SUCCESS_RUN_ID" \
  --expected-run-attempt 1 \
  --expected-evidence-class REMOTE_STAGING \
  --require-rollback-target \
  > "$PROOF_ROOT/evidence-class.stdout" 2> "$PROOF_ROOT/evidence-class.stderr"; then
  echo 'FAIL: local proof was accepted as remote evidence' >&2
  exit 1
fi
NEGATIVE_CASES=$((NEGATIVE_CASES + 1))

if python "$VALIDATOR" \
  --artifact-dir "$SUCCESS_BUNDLE" \
  --expected-outcome DEPLOYED \
  --expected-deployment-id portal-r001-stale-execution \
  --expected-source-sha "$SOURCE_SHA" \
  --expected-run-id "$SUCCESS_RUN_ID" \
  --expected-run-attempt 1 \
  --expected-evidence-class LOCALHOST_CONTRACT_PROOF \
  --require-rollback-target \
  > "$PROOF_ROOT/stale-execution.stdout" 2> "$PROOF_ROOT/stale-execution.stderr"; then
  echo 'FAIL: stale deployment bundle was accepted' >&2
  exit 1
fi
NEGATIVE_CASES=$((NEGATIVE_CASES + 1))

set +e
env "${COMMON_ENV[@]}" \
  KIDULTS_TEST_INJECT_FINAL_HEALTH=1 \
  KIDULTS_TEST_CURL_INJECTED="$PROOF_ROOT/final-health-injected" \
  bash "$DEPLOY_SCRIPT" \
  ih-staging-01 165.232.175.45 10.104.0.3 \
  "$FAILED_RELEASE_ID" "$PROOF_ROOT/portal-r001.tgz" "$SOURCE_SHA" "$ROLLBACK_RUN_ID" 1 \
  > "$PROOF_ROOT/rollback-deploy.stdout" 2> "$PROOF_ROOT/rollback-deploy.stderr"
ROLLBACK_TRIGGER_EXIT_CODE=$?
set -e
[[ "$ROLLBACK_TRIGGER_EXIT_CODE" -eq 38 ]] \
  || { echo "FAIL: expected controlled NO_PROJECTION failure 38, got $ROLLBACK_TRIGGER_EXIT_CODE" >&2; exit 1; }

ROLLBACK_BUNDLE="$PROOF_HOME/kidults-runtime/audit/portal-r001-deployments/$FAILED_RELEASE_ID"
"$REAL_CURL" -fsS http://127.0.0.1:4173/index.html > "$ROLLBACK_BUNDLE/rollback-index.html"
python "$VALIDATOR" \
  --artifact-dir "$ROLLBACK_BUNDLE" \
  --expected-outcome ROLLED_BACK \
  --expected-deployment-id "$FAILED_RELEASE_ID" \
  --expected-source-sha "$SOURCE_SHA" \
  --expected-run-id "$ROLLBACK_RUN_ID" \
  --expected-run-attempt 1 \
  --expected-evidence-class LOCALHOST_CONTRACT_PROOF \
  --output "$ROLLBACK_BUNDLE/receipt-validation.json" \
  > "$PROOF_ROOT/rollback-validation.log"

MUTATED_ROLLBACK_BODY="$PROOF_ROOT/mutated-rollback-body"
cp -R "$ROLLBACK_BUNDLE" "$MUTATED_ROLLBACK_BODY"
printf '%s\n' '<!-- tampered rollback body -->' >> "$MUTATED_ROLLBACK_BODY/rollback-index.html"
if python "$VALIDATOR" \
  --artifact-dir "$MUTATED_ROLLBACK_BODY" \
  --expected-outcome ROLLED_BACK \
  --expected-deployment-id "$FAILED_RELEASE_ID" \
  --expected-source-sha "$SOURCE_SHA" \
  --expected-run-id "$ROLLBACK_RUN_ID" \
  --expected-run-attempt 1 \
  --expected-evidence-class LOCALHOST_CONTRACT_PROOF \
  > "$PROOF_ROOT/rollback-body.stdout" 2> "$PROOF_ROOT/rollback-body.stderr"; then
  echo 'FAIL: tampered rollback body was accepted' >&2
  exit 1
fi
NEGATIVE_CASES=$((NEGATIVE_CASES + 1))

EXPECTED_RESTORED_RELEASE="$PROOF_HOME/kidults-runtime/app/portal-r001-releases/$SUCCESS_RELEASE_ID"
[[ "$(realpath "$PROOF_HOME/kidults-runtime/app/portal-r001-current")" == "$EXPECTED_RESTORED_RELEASE" ]] \
  || { echo 'FAIL: controlled rollback did not restore the previous release' >&2; exit 1; }

python - "$SOURCE_SHA" "$SUCCESS_RELEASE_ID" "$FAILED_RELEASE_ID" "$NEGATIVE_CASES" <<'PY'
import json,sys
source_sha,success_release,failed_release,negative_cases=sys.argv[1:]
print(json.dumps({
  'suite':'DIGITALOCEAN_STAGING_PORTAL_LOCALHOST_RECEIPTS_V1',
  'state':'VERIFIED_PASS',
  'source_commit_sha':source_sha,
  'bind':'127.0.0.1:4173',
  'successful_deployment_receipts':['deploy-receipt.json','health-receipt.json','rollback-receipt.json'],
  'successful_release':success_release,
  'controlled_failure_release':failed_release,
  'controlled_failure_exit_code':38,
  'rollback_state':'VERIFIED_PASS',
  'negative_cases_rejected':int(negative_cases),
  'evidence_class':'LOCALHOST_CONTRACT_PROOF',
  'issue_921_remote_exit_eligible':False,
  'production':'HOLD',
  'g5':'HOLD'
},indent=2))
PY
