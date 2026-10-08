#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/../operations/managed_postgres_readonly_probe_v1.py"
