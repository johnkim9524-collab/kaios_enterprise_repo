param(
  [Parameter(Mandatory=$true)][string]$Stage
)

$ErrorActionPreference = 'Stop'
Write-Host "[$Stage] finalization: verify repository state and resync main" -ForegroundColor Cyan

$root = git rev-parse --show-toplevel
if (-not $root) { throw 'Not inside a Git repository.' }
Set-Location $root

$dirtyTracked = git status --porcelain | Where-Object { $_ -match '^[ MARCUD?!]{1,2} ' -and $_ -notmatch '^\?\?' }
if ($dirtyTracked) {
  Write-Host 'Tracked working-tree changes detected. Main resync blocked to protect local work:' -ForegroundColor Yellow
  $dirtyTracked | ForEach-Object { Write-Host $_ }
  throw 'Commit or stash tracked changes, then rerun finalize.'
}

$current = git branch --show-current
if ($current -ne 'main') {
  $backup = "backup/$($Stage.ToLower())-pre-main-sync-$(Get-Date -Format yyyyMMdd-HHmmss)"
  git branch $backup
  Write-Host "Safety branch created: $backup" -ForegroundColor Yellow
}

git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'git fetch origin failed.' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'git switch main failed.' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'main fast-forward sync failed.' }

Write-Host "PASS: $Stage finalized; repository is on synchronized main." -ForegroundColor Green
Write-Host "Branch: $(git branch --show-current)"
Write-Host "HEAD: $(git rev-parse --short HEAD)"
