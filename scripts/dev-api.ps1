[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$root = (Join-Path $PSScriptRoot "..")
Set-Location $root

# Ensure Go and Docker are in PATH
$additionalPaths = @(
    "C:\Program Files\Go\bin",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin",
    "C:\Program Files\Docker\Docker\resources\bin"
)
foreach ($p in $additionalPaths) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) {
        $env:Path = "$p;$env:Path"
    }
}

# Locate Go binary
$goCmd = $null
if (Get-Command go -ErrorAction SilentlyContinue) {
    $goCmd = "go"
} elseif (Test-Path "C:\Program Files\Go\bin\go.exe") {
    $goCmd = "C:\Program Files\Go\bin\go.exe"
} else {
    Write-Host "[API ERROR] Go executable not found in PATH or 'C:\Program Files\Go\bin\go.exe'." -ForegroundColor Red
    exit 1
}

# Ensure .env is present
$apiEnv = Join-Path $root "apps\api\.env"
$apiEnvExample = Join-Path $root "apps\api\.env.example"
if (-not (Test-Path $apiEnv)) {
    if (Test-Path $apiEnvExample) {
        Copy-Item $apiEnvExample $apiEnv
        Write-Host "[API] Initialized apps/api/.env from .env.example" -ForegroundColor Green
    } else {
        Write-Host "[API WARNING] apps/api/.env.example not found!" -ForegroundColor Yellow
    }
}

function Test-PostgresReady {
    $t = [System.Net.Sockets.TcpClient]::new()
    try {
        $iar = $t.BeginConnect("127.0.0.1", 5432, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(500)) {
            $t.EndConnect($iar)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $t.Dispose()
    }
}

$pgReady = Test-PostgresReady

# If not ready, check if Docker is running and try to start containers
if (-not $pgReady) {
    $dockerCli = Get-Command docker -ErrorAction SilentlyContinue
    $dockerRunning = $false
    if ($dockerCli) {
        $null = & $dockerCli.Source info 2>$null
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
        }
    }

    if ($dockerRunning) {
        Write-Host "[API] Docker detected. Starting infrastructure containers..." -ForegroundColor Cyan
        docker compose up -d postgres redis minio >$null 2>&1
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Milliseconds 500
            if (Test-PostgresReady) {
                $pgReady = $true
                break
            }
        }
    }
}

# If ready, launch Go server
if ($pgReady) {
    Write-Host "[API] Database connected. Starting Go API server on :8080..." -ForegroundColor Green
    & $goCmd run apps/api/cmd/server/main.go
    exit $LASTEXITCODE
}

# If not ready, show friendly warning and enter standby
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "  [API WARNING] Cannot connect to PostgreSQL on localhost:5432." -ForegroundColor Yellow
Write-Host "  Docker Desktop is not running (or PostgreSQL is stopped)." -ForegroundColor Yellow
Write-Host ""
Write-Host "  To enable the API backend:" -ForegroundColor Cyan
Write-Host "    1. Start Docker Desktop" -ForegroundColor White
Write-Host "    2. Run 'pnpm infra' (or wait for auto-detection)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "[API] Server in standby mode (waiting for PostgreSQL)..." -ForegroundColor DarkGray
Write-Host "[API] Frontend (http://localhost:3000) is ready for UI development." -ForegroundColor DarkGray
Write-Host ""

# Standby polling loop: automatically start Go server when PostgreSQL becomes ready
while ($true) {
    Start-Sleep -Seconds 3
    if (Test-PostgresReady) {
        Write-Host ""
        Write-Host "[API] PostgreSQL connection detected! Starting Go API server..." -ForegroundColor Green
        & $goCmd run apps/api/cmd/server/main.go
        break
    }
}
