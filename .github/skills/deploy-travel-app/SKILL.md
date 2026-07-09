---
name: deploy-travel-app
description: 'Deploy the latest Travel app code — publish the frontend to GitHub Pages and/or the backend Azure Functions API. USE WHEN: "deploy travel app", "publish the travel page", "push my changes live", "deploy the checklist", "update the function app", "publish backend", "ship the travel site", "redeploy api". Handles syncing 云南/index.html, git commit+push for GitHub Pages, and func publish for the Azure Functions backend.'
argument-hint: 'Optional: "frontend" | "backend" | "all" (default all)'
---

# Deploy Travel App

Publishes the latest code for the 云南 travel project:
- **Frontend** → GitHub Pages (static HTML)
- **Backend** → Azure Functions (`api/`)

## When to Use
- After editing `云南/旅游计划.html` and wanting it live.
- After changing backend code in `api/src/functions/`.
- User says "deploy", "publish", "push live", "ship it", "redeploy".

## Prerequisites (verify, don't assume)
- Run from repo root `Travel/`.
- `git` remote `origin` points to the GitHub repo (Pages enabled on `main` / root).
- For backend: `az login` is active and `func` (Azure Functions Core Tools v4) is installed.
- Target Function App name is in `云南/旅游计划.html` as `API_BASE`
  (currently `func-yntravel-ue8266`). Derive the app name from that URL.

## Scope
Default is **all**. If the user says only "frontend" or "backend", do just that part.

## Procedure

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
   az account show --query "{user:user.name, sub:name}" -o json
   ```
   Extract the Function App name from `API_BASE` in `云南/旅游计划.html`.
2. Publish:
   ```powershell
   cd api
   func azure functionapp publish <FUNCTION_APP_NAME>
   cd ..
   ```
3. Smoke-test the API:
   ```powershell
   Invoke-RestMethod "https://<FUNCTION_APP_NAME>.azurewebsites.net/api/state" -TimeoutSec 90
   ```
   A JSON `{ items: {...} }` response means success (first call may be a cold start).

### One-shot helper
The bundled script does both parts with checks and a smoke test:
```powershell
./.github/skills/deploy-travel-app/scripts/deploy.ps1 -Scope all
```
See [deploy.ps1](./scripts/deploy.ps1). Pass `-Scope frontend` or `-Scope backend` to limit.

## Validation Checklist
- [ ] `云南/index.html` is byte-identical to `云南/旅游计划.html`.
- [ ] `git push` succeeded (no rejected/non-fast-forward).
- [ ] Pages URL returns 200 and shows the new content.
- [ ] `func publish` listed the 3 functions (getState, putState, upload).
- [ ] `GET /api/state` returns JSON.

## Notes / Pitfalls
- Do **not** commit `api/node_modules` or `api/local.settings.json` (already gitignored).
- If `func` is missing: `npm install -g azure-functions-core-tools@4`.
- If push is rejected, `git pull --rebase origin main` then push again.
- If you changed the Function App name, update `API_BASE` in the HTML first, then deploy frontend too.
