$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "Starting SmartPOS AI demo stack..."
docker compose up -d --build postgres redis backend frontend jenkins

Write-Host "Waiting for services..."
& "$Root\scripts\verify_health.ps1"

Write-Host ""
Write-Host "SmartPOS AI demo is ready."
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend:  http://localhost:8000/health"
Write-Host "API docs: http://localhost:8000/api/docs"
Write-Host "Jenkins:  http://localhost:8081"
