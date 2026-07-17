---
name: deploy-travel-app
description: 'Deploy the latest Travel app code — publish the static frontend and/or the Azure Functions API. USE WHEN: "deploy travel app", "publish the travel page", "push my changes live", "deploy the checklist", "update the function app", "publish backend", "ship the travel site", "redeploy api". Handles git commit+push, Azure Functions backend deployment, and Azure App Service static frontend deployment.'
argument-hint: 'Optional: "frontend" | "backend" | "all" (default all)'
---

# Deploy Travel App

Publishes the latest code for the Travel project:
- **Frontend** → Azure App Service static site (`yntravel-site-ue8266`) and/or GitHub Pages
- **Backend** → Azure Functions (`api/`, `func-yntravel-ue8266`)

## When to Use
- After editing `云南/旅游计划.html` and wanting it live.
- After changing backend code in `api/src/functions/`.
- User says "deploy", "publish", "push live", "ship it", "redeploy".

## Prerequisites (verify, don't assume)
- Run from repo root `Travel/`.
- `git` remote `origin` points to the GitHub repo (Pages enabled on `main` / root).
- `az login` is active for the subscription that owns `rg-yn-travel`.
   - Expected current production subscription: `Visual Studio Enterprise Subscription` (`765e1ed7-a890-4d1d-86a3-a7116c7c7250`).
   - Verify with `az account show` and `az group exists -n rg-yn-travel` (must return `true`).
- Target backend Function App is derived from `app/js/config.js` / `云南/js/config.js` `API_BASE`
   (currently `func-yntravel-ue8266`).
- Target Azure static frontend Web App is `yntravel-site-ue8266` in `rg-yn-travel`.

## Scope
Default is **all**. If the user says only "frontend" or "backend", do just that part.

## Procedure

### Mandatory pre-deployment test gate
Run this before **every** deployment, including frontend-only, backend-only, and all scopes:

```powershell
Push-Location api
npm test
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Chat regression cases failed. Deployment stopped." }
Pop-Location
```

All cases under `api/test/`, including the readable 小白熊行程助手 cases in `api/test/chat-cases/`, must pass. These cases verify tool-based add/update/delete execution, read-only trip-context answers, ordinary conversation, and accidental-write prevention. Never commit, push, or deploy when this command fails. Fix the regression and rerun the complete suite first. The bundled deployment script enforces this gate automatically.

### A. Frontend (GitHub Pages)
1. Ensure the served copy matches the source:
   ```powershell
   Copy-Item "云南/旅游计划.html" "云南/index.html" -Force
   ```
2. Commit and push:
   ```powershell
   git add -A
   git commit -m "Update travel app"
   git push origin main
   ```
3. GitHub Pages rebuilds in ~1 min. Live URL: `https://<user>.github.io/<repo>/`.
   Confirm by fetching the page and checking it returns HTTP 200.

### B. Backend (Azure Functions)
1. Confirm login & target:
   ```powershell
   az account show --query "{user:user.name, sub:name, id:id}" -o json
   az group exists -n rg-yn-travel
   az functionapp show -g rg-yn-travel -n func-yntravel-ue8266 --query "{name:name,state:state,host:defaultHostName}" -o json
   ```
   If `az group exists` returns `Forbidden` or `false`, stop and ask the user to log in with the personal account/subscription that owns the resources. Do not deploy to a different subscription.
2. Record a data baseline before deploying (do not skip):
   ```powershell
   $trip = Invoke-RestMethod "https://func-yntravel-ue8266.azurewebsites.net/api/trips/yunnan2026" -TimeoutSec 120
   [pscustomobject]@{
     sections = $trip.trip.sections.Count
     checklist = $trip.trip.checklist.Count
     packing = $trip.trip.packing.Count
   } | ConvertTo-Json -Compress
   ```
3. Validate code:
   ```powershell
   Push-Location api
   npm test
   if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Chat regression cases failed. Deployment stopped." }
   Pop-Location
   node --check api\src\functions\trips.js
   node --check app\js\chat.js
   node --check app\js\api.js
   node --check app\js\structure.js
   node --check app\js\render.js
   git diff --check -- api\src\functions\trips.js app\js\api.js app\js\chat.js app\js\structure.js app\js\render.js app\css\styles.css
   ```
