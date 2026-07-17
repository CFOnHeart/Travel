<#
.SYNOPSIS
  Deploy the Travel app: frontend to GitHub Pages and/or backend to Azure Functions.

.PARAMETER Scope
  frontend | backend | all  (default: all)

.PARAMETER Message
  Git commit message for the frontend deploy.

.EXAMPLE
  ./deploy.ps1 -Scope all -Message "Update itinerary"
#>
param(
  [ValidateSet('frontend', 'backend', 'all')]
  [string]$Scope = 'all',
  [string]$Message = "Update travel app"
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (two levels up from this script: .github/skills/deploy-travel-app/scripts)
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location $RepoRoot
Write-Host "Repo root: $RepoRoot" -ForegroundColor Cyan

Write-Host "`n=== Mandatory pre-deployment chat tests ===" -ForegroundColor Green
Push-Location "api"
try {
  npm test
  if ($LASTEXITCODE -ne 0) { throw "Chat regression cases failed. Deployment stopped." }
} finally {
  Pop-Location
}
Write-Host "All chat regression cases passed." -ForegroundColor Green

# Derive Function App name from API_BASE (js/config.js, fallback to the HTML)
function Get-FunctionAppName {
  foreach ($f in @("云南/js/config.js", "云南/旅游计划.html")) {
    if (Test-Path $f) {
      $text = Get-Content $f -Raw
      if ($text -match "https://([a-z0-9-]+)\.azurewebsites\.net/api") { return $Matches[1] }
    }
  }
  throw "Could not find API_BASE Function App name in js/config.js or the HTML"
}

if ($Scope -in @('frontend', 'all')) {
  Write-Host "`n=== Frontend → GitHub Pages ===" -ForegroundColor Green
  Copy-Item "云南/旅游计划.html" "云南/index.html" -Force
  Write-Host "Synced 云南/index.html"
  git add -A
  # Only commit if there are staged changes
  $pending = git status --porcelain
  if ($pending) {
    git commit -m $Message | Out-Null
    git push origin main
    Write-Host "Pushed to GitHub. Pages will rebuild in ~1 min." -ForegroundColor Green
  } else {
    Write-Host "No changes to commit." -ForegroundColor Yellow
  }
}

if ($Scope -in @('backend', 'all')) {
  Write-Host "`n=== Backend → Azure Functions ===" -ForegroundColor Green
  $func = Get-FunctionAppName
  Write-Host "Target Function App: $func"

  # Verify login
  try { az account show 1>$null 2>$null } catch { throw "Not logged in. Run 'az login' first." }

  Push-Location "api"
  try {
    func azure functionapp publish $func
  } finally {
    Pop-Location
  }

  Write-Host "`nSmoke-testing API (cold start may take a moment)..." -ForegroundColor Cyan
  try {
    $r = Invoke-RestMethod "https://$func.azurewebsites.net/api/state" -TimeoutSec 90
    Write-Host "API OK: $($r | ConvertTo-Json -Compress)" -ForegroundColor Green
  } catch {
    Write-Warning "Smoke test failed: $($_.Exception.Message)"
  }
}

Write-Host "`nDone." -ForegroundColor Green
