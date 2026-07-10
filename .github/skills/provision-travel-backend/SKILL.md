---
name: provision-travel-backend
description: 'Provision or update the Travel app''s Azure backend (Functions + Storage). USE WHEN: "create the backend resources", "set up azure for travel", "provision travel backend", "deploy to a new environment", "recreate the resources", "spin up the api in a new subscription", "update the backend resources", "sync cloud resources", "re-provision", "move backend to another region". Creates a resource group, Storage account (Table+Blob), and Function App with CORS in a NEW environment, or updates settings/CORS and redeploys code in an EXISTING one.'
argument-hint: 'Optional: "new" | "update" and region (default eastasia)'
---

# Provision / Update Travel Backend

Creates the full Azure backend from scratch (**new** environment) or reconciles an
existing one (**update**): resource group, Storage account (Table + Blob), Function App
(Node 22, consumption), CORS, app settings, and code deploy.

## When to Use
- Standing up the backend in a **new subscription / region / clean environment**.
- **Updating** an existing environment: refresh CORS, app settings, or redeploy latest code.
- Recovering after accidental deletion.

## Modes
| Mode | What it does |
|------|--------------|
| `new` | Generates a unique 6-char suffix, creates RG + Storage + Function App, sets CORS + app settings, deploys code, and **updates `API_BASE` in `云南/js/config.js`**. |
| `update` | Uses the existing Function App (from `API_BASE`), re-applies CORS + app settings, and redeploys code. Does not recreate resources. |

Ask the user which mode if unclear. Default region: `eastasia`.

## Prerequisites
- `az login` active. Confirm subscription:
  ```powershell
  az account show --query "{user:user.name, sub:name, id:id}" -o json
  ```
  If the wrong subscription, `az account set --subscription "<id>"`.
- `func` (Core Tools v4) and `node` installed.
- The GitHub Pages origin for CORS (e.g. `https://cfonheart.github.io`).

## Fixed parameters (keep consistent with the app)
- Runtime: **Node 22**, Functions **v4**, **Linux consumption** plan.
- Storage: `Standard_LRS`, `--allow-blob-public-access true`.
- App setting: `AzureWebJobsFeatureFlags=EnableWorkerIndexing`.
- Tables `checklist` and `expenses`, and Blob container `proofs`, are **auto-created by the code** on first use — no manual step.

## Procedure

Use the bundled script (recommended), which is idempotent and handles both modes:

```powershell
# New environment (creates everything, unique names)
./.github/skills/provision-travel-backend/scripts/provision.ps1 -Mode new -Location eastasia -PagesOrigin "https://cfonheart.github.io"

# Update existing environment (reconcile + redeploy)
./.github/skills/provision-travel-backend/scripts/provision.ps1 -Mode update -PagesOrigin "https://cfonheart.github.io"
```

See [provision.ps1](./scripts/provision.ps1).

### What the script does (new mode)
1. Register providers `Microsoft.Web`, `Microsoft.Storage`.
2. Create resource group `rg-yn-travel` (or `-ResourceGroup` override).
3. Create Storage account `styn<suffix>` (Standard_LRS, public blob).
4. Create Function App `func-yntravel-<suffix>` (Linux, consumption, Node 22, v4).
5. Set `AzureWebJobsFeatureFlags` and add CORS origins.
6. `func azure functionapp publish` from `api/`.
7. Rewrite `API_BASE` in `云南/js/config.js`.
8. Smoke-test `GET /api/state`.

### What the script does (update mode)
1. Read Function App name from `API_BASE`.
2. Re-apply app setting + CORS (idempotent).
3. Redeploy code and smoke-test.

## After running (new mode)
The frontend `API_BASE` changed, so **deploy the frontend** to publish it:
```powershell
./.github/skills/deploy-travel-app/scripts/deploy.ps1 -Scope frontend
```
(or run `/deploy-travel-app`).

## Validation Checklist
- [ ] `az resource list -g <rg> -o table` shows storage account + function app + plan.
- [ ] `GET https://<func>.azurewebsites.net/api/state` returns `{ items: {...} }`.
- [ ] CORS includes the Pages origin: `az functionapp cors show -n <func> -g <rg>`.
- [ ] (new mode) `API_BASE` in the HTML points to the new function app.

## Pitfalls
- **Node version**: the CLI rejects EOL runtimes; the script pins Node 22. If it errors, bump to the newest LTS the CLI accepts.
- **Name uniqueness**: storage (≤24 lowercase alnum) and function app names must be globally unique — the random suffix handles this.
- **Public blob access**: required so image URLs work; the script sets it at creation.
- **First `/api/state` call**: cold start can take up to ~1 min; use a generous timeout.
- **Don't** forget to redeploy the frontend after `new` mode (API_BASE changed).
