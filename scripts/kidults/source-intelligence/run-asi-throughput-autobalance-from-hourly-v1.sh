#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
: "${HOURLY_RUN_ID:?HOURLY_RUN_ID required}"
: "${HOURLY_RUN_ATTEMPT:?HOURLY_RUN_ATTEMPT required}"
: "${EXPECTED_SHA:?EXPECTED_SHA required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT required}"

mkdir -p /tmp/autobalance/raw /tmp/autobalance/canonical discovery-out/raw discovery-out

test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"
LIVE_MAIN_SHA="$(gh api -H 'Accept: application/vnd.github+json' "/repos/${GITHUB_REPOSITORY}/branches/main" --jq '.commit.sha')"
if [ "$LIVE_MAIN_SHA" != "$EXPECTED_SHA" ]; then
  echo "::error title=Autobalance current-main advanced::CURRENT_MAIN_ADVANCED_BEFORE_AUTOBALANCE:${EXPECTED_SHA}:${LIVE_MAIN_SHA}" >&2
  exit 71
fi

gh api -H 'Accept: application/vnd.github+json' "/repos/${GITHUB_REPOSITORY}/actions/runs/${HOURLY_RUN_ID}" > /tmp/autobalance/hourly-run.json
jq -e \
  --argjson run "$HOURLY_RUN_ID" \
  --argjson attempt "$HOURLY_RUN_ATTEMPT" \
  --arg sha "$EXPECTED_SHA" \
  '.id==$run
    and .run_attempt==$attempt
    and .name=="KIDULTS ASI Global Any-Site Hourly Pooling v2"
    and .path==".github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml"
    and .head_branch=="main"
    and .head_sha==$sha
    and .event=="schedule"
    and .status=="completed"
    and .conclusion=="success"' /tmp/autobalance/hourly-run.json >/dev/null

