@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$parts=Get-ChildItem -LiteralPath 'release-parts' -Filter '*.part' | Sort-Object Name; $dest='Daymate-Web2-Public-1.0.0-Setup.exe'; $out=[IO.File]::Create((Join-Path (Get-Location) $dest)); try {foreach($part in $parts){$input=[IO.File]::OpenRead($part.FullName); try {$input.CopyTo($out)} finally {$input.Dispose()}}} finally {$out.Dispose()}; $expected=((Get-Content -LiteralPath ('release-parts/'+$dest+'.sha256') -Raw) -split ' ' )[0]; if((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash -ne $expected){throw 'Checksum mismatch'}; Write-Host 'Installer assembled and verified.'"
pause
