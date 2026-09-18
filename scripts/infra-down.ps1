[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$additionalPaths = @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin",
    "C:\Program Files\Docker\Docker\resources\bin"
)
foreach ($p in $additionalPaths) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) {
        $env:Path = "$p;$env:Path"
    }
}

$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCli) {
    $null = & $dockerCli.Source info 2>$null
    if ($LASTEXITCODE -eq 0) {
        docker compose down
        Write-Host "[OK] Infrastructure containers stopped." -ForegroundColor Green
    }
}