4. Preferred publish path on this repo: self-contained zip with Linux-style paths.

   Use this when `func` is missing/broken or npm global install fails. This avoids Azure Functions Core Tools and avoids Windows backslash paths inside the zip.

   ```powershell
   # Install backend dependencies locally from the public npm registry if api/node_modules is absent.
   Push-Location api
   npm install --omit=dev --registry=https://registry.npmjs.org
   Pop-Location

   # Build a clean package directory.
   Remove-Item -Recurse -Force .deploy-api -ErrorAction SilentlyContinue
   New-Item -ItemType Directory -Force .deploy-api | Out-Null
   Copy-Item api\host.json .deploy-api\host.json
   Copy-Item api\package.json .deploy-api\package.json
   Copy-Item api\package-lock.json .deploy-api\package-lock.json
   Copy-Item -Recurse api\src .deploy-api\src
   Copy-Item -Recurse api\node_modules .deploy-api\node_modules

   # Create zip with '/' paths, not Windows '\\' paths. Linux Functions may index 0 functions with backslash entries.
   $zip = "api-linuxpaths-" + (Get-Date -Format "yyyyMMddHHmmss") + ".zip"
   Add-Type -AssemblyName System.IO.Compression
   Add-Type -AssemblyName System.IO.Compression.FileSystem
   $source = (Resolve-Path .deploy-api).Path
   $zipPath = Join-Path (Get-Location) $zip
   $archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
   try {
     Get-ChildItem -Path $source -Recurse -File | ForEach-Object {
      $relative = $_.FullName.Substring($source.Length).TrimStart([char]92,[char]47)
      $entryName = $relative.Replace([char]92,[char]47)
       [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
     }
   } finally { $archive.Dispose() }

   # Sanity check zip root entries.
   $entries = [System.IO.Compression.ZipFile]::OpenRead($zipPath).Entries.FullName
   @('host.json','package.json','src/functions/trips.js','node_modules/@azure/functions/package.json') | ForEach-Object {
     [pscustomobject]@{ Entry = $_; Exists = $entries -contains $_ }
   } | Format-Table -AutoSize

   # Deploy. Do not use remote build for this self-contained package.
   az functionapp config appsettings delete -g rg-yn-travel -n func-yntravel-ue8266 --setting-names SCM_DO_BUILD_DURING_DEPLOYMENT ENABLE_ORYX_BUILD --output none
   az functionapp deployment source config-zip -g rg-yn-travel -n func-yntravel-ue8266 --src $zip --build-remote false --timeout 900
   az functionapp restart -g rg-yn-travel -n func-yntravel-ue8266
   ```

   `func azure functionapp publish func-yntravel-ue8266` is still acceptable if `func` is installed and working, but it is not required.

5. Validate backend deployment:
   ```powershell
   Invoke-RestMethod "https://<FUNCTION_APP_NAME>.azurewebsites.net/api/state" -TimeoutSec 90
   Invoke-RestMethod "https://func-yntravel-ue8266.azurewebsites.net/api/trips/yunnan2026" -TimeoutSec 120
   az functionapp function list -g rg-yn-travel -n func-yntravel-ue8266 --query "[].name" -o table
   ```
   For the tool-confirmed chat backend, `executeTripTools` must appear in the function list. If `/api/*` returns 404 but management still lists functions, query host admin status and loaded functions:
   ```powershell
   $keys = az functionapp keys list -g rg-yn-travel -n func-yntravel-ue8266 | ConvertFrom-Json
   $key = $keys.masterKey; if (-not $key) { $key = $keys.functionKeys.default }
   Invoke-RestMethod -Headers @{ 'x-functions-key' = $key } -Uri "https://func-yntravel-ue8266.azurewebsites.net/admin/functions" -TimeoutSec 120
   ```
   If this returns `Count: 0`, check the deployment zip path separators and redeploy with the Linux-path zip method above.

6. Optional backend behavior smoke test without executing writes:
   ```powershell
   $tripResp = Invoke-RestMethod "https://func-yntravel-ue8266.azurewebsites.net/api/trips/yunnan2026" -TimeoutSec 120
   $body = @{ trip = $tripResp.trip; messages = @(@{ role='user'; content='不需要带车载手机支架' }) } | ConvertTo-Json -Depth 100
   $resp = Invoke-RestMethod "https://func-yntravel-ue8266.azurewebsites.net/api/trips/yunnan2026/chat" -Method POST -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
   $resp.toolCalls | Select-Object action,@{n='operation';e={$_.args.operation}},@{n='name';e={$_.args.name}}
   ```
   This calls `/chat` only. It does not execute `/tools/execute`, so it should not modify data.

