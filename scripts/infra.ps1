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
if (-not $dockerCli) {
    Write-Host "[WARNING] Docker executable not found in PATH or standard install paths." -ForegroundColor Yellow
    Write-Host "Please install or configure Docker Desktop to start infrastructure services." -ForegroundColor Yellow
    exit 0
}

$null = & $dockerCli.Source info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Docker Desktop / daemon is not running." -ForegroundColor Yellow
    Write-Host "Please start Docker Desktop to start infrastructure services (PostgreSQL, Redis, MinIO)." -ForegroundColor Yellow
    exit 0
}

Write-Host "Starting infrastructure services (PostgreSQL, Redis, MinIO)..." -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Infrastructure containers running." -ForegroundColor Green
} else {
    Write-Host "[WARNING] 'docker compose up -d' exited with code $LASTEXITCODE." -ForegroundColor Yellow
}
