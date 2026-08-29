#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo 'usage: verify-postgres-one-shot-authorization-fresh-v1.sh REQUEST RECEIPT MINIMUM_REMAINING_SECONDS' >&2
  exit 64
fi

request_path="$1"
receipt_path="$2"
minimum_remaining_seconds="$3"

[[ "$minimum_remaining_seconds" =~ ^(0|[1-9][0-9]{0,4})$ ]]

node scripts/governance/external-one-shot-approval-ledger-v1.mjs verify \
  --request "$request_path" \
  --receipt "$receipt_path"

python3 - "$request_path" "$receipt_path" "$minimum_remaining_seconds" <<'PY'
import datetime
import json
import sys
from pathlib import Path

request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
receipt = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
minimum_remaining = int(sys.argv[3])
ledger = receipt['ledger_receipt']
assert ledger['state'] == 'CONSUMED'
assert ledger['approval_expires_at'] == request['approval_expires_at']
assert ledger['consume_nonce'] == request['consume_nonce']
expiry_text = ledger['approval_expires_at']
consumed_text = ledger['consumed_at']
assert expiry_text.endswith('Z') and consumed_text.endswith('Z')
expiry = datetime.datetime.fromisoformat(expiry_text[:-1] + '+00:00')
consumed = datetime.datetime.fromisoformat(consumed_text[:-1] + '+00:00')
now = datetime.datetime.now(datetime.timezone.utc)
assert consumed + datetime.timedelta(seconds=minimum_remaining) < expiry
assert now + datetime.timedelta(seconds=minimum_remaining) < expiry
PY
