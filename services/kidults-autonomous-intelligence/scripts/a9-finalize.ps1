param(
  [string]$WorkerUrl = "https://kidults-autonomous-intelligence.john-kim9524.workers.dev"
)

$ErrorActionPreference = "Stop"

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Pass($text) { Write-Host "PASS: $text" -ForegroundColor Green }

Step "Install dependencies"
npm install

Step "Typecheck"
npm run typecheck
Pass "TypeScript"

Step "Deployment preflight"
npm run deploy:preflight
Pass "Preflight"

Step "Deploy staging worker"
npm run deploy
Pass "Deployment"

Step "Health"
$health = Invoke-RestMethod "$WorkerUrl/health"
if (-not $health.ok) { throw "Health check failed" }
$health | Format-List
Pass "Health"

Step "Golden Path endpoint"
$golden = Invoke-RestMethod "$WorkerUrl/internal/golden-path/transactions"
if (-not $golden.items -or $golden.items.Count -lt 3) { throw "Golden Path evidence fixture is not available" }
if ($golden.governance.productionEligible -ne $false) { throw "Golden Path must remain non-production" }
Pass "Golden Path governance"

Step "Authenticate"
$secure = Read-Host "INGEST_TOKEN" -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $secure).Password
$headers = @{ Authorization = "Bearer $plain" }

try {
  Step "Autonomous cycle #1"
  $cycle1 = Invoke-RestMethod -Method POST "$WorkerUrl/internal/autonomous-cycle" -Headers $headers
  $cycle1 | ConvertTo-Json -Depth 20
  if (-not $cycle1.ok) { throw "Cycle #1 failed" }

  Step "Autonomous cycle #2 - idempotency"
  $cycle2 = Invoke-RestMethod -Method POST "$WorkerUrl/internal/autonomous-cycle" -Headers $headers
  $cycle2 | ConvertTo-Json -Depth 20
  if (-not $cycle2.ok) { throw "Cycle #2 failed" }

  Step "D1 collector verification"
  npx wrangler d1 execute DB --remote --command "SELECT adapter_id,source_family,status,raw_count,normalized_count,accepted_count,rejected_count,started_at,finished_at FROM collector_runs ORDER BY started_at DESC LIMIT 10;"

  Step "D1 publication verification"
  npx wrangler d1 execute DB --remote --command "SELECT id,run_id,channel,status,published_at FROM publication_snapshots ORDER BY published_at DESC LIMIT 10;"

  Step "D1 audit verification"
  npx wrangler d1 execute DB --remote --command "SELECT event_type,actor,subject_id,details_json,created_at FROM audit_log ORDER BY created_at DESC LIMIT 20;"

  Pass "A9 integrated runtime verification completed"
}
finally {
  Remove-Variable plain,secure,headers -ErrorAction SilentlyContinue
}