### C. Azure App Service Frontend (`yntravel-site-ue8266`)
Use this for the Azure-hosted frontend at `https://yntravel-site-ue8266.azurewebsites.net`.

`az webapp deploy --type zip` and `az webapp deployment source config-zip` may trigger Oryx build and fail for this static PHP/nginx site. The reliable path is per-file static deployment for changed files:

```powershell
$files = @(
  'app/css/styles.css',
  'app/js/api.js',
  'app/js/chat.js',
  'app/js/render.js',
  'app/js/structure.js'
)
foreach ($file in $files) {
  az webapp deploy -g rg-yn-travel -n yntravel-site-ue8266 --src-path $file --type static --target-path $file --restart false --track-status false --timeout 300000
}
az webapp restart -g rg-yn-travel -n yntravel-site-ue8266
```

Verify a deployed changed file with a cache buster:
```powershell
$resp = Invoke-WebRequest -UseBasicParsing "https://yntravel-site-ue8266.azurewebsites.net/app/js/chat.js?cb=$(Get-Date -Format yyyyMMddHHmmss)" -TimeoutSec 120
[pscustomobject]@{
  status = $resp.StatusCode
  hasToolMsg = $resp.Content.Contains('tool-msg')
  hasConfirmTools = $resp.Content.Contains('confirmTools')
  hasExecuteTripTools = $resp.Content.Contains('executeTripTools')
} | ConvertTo-Json -Compress
```

### One-shot helper
The bundled script does both parts with checks and a smoke test:
```powershell
./.github/skills/deploy-travel-app/scripts/deploy.ps1 -Scope all
```
See [deploy.ps1](./scripts/deploy.ps1). Pass `-Scope frontend` or `-Scope backend` to limit.

## Validation Checklist
- [ ] Mandatory `npm test` gate passed, including all `api/test/chat-cases/` cases.
- [ ] `云南/index.html` is byte-identical to `云南/旅游计划.html`.
- [ ] `git push` succeeded (no rejected/non-fast-forward).
- [ ] Pages URL returns 200 and shows the new content.
- [ ] Azure CLI is on the correct subscription and `az group exists -n rg-yn-travel` returns `true`.
- [ ] Backend deployment did not delete data: `GET /api/trips/yunnan2026` returns expected `sections/checklist/packing` counts.
- [ ] Function list includes `executeTripTools` when tool-confirmed chat changes are deployed.
- [ ] `GET /api/state` and `GET /api/trips/yunnan2026` return JSON after backend deployment.
- [ ] Azure App Service frontend serves the updated changed JS/CSS (use cache-busted URL).

## Notes / Pitfalls
- Do **not** commit `api/node_modules` or `api/local.settings.json` (already gitignored).
- Do **not** commit deployment artifacts: `.deploy-api/`, `.deploy-site/`, `api-*.zip`, `.deploy-site.zip`, `deployed-package*.zip`, `function-appsettings.json`.
- If `func` is missing/broken, prefer the Linux-path self-contained zip method above instead of fighting global `azure-functions-core-tools` install.
- On Windows, `Compress-Archive` can create zip entries with backslashes. A Linux Function App may mount that package but index **0 functions**. Use the .NET ZipFile method above to force `/` entry names.
- If public `/api/*` routes return 404 after deployment, check loaded functions via `/admin/functions`; if `Count` is 0, suspect package path/build issues, not data loss.
- Kudu/SCM API requests can redirect to an HTML sign-in page even when `az` commands work. Prefer Azure CLI deployment commands unless direct Kudu access is necessary.
- For the Azure App Service frontend, full zip deploy may trigger Oryx build and fail. Use `az webapp deploy --type static --target-path <same path>` for changed static files.
- If push is rejected, `git pull --rebase origin main` then push again.
- If you changed the Function App name, update `API_BASE` in both `app/js/config.js` and `云南/js/config.js`, then deploy frontend too.
- Always clean local deployment artifacts before committing.
