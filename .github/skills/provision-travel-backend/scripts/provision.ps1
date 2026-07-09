<#
.SYNOPSIS
  Provision (new) or update (existing) the Travel app Azure backend:
  Resource Group + Storage (Table/Blob) + Function App (Node 22, consumption) + CORS + code deploy.

.PARAMETER Mode
  new    -> create all resources with a unique suffix, deploy, and rewrite frontend API_BASE.
  update -> reuse existing Function App (from API_BASE), re-apply settings/CORS, redeploy.

.PARAMETER Location        Azure region (default eastasia).
.PARAMETER ResourceGroup   Resource group name (default rg-yn-travel).
.PARAMETER PagesOrigin     Frontend origin for CORS (default https://cfonheart.github.io).
.PARAMETER NodeVersion     Functions Node runtime version (default 22).

.EXAMPLE
  ./provision.ps1 -Mode new -Location eastasia -PagesOrigin "https://cfonheart.github.io"
.EXAMPLE
  ./provision.ps1 -Mode update
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('new', 'update')][string]$Mode,
  [string]$Location = 'eastasia',
  [string]$ResourceGroup = 'rg-yn-travel',
  [string]$PagesOrigin = 'https://cfonheart.github.io',
  [string]$NodeVersion = '22'
)

$ErrorActionPreference = 'Stop'

# Repo root = four levels up from scripts folder
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Set-Location $RepoRoot
$Html = "云南/旅游计划.html"

function Assert-Login {
  try { az account show 1>$null 2>$null }
  catch { throw "Not logged in. Run 'az login' first." }
  $acct = az account show --query "{sub:name, id:id, user:user.name}" -o json | ConvertFrom-Json
  Write-Host "Subscription: $($acct.sub)  User: $($acct.user)" -ForegroundColor Cyan
}

function Get-FunctionAppName {
  $html = Get-Content $Html -Raw
  if ($html -match "https://([a-z0-9-]+)\.azurewebsites\.net/api") { return $Matches[1] }
  throw "Could not find API_BASE Function App name in $Html"
}

function Set-Cors($func, $rg) {
  # Remove-then-add is idempotent for our two known origins
  az functionapp cors add -n $func -g $rg --allowed-origins $PagesOrigin "http://localhost:3000" 2>$null | Out-Null
  Write-Host "CORS ensured for $PagesOrigin"
}

function Set-AppSettings($func, $rg) {
  az functionapp config appsettings set -n $func -g $rg `
    --settings "AzureWebJobsFeatureFlags=EnableWorkerIndexing" | Out-Null
  Write-Host "App settings ensured (EnableWorkerIndexing)"
}

function Publish-Code($func) {
  Push-Location "api"
  try {
    if (-not (Test-Path "node_modules")) { npm install | Out-Null }
    func azure functionapp publish $func
  } finally { Pop-Location }
}

function Test-Api($func) {
  Write-Host "Smoke-testing (cold start may take a moment)..." -ForegroundColor Cyan
  try {
    $r = Invoke-RestMethod "https://$func.azurewebsites.net/api/state" -TimeoutSec 90
    Write-Host "API OK: $($r | ConvertTo-Json -Compress)" -ForegroundColor Green
  } catch { Write-Warning "Smoke test failed: $($_.Exception.Message)" }
}

Assert-Login

if ($Mode -eq 'new') {
  $sfx  = -join ((1..6) | ForEach-Object { [char[]]'abcdefghijklmnopqrstuvwxyz0123456789' | Get-Random })
  $sa   = "styn$sfx"
  $func = "func-yntravel-$sfx"
  Write-Host "`n=== NEW environment ===" -ForegroundColor Green
  Write-Host "RG=$ResourceGroup  Storage=$sa  Func=$func  Region=$Location"

  az provider register --namespace Microsoft.Web    | Out-Null
  az provider register --namespace Microsoft.Storage | Out-Null

  az group create -n $ResourceGroup -l $Location | Out-Null
  Write-Host "Resource group ready."

  az storage account create -n $sa -g $ResourceGroup -l $Location `
    --sku Standard_LRS --allow-blob-public-access true | Out-Null
  Write-Host "Storage account created."

  az functionapp create -n $func -g $ResourceGroup --storage-account $sa `
    --consumption-plan-location $Location `
    --runtime node --runtime-version $NodeVersion --functions-version 4 --os-type Linux | Out-Null
  Write-Host "Function app created."

  Set-AppSettings $func $ResourceGroup
  Set-Cors $func $ResourceGroup
  Publish-Code $func

  # Rewrite API_BASE in the frontend
  $newBase = "https://$func.azurewebsites.net/api"
  (Get-Content $Html -Raw) -replace "https://[a-z0-9-]+\.azurewebsites\.net/api", $newBase |
    Set-Content $Html -NoNewline
  Copy-Item $Html "云南/index.html" -Force
  Write-Host "Frontend API_BASE updated to $newBase and synced to index.html" -ForegroundColor Yellow
  Write-Host "NEXT: deploy the frontend -> /deploy-travel-app (or deploy.ps1 -Scope frontend)" -ForegroundColor Yellow

  Test-Api $func
}
else {
  Write-Host "`n=== UPDATE existing environment ===" -ForegroundColor Green
  $func = Get-FunctionAppName
  Write-Host "Target Function App: $func  (RG=$ResourceGroup)"
  Set-AppSettings $func $ResourceGroup
  Set-Cors $func $ResourceGroup
  Publish-Code $func
  Test-Api $func
}

Write-Host "`nDone." -ForegroundColor Green
