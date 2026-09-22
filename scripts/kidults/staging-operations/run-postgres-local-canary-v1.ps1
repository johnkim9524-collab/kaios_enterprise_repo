param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSha,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$evidence=[IO.Path]::GetFullPath($EvidenceRoot)
if($evidence.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'EVIDENCE_MUST_BE_OUTSIDE_CHECKOUT'}
if(Test-Path $evidence){throw 'NEW_EVIDENCE_DIRECTORY_REQUIRED'}
if((git -C $root rev-parse HEAD) -ne $ExpectedSha){throw 'EXACT_SHA_MISMATCH'}
if(git -C $root status --porcelain=v1){throw 'CLEAN_CHECKOUT_REQUIRED'}
$node='node@sha256:22553920add6fb1fd909104346924cd30b4b3ac76ca2980f3b8dba8ede3cf945'
$postgres='postgres@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652'
function Invoke-Docker { & docker @args; if($LASTEXITCODE -ne 0){throw ('DOCKER_COMMAND_FAILED:'+ $LASTEXITCODE)} }
Invoke-Docker image inspect $node --format '{{.Id}}'
Invoke-Docker image inspect $postgres --format '{{.Id}}'
$id='kpmo-pg-'+[Guid]::NewGuid().ToString('N').Substring(0,16)
$packet=Join-Path ([IO.Path]::GetTempPath()) $id
$networkCreated=$false; $containerCreated=$false
New-Item -ItemType Directory -Path $evidence,"$packet/scripts/kidults/staging-operations/lib","$packet/tests/kidults/staging-operations/postgres-live-deps","$packet/coordination/kidults/staging-operations","$packet/results" -Force|Out-Null
try {
  Copy-Item "$root/scripts/kidults/staging-operations/lib/*.mjs" "$packet/scripts/kidults/staging-operations/lib/"
  Copy-Item "$root/tests/kidults/staging-operations/*.test.mjs","$root/tests/kidults/staging-operations/postgres-live-canary-v1.mjs" "$packet/tests/kidults/staging-operations/"
  Copy-Item "$root/tests/kidults/staging-operations/postgres-live-deps/package*.json" "$packet/tests/kidults/staging-operations/postgres-live-deps/"
  Copy-Item "$root/coordination/kidults/staging-operations/autonomous-provider-event-v1.schema.json" "$packet/coordination/kidults/staging-operations/"
  Copy-Item "$root/package.json","$root/npm-shrinkwrap.json" $packet
  $mount="type=bind,source=$packet,target=/suite"
  Invoke-Docker run --rm --memory 512m --cpus 1 --mount $mount -w /suite $node sh -c 'npm ci --ignore-scripts --no-audit --no-fund && npm ci --prefix tests/kidults/staging-operations/postgres-live-deps --ignore-scripts --no-audit --no-fund'
  [IO.File]::WriteAllText("$packet/.gitignore","node_modules/`nresults/`n",(New-Object Text.UTF8Encoding $false))
  Invoke-Docker run --rm --network none --memory 512m --cpus 1 --mount $mount -w /suite $node sh -c 'git init -q -b canary-fixture && git add scripts tests coordination package.json npm-shrinkwrap.json .gitignore && git -c user.name=CanaryFixture -c user.email=fixture@invalid.local commit -qm fixture && export TEST_GIT_SHA=$(git rev-parse HEAD) TEST_GIT_REF=refs/heads/canary-fixture && node --test --test-reporter=tap tests/kidults/staging-operations/*.test.mjs > results/unit-linux.tap'
  Invoke-Docker network create --internal --label kpmo.scope=local-postgres-canary $id
  $networkCreated=$true
  Invoke-Docker run -d --name $id --label kpmo.scope=local-postgres-canary --network $id --network-alias postgres --memory 512m --cpus 1 --tmpfs '/var/lib/postgresql/data:rw,size=256m' --tmpfs /var/run/postgresql -e POSTGRES_DB=kpmo_canary -e POSTGRES_PASSWORD=isolated-test-fixture-only $postgres
  $containerCreated=$true
  $ready=$false
  for($i=0;$i -lt 30;$i++){
    & docker exec $id pg_isready -U postgres -d kpmo_canary *> $null
    if($LASTEXITCODE -eq 0){$ready=$true; break}; Start-Sleep -Seconds 1
  }
  if(!$ready){throw 'POSTGRES_START_TIMEOUT'}
  $net=(& docker network inspect $id|ConvertFrom-Json)[0]
  $db=(& docker inspect $id|ConvertFrom-Json)[0]
  if(!$net.Internal -or $db.HostConfig.PortBindings.PSObject.Properties.Count -gt 0){throw 'ISOLATION_BOUNDARY_INVALID'}
  @{source_commit=$ExpectedSha;postgres_image=$postgres;node_image=$node;docker_network_internal=$net.Internal;published_ports=$db.HostConfig.PortBindings;unit_git_scope='ISOLATED_GIT_FIXTURE_NOT_PROTECTED_MAIN';production='HOLD';public='HOLD';g5='HOLD'}|ConvertTo-Json -Depth 5|Set-Content "$packet/results/execution-boundary.json" -Encoding UTF8
  Invoke-Docker run --rm --network $id --memory 512m --cpus 1 -e KPMO_POSTGRES_CANARY_SCOPE=ISOLATED_DOCKER_ONLY -e PGHOST=postgres -e "KPMO_CANARY_SOURCE_SHA=$ExpectedSha" --mount $mount -w /suite $node node tests/kidults/staging-operations/postgres-live-canary-v1.mjs
  if((git -C $root rev-parse HEAD) -ne $ExpectedSha -or (git -C $root status --porcelain=v1)){throw 'SOURCE_CHANGED_DURING_CANARY'}
} finally {
  if(Test-Path "$packet/results"){Copy-Item "$packet/results/*" $evidence -Force -ErrorAction Continue}
  if($containerCreated){& docker rm -f $id|Out-Null}
  if($networkCreated){& docker network rm $id|Out-Null}
  if(Test-Path $packet){Remove-Item $packet -Recurse -Force}
}
Get-ChildItem $evidence -File | ForEach-Object { Get-FileHash $_.FullName -Algorithm SHA256 } | Select-Object Path,Hash | ConvertTo-Json
