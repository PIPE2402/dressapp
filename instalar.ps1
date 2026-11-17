$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force bin | Out-Null
Invoke-WebRequest 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile 'bin/yt-dlp.exe'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm.cmd ci
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Host 'Instalación terminada. Abre iniciar.cmd.'
