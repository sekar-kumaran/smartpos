$ErrorActionPreference = "Stop"

function Wait-ForUrl {
  param(
    [string]$Name,
    [string]$Url,
    [int]$Attempts = 60
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4 | Out-Null
      Write-Host "OK: $Name"
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "FAILED: $Name ($Url)"
}

docker compose exec -T postgres pg_isready -U smartpos -d smartpos | Out-Null
Write-Host "OK: postgres"

Wait-ForUrl -Name "backend readiness" -Url "http://localhost:8000/health/ready"
Wait-ForUrl -Name "frontend" -Url "http://localhost:3000/healthz"
Wait-ForUrl -Name "jenkins" -Url "http://localhost:8081/login" -Attempts 90

docker compose ps
