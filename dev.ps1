<#
.SYNOPSIS
    One-click development stack startup script for Klados.
.DESCRIPTION
    Ensures environment configuration is present, boots infrastructure
    via Docker Compose (PostgreSQL, Redis, MinIO) if Docker Desktop is running,
    and concurrently launches the Go API backend and Next.js frontend.
    Gracefully degrades to frontend-only development mode if Docker is offline.
#>

[CmdletBinding()]
param(
    [switch]$WebOnly,
    [switch]$ApiOnly
)

$ErrorActionPreference = "Continue"

# Ensure working directory is the script's directory (monorepo root)
Set-Location $PSScriptRoot

try {
    $Host.UI.RawUI.WindowTitle = "Klados Development Environment"
} catch {
    # Ignore if not in interactive console
}

# Add common Go and Docker paths to PATH if not already included
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

# Automatically clean up lingering processes on port 3000 or 8080 from previous runs
function Free-Port {
    param([int]$Port)
    try {
        $tcp = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($tcp) {
            $pids = $tcp | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($p in $pids) {
                if ($p -and $p -ne $PID) {
                    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
                    if ($proc -and ($proc.ProcessName -match "node|server|main")) {
                        Write-Host "      [CLEANUP] Stopping lingering process on port $Port (PID: $p, $($proc.ProcessName))..." -ForegroundColor Yellow
                        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
    } catch {
        # Ignore permission or non-existent errors
    }
}
Free-Port 3000
Free-Port 8080

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "             Starting Klados Development Stack            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure apps/api/.env exists
Write-Host "[1/3] Checking environment configuration..." -ForegroundColor Cyan
$apiEnv = Join-Path $PSScriptRoot "apps\api\.env"
$apiEnvExample = Join-Path $PSScriptRoot "apps\api\.env.example"

if (-not (Test-Path $apiEnv)) {
    if (Test-Path $apiEnvExample) {
        Copy-Item $apiEnvExample $apiEnv
        Write-Host "      [CREATED] apps/api/.env initialized from .env.example" -ForegroundColor Green
    } else {
        Write-Host "      [WARNING] apps/api/.env.example not found!" -ForegroundColor Yellow
    }
} else {
    Write-Host "      [OK] apps/api/.env is present" -ForegroundColor Green
}

# 2. Check and start Docker infrastructure
Write-Host "[2/3] Checking infrastructure services (PostgreSQL, Redis, MinIO)..." -ForegroundColor Cyan
$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
$dockerRunning = $false

if ($dockerCli) {
    $null = & $dockerCli.Source info 2>$null
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
    }
}

# If Docker is not running, check if Docker Desktop is installed and try launching it
if (-not $dockerRunning) {
    $dockerDesktopExe = @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
        "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($dockerDesktopExe) {
        Write-Host "      Docker Desktop detected. Launching in background..." -ForegroundColor Cyan
        Start-Process $dockerDesktopExe
        Write-Host "      Waiting for Docker daemon to initialize..." -ForegroundColor DarkGray
        for ($i = 0; $i -lt 12; $i++) {
            Start-Sleep -Seconds 2
            if ($dockerCli) {
                $null = & $dockerCli.Source info 2>$null
                if ($LASTEXITCODE -eq 0) {
                    $dockerRunning = $true
                    Write-Host "      [OK] Docker daemon is ready!" -ForegroundColor Green
                    break
                }
            }
        }
    }
}

if ($dockerRunning) {
    Write-Host "      Starting containers via docker compose up -d..." -ForegroundColor Cyan
    docker compose up -d
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      [OK] Infrastructure containers running" -ForegroundColor Green
    } else {
        Write-Host "      [WARNING] 'docker compose up -d' exited with code $LASTEXITCODE." -ForegroundColor Yellow
    }
} else {
    Write-Host "      [INFO] Docker Desktop is offline." -ForegroundColor Yellow
    Write-Host "      Starting Frontend and API in standalone/standby mode." -ForegroundColor Yellow
    Write-Host "      Tip: Start Docker Desktop anytime to automatically connect database & storage." -ForegroundColor DarkGray
}

# 3. Launch Backend and Frontend concurrently
Write-Host "[3/3] Launching development servers..." -ForegroundColor Cyan
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Web Frontend : http://localhost:3000" -ForegroundColor Yellow
if ($dockerRunning) {
    Write-Host "  API Backend  : http://localhost:8080" -ForegroundColor Yellow
    Write-Host "  MinIO Console: http://localhost:9001 (minioadmin / minioadmin)" -ForegroundColor Yellow
} else {
    Write-Host "  API Backend  : [STANDBY] Waiting for PostgreSQL (start Docker to activate)" -ForegroundColor DarkGray
    Write-Host "  MinIO Console: [OFFLINE] Requires Docker Desktop" -ForegroundColor DarkGray
}
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to shut down development servers.`n" -ForegroundColor DarkGray

if ($WebOnly) {
    pnpm run dev:web
} elseif ($ApiOnly) {
    pnpm run dev:api
} else {
    try {
        pnpm exec concurrently -k -p "[{name}]" -n "API,WEB" -c "green.bold,blue.bold" "pnpm run dev:api" "pnpm run dev:web"
    } catch {
        Write-Host "`nDevelopment server terminated: $_" -ForegroundColor Yellow
    } finally {
        Write-Host "`n==========================================================" -ForegroundColor Cyan
        Write-Host "  Klados development servers stopped." -ForegroundColor Yellow
        if ($dockerRunning) {
            Write-Host "  Infrastructure containers are still running." -ForegroundColor DarkGray
            Write-Host "  Run 'pnpm run infra:down' to stop Docker containers." -ForegroundColor DarkGray
        }
        Write-Host "==========================================================" -ForegroundColor Cyan
    }
}