gh api -H 'Accept: application/vnd.github+json' "/repos/${GITHUB_REPOSITORY}/actions/runs/${HOURLY_RUN_ID}/artifacts?per_page=100" > /tmp/autobalance/hourly-artifacts.json
META_RECORD="$(jq -c '[.artifacts[] | select(.name=="kidults-asi-global-any-site-source-pool-v2" and .expired==false)] | if length==1 then .[0] else empty end' /tmp/autobalance/hourly-artifacts.json)"
DISC_RECORD="$(jq -c '[.artifacts[] | select(.name=="kidults-asi-global-any-site-hourly-cycle-v2" and .expired==false)] | if length==1 then .[0] else empty end' /tmp/autobalance/hourly-artifacts.json)"
test -n "$META_RECORD"
test -n "$DISC_RECORD"
META_ID="$(jq -r '.id' <<<"$META_RECORD")"
DISC_ID="$(jq -r '.id' <<<"$DISC_RECORD")"
META_DIGEST="$(jq -r '.digest // empty' <<<"$META_RECORD")"
DISC_DIGEST="$(jq -r '.digest // empty' <<<"$DISC_RECORD")"
[[ "$META_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$DISC_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]

gh api -H 'Accept: application/vnd.github+json' "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${META_ID}/zip" > /tmp/autobalance/meta.zip
gh api -H 'Accept: application/vnd.github+json' "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${DISC_ID}/zip" > /tmp/autobalance/disc.zip
test "$(sha256sum /tmp/autobalance/meta.zip | awk '{print "sha256:"$1}')" = "$META_DIGEST"
test "$(sha256sum /tmp/autobalance/disc.zip | awk '{print "sha256:"$1}')" = "$DISC_DIGEST"
for z in /tmp/autobalance/meta.zip /tmp/autobalance/disc.zip; do
  unzip -Z1 "$z" > /tmp/autobalance/zip-members.txt
  if grep -Eq '(^/|(^|/)\.\.(/|$)|\\)' /tmp/autobalance/zip-members.txt; then
    echo "::error title=Unsafe producer archive::UNSAFE_PRODUCER_ZIP_MEMBER:${z}" >&2
    exit 72
  fi
done
unzip -q /tmp/autobalance/meta.zip -d /tmp/autobalance/raw
unzip -q /tmp/autobalance/disc.zip -d discovery-out/raw

for f in asi-gate1-safe-candidate-pool-v2.json asi-gate2-independent-reverification-v2.json asi-gate3-admission-runtime-v2.json asi-admitted-metadata-pool-v2.json; do
  mapfile -t MATCHES < <(find /tmp/autobalance/raw -type f -name "$f" -print)
  test "${#MATCHES[@]}" -eq 1
  cp "${MATCHES[0]}" "/tmp/autobalance/canonical/$f"
done
mapfile -t DISC_MATCHES < <(find discovery-out/raw -type f -name 'global-low-risk-discovery.json' -print)
test "${#DISC_MATCHES[@]}" -eq 1
cp "${DISC_MATCHES[0]}" discovery-out/global-low-risk-discovery.json

node scripts/kidults/source-intelligence/build-asi-throughput-coverage-autobalance-v1.mjs \
  discovery-out/global-low-risk-discovery.json \
  /tmp/autobalance/canonical/asi-gate1-safe-candidate-pool-v2.json \
  /tmp/autobalance/canonical/asi-gate2-independent-reverification-v2.json \
  /tmp/autobalance/canonical/asi-gate3-admission-runtime-v2.json \
  /tmp/autobalance/canonical/asi-admitted-metadata-pool-v2.json \
  /tmp/asi-throughput-coverage-autobalance-live-v1.json
node scripts/kidults/source-intelligence/validate-asi-throughput-coverage-autobalance-v1.mjs /tmp/asi-throughput-coverage-autobalance-live-v1.json

node - <<'NODE'
const fs = require('node:fs');
const receipt = {
  id: 'kidults-asi-throughput-autobalance-provenance-v1',
  status: 'VERIFIED_EXACT_HOURLY_PRODUCER_ORDERED_BY_RESERVE',
  ordering_authority: {
    workflow: 'KIDULTS ASI Sharded Source Reserve v1',
    workflow_path: '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
    reserve_run_id: Number(process.env.GITHUB_RUN_ID),
    reserve_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    required_job_dependency: 'rolling-live-reserve'
  },
  producer: {
    workflow: 'KIDULTS ASI Global Any-Site Hourly Pooling v2',
    workflow_path: '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml',
    run_id: Number(process.env.HOURLY_RUN_ID),
    run_attempt: Number(process.env.HOURLY_RUN_ATTEMPT),
    event: 'schedule',
    head_sha: process.env.EXPECTED_SHA
  },
  artifacts: [
    {name:'kidults-asi-global-any-site-source-pool-v2',id:Number(process.env.META_ID),digest:process.env.META_DIGEST},
    {name:'kidults-asi-global-any-site-hourly-cycle-v2',id:Number(process.env.DISC_ID),digest:process.env.DISC_DIGEST}
  ],
  exact_generation_bound: true,
  mixed_generation_allowed: false,
  empirical_authority: false,
  provider_authority: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
};
fs.writeFileSync('/tmp/asi-throughput-autobalance-provenance-v1.json', JSON.stringify(receipt, null, 2) + '\n');
NODE

export META_ID META_DIGEST DISC_ID DISC_DIGEST
# Re-emit after exported values are available to the receipt generator.
node - <<'NODE'
const fs = require('node:fs');
const receipt = {
  id: 'kidults-asi-throughput-autobalance-provenance-v1',
  status: 'VERIFIED_EXACT_HOURLY_PRODUCER_ORDERED_BY_RESERVE',
  ordering_authority: {
    workflow: 'KIDULTS ASI Sharded Source Reserve v1',
    workflow_path: '.github/workflows/kidults-asi-sharded-source-reserve-v1.yml',
    reserve_run_id: Number(process.env.GITHUB_RUN_ID),
    reserve_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    required_job_dependency: 'rolling-live-reserve'
  },
  producer: {
    workflow: 'KIDULTS ASI Global Any-Site Hourly Pooling v2',
    workflow_path: '.github/workflows/kidults-asi-global-any-site-hourly-pooling-v2.yml',
    run_id: Number(process.env.HOURLY_RUN_ID),
    run_attempt: Number(process.env.HOURLY_RUN_ATTEMPT),
    event: 'schedule',
    head_sha: process.env.EXPECTED_SHA
  },
  artifacts: [
    {name:'kidults-asi-global-any-site-source-pool-v2',id:Number(process.env.META_ID),digest:process.env.META_DIGEST},
    {name:'kidults-asi-global-any-site-hourly-cycle-v2',id:Number(process.env.DISC_ID),digest:process.env.DISC_DIGEST}
  ],
  exact_generation_bound: true,
  mixed_generation_allowed: false,
  empirical_authority: false,
  provider_authority: false,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
};
fs.writeFileSync('/tmp/asi-throughput-autobalance-provenance-v1.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
NODE
