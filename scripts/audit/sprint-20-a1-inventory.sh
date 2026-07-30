#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/audit"

mkdir -p "${ARTIFACT_DIR}"
cd "${ROOT_DIR}"

AUDIT_DIRS=()

for dir in \
  apps \
  packages \
  services \
  scripts \
  infrastructure \
  contracts
do
  if [[ -d "${dir}" ]]; then
    AUDIT_DIRS+=("${dir}")
  fi
done

echo "Generating Sprint 20-A1 repository inventory..."
echo "Detected audit directories: ${AUDIT_DIRS[*]:-none}"

{
  echo "# Repository Summary"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Branch: $(git branch --show-current)"
  echo "Commit: $(git rev-parse HEAD)"
  echo
  echo "## Top-Level Entries"
  find . \
    -mindepth 1 \
    -maxdepth 1 \
    ! -name '.git' \
    -printf '%f\n' \
    | sort
} > "${ARTIFACT_DIR}/repository-summary.md"

find . \
  -path './.git' -prune -o \
  -path './node_modules' -prune -o \
  -path './.pnpm-store' -prune -o \
  -path './.wrangler' -prune -o \
  -type f -print \
  | sort \
  > "${ARTIFACT_DIR}/repository-files.txt"

if (( ${#AUDIT_DIRS[@]} > 0 )); then
  find "${AUDIT_DIRS[@]}" \
    -maxdepth 4 \
    -type f \
    -print \
    | sort \
    > "${ARTIFACT_DIR}/runtime-candidate-files.txt"
else
  : > "${ARTIFACT_DIR}/runtime-candidate-files.txt"
fi

find . \
  -path './.git' -prune -o \
  -path './node_modules' -prune -o \
  -type f \
  \( \
    -name 'package.json' -o \
    -name 'pnpm-workspace.yaml' -o \
    -name 'tsconfig*.json' -o \
    -name 'wrangler*.toml' -o \
    -name 'wrangler*.json' -o \
    -name 'wrangler*.jsonc' -o \
    -name 'Dockerfile*' -o \
    -name 'docker-compose*.yml' -o \
    -name 'docker-compose*.yaml' \
  \) \
  -print \
  | sort \
  > "${ARTIFACT_DIR}/build-runtime-manifests.txt"

find . \
  -path './.git' -prune -o \
  -path './node_modules' -prune -o \
  -type f \
  \( \
    -name '*.service' -o \
    -name '*.timer' -o \
    -name 'Caddyfile*' -o \
    -name 'nginx*.conf' -o \
    -name '*.deployment.yml' -o \
    -name '*.deployment.yaml' \
  \) \
  -print \
  | sort \
  > "${ARTIFACT_DIR}/deployment-operations-files.txt"

find . \
  -path './.git' -prune -o \
  -path './node_modules' -prune -o \
  -type f \
  \( \
    -name '*.test.ts' -o \
    -name '*.test.tsx' -o \
    -name '*.spec.ts' -o \
    -name '*.spec.tsx' -o \
    -name '*.test.js' -o \
    -name '*.spec.js' \
  \) \
  -print \
  | sort \
  > "${ARTIFACT_DIR}/test-files.txt"

find . \
  -path './.git' -prune -o \
  -path './node_modules' -prune -o \
  -type f \
  \( \
    -name '*.sql' -o \
    -path '*/migrations/*' \
  \) \
  -print \
  | sort \
  > "${ARTIFACT_DIR}/database-migrations.txt"

grep -RInE \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=.pnpm-store \
  --exclude-dir=.wrangler \
  --include='*.ts' \
  --include='*.tsx' \
  --include='*.js' \
  --include='*.mjs' \
  --include='*.cjs' \
  --include='*.py' \
  --include='*.sh' \
  '(app\.(get|post|put|patch|delete)|router\.(get|post|put|patch|delete)|fetch\(|/api/|/health|/engine/)' \
  . \
  > "${ARTIFACT_DIR}/runtime-route-signals.txt" || true

if (( ${#AUDIT_DIRS[@]} > 0 )); then
  grep -RInE \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude-dir=.pnpm-store \
    --exclude-dir=.wrangler \
    '(TODO|FIXME|HACK|XXX|deprecated|temporary|legacy)' \
    "${AUDIT_DIRS[@]}" \
    > "${ARTIFACT_DIR}/technical-debt-signals.txt" || true

  find "${AUDIT_DIRS[@]}" \
    -type f \
    -printf '%f\n' \
    | sort \
    | uniq -d \
    > "${ARTIFACT_DIR}/duplicate-filenames.txt"
else
  : > "${ARTIFACT_DIR}/technical-debt-signals.txt"
  : > "${ARTIFACT_DIR}/duplicate-filenames.txt"
fi

{
  echo "# Sprint 20-A1 Inventory Counts"
  echo
  printf '%-40s %8s\n' "Artifact" "Count"
  printf '%-40s %8s\n' "Repository files" "$(wc -l < "${ARTIFACT_DIR}/repository-files.txt")"
  printf '%-40s %8s\n' "Runtime candidates" "$(wc -l < "${ARTIFACT_DIR}/runtime-candidate-files.txt")"
  printf '%-40s %8s\n' "Build/runtime manifests" "$(wc -l < "${ARTIFACT_DIR}/build-runtime-manifests.txt")"
  printf '%-40s %8s\n' "Deployment/operations files" "$(wc -l < "${ARTIFACT_DIR}/deployment-operations-files.txt")"
  printf '%-40s %8s\n' "Test files" "$(wc -l < "${ARTIFACT_DIR}/test-files.txt")"
  printf '%-40s %8s\n' "Database/migration files" "$(wc -l < "${ARTIFACT_DIR}/database-migrations.txt")"
  printf '%-40s %8s\n' "Runtime route signals" "$(wc -l < "${ARTIFACT_DIR}/runtime-route-signals.txt")"
  printf '%-40s %8s\n' "Technical debt signals" "$(wc -l < "${ARTIFACT_DIR}/technical-debt-signals.txt")"
  printf '%-40s %8s\n' "Duplicate filenames" "$(wc -l < "${ARTIFACT_DIR}/duplicate-filenames.txt")"
} > "${ARTIFACT_DIR}/inventory-counts.txt"

echo
echo "Sprint 20-A1 inventory generation completed."
cat "${ARTIFACT_DIR}/inventory-counts.txt"
