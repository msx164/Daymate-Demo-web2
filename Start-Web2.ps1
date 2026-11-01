param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
foreach ($port in @(8016,5186)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Port $port is occupied. No existing process was stopped. Use Stop-Web2.ps1 only for this sandbox."
    }
}
$stateRoot = Join-Path $projectRoot '.sandbox'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
# Do not inherit personal AI keys, desktop tokens, database paths or old settings.
Get-ChildItem Env: | Where-Object { $_.Name -like 'DAYMATE_*' -or $_.Name -eq 'VITE_API_URL' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:VITE_API_URL = 'http://127.0.0.1:8016'
$env:PYTHONDONTWRITEBYTECODE = '1'
$python = Join-Path $projectRoot '.venv/Scripts/python.exe'
$node = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $python)) { throw 'Isolated Python environment is missing. See README-WEB2.md.' }
$vite=Join-Path $projectRoot 'frontend/node_modules/vite/bin/vite.js'
Push-Location (Join-Path $projectRoot 'frontend')
try {
    if (-not $SkipBuild -or -not (Test-Path -LiteralPath (Join-Path $projectRoot 'frontend/dist/index.html'))) {
        & $node $vite build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    }
} finally { Pop-Location }
$backend = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','web2_main:app','--host','127.0.0.1','--port','8016') -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateRoot 'backend.log') -RedirectStandardError (Join-Path $stateRoot 'backend-error.log') -PassThru
try {
    $ready=$false
    for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 400
        if ($backend.HasExited) { throw 'Backend did not start. Check .sandbox/backend-error.log.' }
        try { $health=Invoke-RestMethod 'http://127.0.0.1:8016/api/web2/health'; if ($health.service -eq 'daymate-web2') {$ready=$true;break} } catch { }
    }
    if (-not $ready) { throw 'Backend startup timed out.' }
    $frontend=Start-Process -FilePath $node -ArgumentList @(('"'+$vite+'"'),'preview','--host','127.0.0.1','--port','5186','--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateRoot 'frontend.log') -RedirectStandardError (Join-Path $stateRoot 'frontend-error.log') -PassThru
    Start-Sleep -Milliseconds 1600
    if ($frontend.HasExited) { throw 'Frontend did not start. Check .sandbox/frontend-error.log.' }
    @{backend=@{id=$backend.Id;started=$backend.StartTime.ToUniversalTime().ToString('o')};frontend=@{id=$frontend.Id;started=$frontend.StartTime.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $stateRoot 'processes.json')
    Write-Output 'Daymate Web2 ready: http://127.0.0.1:5186'
    Write-Output 'Independent ports 8016/5186. Independent data under .sandbox/development. Original Daymate is untouched.'
} catch {
    if (-not $backend.HasExited) { $backend.Kill() }
    throw
}
