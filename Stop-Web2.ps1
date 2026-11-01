$ErrorActionPreference='Stop'
$record=Join-Path $PSScriptRoot '.sandbox/processes.json'
if (-not (Test-Path -LiteralPath $record)) { Write-Output 'No sandbox process record.'; exit }
$saved=Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
foreach($entry in @($saved.frontend,$saved.backend)) {
    $owned=Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($owned -and $owned.StartTime.ToUniversalTime().ToString('o') -eq $entry.started) {
        Stop-Process -InputObject $owned
    }
}
Write-Output 'Stopped recorded Daymate Web2 processes only. Data preserved.'
