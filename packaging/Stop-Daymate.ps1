$ErrorActionPreference='Stop'
$record=Join-Path $env:LOCALAPPDATA 'DaymateWeb2Public/process.json'
if(Test-Path $record){
 $entry=Get-Content $record -Raw | ConvertFrom-Json
 $owned=Get-Process -Id $entry.id -ErrorAction SilentlyContinue
 if($owned -and $owned.StartTime.ToUniversalTime().ToString('o') -eq $entry.started){Stop-Process -InputObject $owned}
}
