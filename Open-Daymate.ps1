param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$stateRoot = Join-Path $projectRoot '.sandbox'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$rootBytes = [Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())
$hash = [Security.Cryptography.SHA256]::Create()
try { $rootKey = ([BitConverter]::ToString($hash.ComputeHash($rootBytes))).Replace('-','').Substring(0,20) } finally { $hash.Dispose() }
$mutex = New-Object Threading.Mutex($false, ('Local\DaymateWeb2Launch_' + $rootKey))
$locked = $false
function Test-OwnedService($entry) {
    if (-not $entry) { return $false }
    $owned = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    return ($owned -and $owned.StartTime.ToUniversalTime().ToString('o') -eq $entry.started)
}
function Test-Ready {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8016/api/web2/health' -TimeoutSec 3
        $page = Invoke-WebRequest 'http://127.0.0.1:5186' -UseBasicParsing -TimeoutSec 3
        return ($health.service -eq 'daymate-web2' -and $page.StatusCode -eq 200 -and $page.Content -match 'Daymate')
    } catch { return $false }
}
try {
    try { $locked = $mutex.WaitOne(120000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Daymate is still preparing. Please try again shortly.' }
    $record = Join-Path $stateRoot 'processes.json'
    $saved = $null
    if (Test-Path -LiteralPath $record) { $saved = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json }
    $bothOwned = $saved -and (Test-OwnedService $saved.backend) -and (Test-OwnedService $saved.frontend)
    if (-not ($bothOwned -and (Test-Ready))) {
        # Only stop this isolated copy's recorded PIDs with the same start time.
        & (Join-Path $projectRoot 'Stop-Web2.ps1')
        $index = Join-Path $projectRoot 'frontend/dist/index.html'
        $buildRequired = -not (Test-Path -LiteralPath $index)
        if (-not $buildRequired) {
            $stamp = (Get-Item -LiteralPath $index).LastWriteTimeUtc
            $inputs = @(
                Get-ChildItem -LiteralPath (Join-Path $projectRoot 'frontend/src') -File -Recurse
                Get-ChildItem -LiteralPath (Join-Path $projectRoot 'frontend/public') -File -Recurse
                Get-ChildItem -LiteralPath (Join-Path $projectRoot 'frontend') -File
            )
            $buildRequired = @($inputs | Where-Object { $_.LastWriteTimeUtc -gt $stamp }).Count -gt 0
        }
        & (Join-Path $projectRoot 'Start-Web2.ps1') -SkipBuild:(-not $buildRequired)
        if (-not (Test-Ready)) { throw 'Daymate did not become ready. See the logs in .sandbox.' }
    }
    if (-not $NoOpen) {
        $browser = $null
        $candidates = @(
            (Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'),
            (Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'),
            (Join-Path $env:LOCALAPPDATA 'Microsoft/Edge/Application/msedge.exe'),
            (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe')
        )
        foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate) { $browser=$candidate; break } }
        if ($browser) {
            $profile = Join-Path $stateRoot 'desktop-browser'
            # Dedicated browser profile keeps this local app separate from other Daymate versions.
            Start-Process -FilePath $browser -ArgumentList @('--app=http://127.0.0.1:5186', ('--user-data-dir="' + $profile + '"'), '--no-first-run', '--no-default-browser-check') -WindowStyle Normal
        } else {
            Start-Process 'http://127.0.0.1:5186'
        }
    }
    Write-Output 'Daymate desktop launcher ready.'
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
