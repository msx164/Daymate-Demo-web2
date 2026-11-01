param([switch]$NoOpen)
$ErrorActionPreference='Stop'
$dataRoot=Join-Path $env:LOCALAPPDATA 'DaymateWeb2Public'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$server=Join-Path $PSScriptRoot 'server/DaymateServer.exe'
$ready=$false
try {
 $marker=Invoke-WebRequest 'http://127.0.0.1:5188/__daymate_public__' -UseBasicParsing -TimeoutSec 2
 $health=Invoke-RestMethod 'http://127.0.0.1:8018/api/web2/health' -TimeoutSec 2
 $ready=($marker.Content -eq 'daymate-web2-public' -and $health.service -eq 'daymate-web2')
} catch {}
if(-not $ready) {
 foreach($port in @(8018,5188)) {
  if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw "Port $port is occupied. No other process was stopped."}
 }
 $proc=Start-Process -FilePath $server -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataRoot 'server.log') -RedirectStandardError (Join-Path $dataRoot 'server-error.log') -PassThru
 for($i=0;$i -lt 60;$i++) {
  if($proc.HasExited){throw 'Daymate server failed. See server-error.log in your local app data.'}
  try {$health=Invoke-RestMethod 'http://127.0.0.1:8018/api/web2/health' -TimeoutSec 1;if($health.service -eq 'daymate-web2'){$ready=$true;break}} catch {}
  Start-Sleep -Milliseconds 500
 }
 if(-not $ready){throw 'Daymate startup timed out.'}
 @{id=$proc.Id;started=$proc.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $dataRoot 'process.json')
}
if(-not $NoOpen) {
 $browser=Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'
 if(Test-Path $browser){Start-Process -FilePath $browser -ArgumentList @('--app=http://127.0.0.1:5188',('--user-data-dir="'+(Join-Path $dataRoot 'browser')+'"'),'--no-first-run') -WindowStyle Normal}
 else {Start-Process 'http://127.0.0.1:5188'}
}
Write-Output 'Daymate public edition ready.'
