param(
  [string]$WorkerUrl = "https://kidults-autonomous-intelligence.john-kim9524.workers.dev"
)

$ErrorActionPreference = "Stop"

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Pass($text) { Write-Host "PASS: $text" -ForegroundColor Green }
function Fail($text) { throw "FAIL: $text" }

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
if (-not $health.ok) { Fail "Health check" }
$health | Format-List
Pass "Health"

Step "Security boundary"
try {
  Invoke-RestMethod -Method POST "$WorkerUrl/internal/autonomous-cycle" | Out-Null
  Fail "Unauthenticated autonomous-cycle request was accepted"
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw }
  Pass "Unauthenticated cycle blocked with 401"
}

Step "Authenticate"
$secure = Read-Host "INGEST_TOKEN" -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $secure).Password
$headers = @{ Authorization = "Bearer $plain" }

try {
  Step "Autonomous cycle #1"
  $cycle1 = Invoke-RestMethod -Method POST "$WorkerUrl/internal/autonomous-cycle" -Headers $headers
  $cycle1 | ConvertTo-Json -Depth 20
  if (-not $cycle1.ok) { Fail "Cycle #1" }
  if ($cycle1.collection.adapters -lt 1) { Fail "No adapter executed" }
  if (($cycle1.collection.accepted + $cycle1.collection.duplicates) -lt 3) { Fail "Golden Path evidence did not reach ingestion" }
  if ($cycle1.promotion.promoted) { Fail "Illustrative evidence was promoted" }
  Pass "Cycle #1"

  Step "Autonomous cycle #2 - idempotency"
  $cycle2 = Invoke-RestMethod -Method POST "$WorkerUrl/internal/autonomous-cycle" -Headers $headers
  $cycle2 | ConvertTo-Json -Depth 20
  if (-not $cycle2.ok) { Fail "Cycle #2" }
  if ($cycle2.collection.accepted -ne 0) { Fail "Duplicate evidence was accepted on replay" }
  if ($cycle2.collection.duplicates -lt 3) { Fail "Expected duplicate evidence was not detected" }
  if ($cycle2.promotion.promoted) { Fail "Illustrative replay was promoted" }
  Pass "Idempotency and fail-closed publication"

  Step "D1 collector verification"
  npx wrangler d1 execute DB --remote --command "SELECT adapter_id,source_family,status,raw_count,normalized_count,accepted_count,rejected_count,started_at,finished_at FROM collector_runs ORDER BY started_at DESC LIMIT 10;"

  Step "D1 evidence count"
  npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS evidence_count FROM evidence_ledger;"

  Step "D1 publication verification"
  npx wrangler d1 execute DB --remote --command "SELECT id,run_id,channel,status,published_at FROM publication_snapshots ORDER BY rowid DESC LIMIT 10;"

  Step "D1 audit verification"
  npx wrangler d1 execute DB --remote --command "SELECT event_type,actor,subject_id,details_json,created_at FROM audit_log ORDER BY created_at DESC LIMIT 20;"

  Pass "A9 integrated runtime certification completed"
  Write-Host "`nNext gates: scheduled cron observation, failure isolation, synthetic scale certification." -ForegroundColor Yellow
}
finally {
  Remove-Variable plain,secure,headers -ErrorAction SilentlyContinue
}
