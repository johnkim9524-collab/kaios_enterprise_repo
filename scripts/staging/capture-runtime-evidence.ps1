param(
  [Parameter(Mandatory = $true)][string]$KidultsBaseUrl,
  [Parameter(Mandatory = $true)][string]$ArtfundBaseUrl,
  [Parameter(Mandatory = $true)][string]$ViewerToken,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Invoke-Probe {
  param([string]$Id, [string]$Vertical, [string]$Category, [scriptblock]$Action)
  try {
    $details = & $Action
    return [ordered]@{ id=$Id; vertical=$Vertical; category=$Category; status="pass"; observedAt=(Get-Date).ToUniversalTime().ToString("o"); details=$details }
  } catch {
    return [ordered]@{ id=$Id; vertical=$Vertical; category=$Category; status="fail"; observedAt=(Get-Date).ToUniversalTime().ToString("o"); details=[ordered]@{ error=$_.Exception.Message } }
  }
}

$headers = @{ Authorization = "Bearer $ViewerToken" }
$probes = @()
$probes += Invoke-Probe "kidults-api" "kidults" "api" { $r = Invoke-WebRequest -Uri "$KidultsBaseUrl/api/health" -Headers $headers -UseBasicParsing; @{ http=$r.StatusCode } }
$probes += Invoke-Probe "artfund-api" "artfund" "api" { $r = Invoke-WebRequest -Uri "$ArtfundBaseUrl/api/health" -Headers $headers -UseBasicParsing; @{ http=$r.StatusCode } }
$probes += Invoke-Probe "kidults-desktop" "kidults" "portal_desktop" { $r = Invoke-WebRequest -Uri $KidultsBaseUrl -UseBasicParsing; @{ http=$r.StatusCode; contentBytes=$r.RawContentLength } }
$probes += Invoke-Probe "artfund-desktop" "artfund" "portal_desktop" { $r = Invoke-WebRequest -Uri $ArtfundBaseUrl -UseBasicParsing; @{ http=$r.StatusCode; contentBytes=$r.RawContentLength } }
$probes += [ordered]@{ id="mobile-manual"; vertical="kidults"; category="portal_mobile"; status="not_run"; observedAt=(Get-Date).ToUniversalTime().ToString("o"); details=@{ requiredViewport=320; horizontalOverflow=$null } }
$probes += [ordered]@{ id="migration-manual"; vertical="governance"; category="migration"; status="not_run"; observedAt=(Get-Date).ToUniversalTime().ToString("o"); details=@{} }
$probes += [ordered]@{ id="restore-manual"; vertical="governance"; category="backup_restore"; status="not_run"; observedAt=(Get-Date).ToUniversalTime().ToString("o"); details=@{} }
$probes += [ordered]@{ id="isolation-manual"; vertical="artfund"; category="failure_isolation"; status="not_run"; observedAt=(Get-Date).ToUniversalTime().ToString("o"); details=@{} }

$package = [ordered]@{
  releaseCandidateId = "ih-dual-rc-2026.09.09-rc1"
  environment = "staging"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  productionPromotionAuthorized = $false
  publicationEnabled = $false
  probes = $probes
}

$package | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding utf8
Write-Host "Evidence template written to $OutputPath"
