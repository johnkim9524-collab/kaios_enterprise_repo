param(
  [Parameter(Mandatory=$true)][string]$Stage
)

$ErrorActionPreference = 'Stop'
Write-Host "[$Stage] finalization: prove certified SHA equals canonical main before resync" -ForegroundColor Cyan

$root = git rev-parse --show-toplevel
if (-not $root) { throw 'Not inside a Git repository.' }
Set-Location $root

$dirtyTracked = git status --porcelain | Where-Object { $_ -match '^[ MARCUD?!]{1,2} ' -and $_ -notmatch '^\?\?' }
if ($dirtyTracked) {
  Write-Host 'Tracked working-tree changes detected. Main resync blocked to protect local work:' -ForegroundColor Yellow
  $dirtyTracked | ForEach-Object { Write-Host $_ }
  throw 'Commit or stash tracked changes, then rerun finalize.'
}

$certifiedHead = (git rev-parse HEAD).Trim()
if (-not $certifiedHead) { throw 'Unable to resolve certified HEAD.' }
Write-Host "Certified SHA: $certifiedHead"

# Refresh only the remote-tracking reference first. Do not change the working tree
# until the exact commit that just passed certification is proven to be canonical main.
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'git fetch origin failed.' }
$targetMain = (git rev-parse origin/main).Trim()
if (-not $targetMain) { throw 'Unable to resolve origin/main.' }
Write-Host "Canonical origin/main SHA: $targetMain"

if ($certifiedHead -ne $targetMain) {
  Write-Host 'Canonical main advanced or differs from the commit that was certified.' -ForegroundColor Yellow
  Write-Host 'Failing closed: rerun the stage certification on the current origin/main before finalizing.' -ForegroundColor Yellow
  throw "Certified SHA $certifiedHead does not equal origin/main $targetMain."
}

$current = git branch --show-current
if ($current -ne 'main') {
  $backup = "backup/$($Stage.ToLower())-pre-main-sync-$(Get-Date -Format yyyyMMdd-HHmmss)"
  git branch $backup
  if ($LASTEXITCODE -ne 0) { throw 'Safety branch creation failed.' }
  Write-Host "Safety branch created: $backup" -ForegroundColor Yellow
}

git switch main
if ($LASTEXITCODE -ne 0) { throw 'git switch main failed.' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'main fast-forward sync failed.' }

$finalHead = (git rev-parse HEAD).Trim()
if ($finalHead -ne $certifiedHead) {
  throw "Final HEAD $finalHead does not match certified SHA $certifiedHead."
}

Write-Host "PASS: $Stage finalized on the exact certified canonical main SHA." -ForegroundColor Green
Write-Host "Branch: $(git branch --show-current)"
Write-Host "Certified SHA: $certifiedHead"
Write-Host "Final SHA: $finalHead"
