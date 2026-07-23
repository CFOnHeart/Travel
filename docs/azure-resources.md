# 后端 Azure 资源说明

本项目的 Azure 资源（**后端** Functions + Storage，以及**前端托管** App Service）全部位于 **East Asia**，属于个人订阅
**Visual Studio Enterprise Subscription**（`765e1ed7-a890-4d1d-86a3-a7116c7c7250`）。

> 一键创建/更新请用 skill：[`/provision-travel-backend`](../.github/skills/provision-travel-backend/SKILL.md)

## 环境隔离

| 环境 | 资源组 | Storage | API | 前端 |
|---|---|---|---|---|
| Production | `rg-yn-travel` | `stynue8266` | `func-yntravel-ue8266` | GitHub Pages / `yntravel-site-ue8266` |
| Local | `rg-yn-travel-local` | `stynlocal2zf050` | `http://localhost:7071/api` | `http://localhost:5173` |

Local 环境没有 Function App、App Service 或 Web 计算计划。`.tmp-local-dev-server.mjs` 通过被 Git 忽略的 `.storage_local` 直接访问 Local Storage；浏览器标题显示 `[Local]`。非秘密资源名保存在 `config/environments/prod.json` 和 `local.json`，任何本地写入都不得回退到 Production Storage。

Local 与 Production Storage 均使用独立的 `expenseAnalysis` Table 保存 AI 消费分类；分类不嵌入 `trips.data`。Local Storage 另外初始化 `trips`、`ratelimit`、`checklist`、`expenses` Tables 和 `proofs` Blob 容器。Local `yunnan2026` 是从 Production 的隔离测试副本 `yunnan2026-localtest` 单向复制而来；源记录保留作回滚，不移动、不删除。

---

## 资源清单

| # | 资源 | 类型 (ARM) | 名称（当前环境） | SKU / 配置 | 作用 |
|---|------|-----------|-----------------|-----------|------|
| 1 | 资源组 | `Microsoft.Resources/resourceGroups` | `rg-yn-travel` | 位置 `eastasia` | 统一管理所有资源 |
| 2 | 存储账户 | `Microsoft.Storage/storageAccounts` | `stynue8266` | `Standard_LRS`，启用公开 Blob 访问 | ① Functions 运行时存储 ② Table 存清单 ③ Blob 存图片 |
| 3 | Table | `.../storageAccounts/tableServices/tables` | `checklist` | — | 清单状态（首次调用自动创建） |
| 4 | Table | `.../storageAccounts/tableServices/tables` | `expenses` | — | `云南/` 手写页面的旧版独立花销记录（首次调用自动创建） |
| 5 | Blob 容器 | `.../storageAccounts/blobServices/containers` | `proofs` | 公开只读（blob） | 图片凭证（首次上传自动创建） |
| 6 | 函数应用 | `Microsoft.Web/sites` (kind `functionapp,linux`) | `func-yntravel-ue8266` | Linux · **消费计划** · Node 22 · Functions v4 | 承载 API |
| 7 | 消费计划 | `Microsoft.Web/serverfarms` | `EastAsiaLinuxDynamicPlan` | Dynamic (Y1) | Functions 的按量计费宿主 |
| 8 | Table | `.../storageAccounts/tableServices/tables` | `trips` | — | 多租户「行程生成平台」的整份行程 Schema，包含平台 `people[]` / `expenses[]` 分摊账本（首次调用自动创建） |
| 9 | Table | `.../storageAccounts/tableServices/tables` | `ratelimit` | — | 生成/聊天接口的限流计数（首次调用自动创建） |
| 10 | App Service 计划 | `Microsoft.Web/serverfarms` | `asp-yntravel-web` | **Linux · B1（付费）** | 托管前端静态站的计算宿主 |
| 11 | Web App | `Microsoft.Web/sites` (kind `app,linux`) | `yntravel-site-ue8266` | PHP 8.2（nginx）· 仅 HTTPS | **前端静态托管**（国内可访问，绕开 github.io 被重置） |

> `ue8266` 是创建时生成的 6 位随机后缀，保证存储账户名与函数应用名全局唯一。
> 在新环境部署会生成新的后缀（见 skill）。

### 两套花销存储不要混用

- `云南/` 手写页面调用 `/api/expenses`，使用独立的 `expenses` Table，记录结构为 `person/amount/note/time`。
- `app/` 多行程平台把花销存入 `trips.data` 中的 `trip.expenses[]`，通过 `/api/trips/{id}` 读取并通过 `/save` 或确认后的 `/tools/execute` 保存。
- 平台记录支持 `payerId`、`participantIds`、`splitMode` 和 `allocations`，不要用旧版 `/api/expenses` 对其读写。
- 平台分摊账本的数据结构和兼容规则见 [expense-ledger.md](expense-ledger.md)。

---

## 关键设置

### 函数应用 App Settings
| 键 | 值 | 说明 |
|----|----|------|
| `AzureWebJobsStorage` | （自动，指向存储账户连接串） | 后端用它访问 Table/Blob |
| `FUNCTIONS_WORKER_RUNTIME` | `node` | 运行时 |
| `AzureWebJobsFeatureFlags` | `EnableWorkerIndexing` | v4 编程模型必需 |

### CORS 允许来源
- `https://cfonheart.github.io`（GitHub Pages 前端）
- `http://localhost:3000`（本地开发）
- `https://yntravel-site-ue8266.azurewebsites.net` / `http://...`（Azure App Service 前端）

### 前端托管 App Service（B1）
为解决 `github.io` 在中国大陆常被连接重置（`ERR_CONNECTION_RESET`），前端另外托管到 App Service（`azurewebsites.net` 国内可访问性更好）。

> ⚠️ App Service 的 **PHP 8.2 Linux 镜像用 nginx（非 Apache），不读 `.htaccess`**。干净路由（如 `/app/trip-collections`）用「目录 + `index.html` + `<base href="/app/">`」实现，而非 rewrite。

```powershell
# B1 Linux 计划 + PHP 静态托管 Web App
az appservice plan create -n asp-yntravel-web -g rg-yn-travel -l eastasia --is-linux --sku B1
az webapp create -n yntravel-site-ue8266 -g rg-yn-travel -p asp-yntravel-web --runtime "PHP:8.2"
az webapp update -n yntravel-site-ue8266 -g rg-yn-travel --https-only true
az functionapp cors add -n func-yntravel-ue8266 -g rg-yn-travel `
  --allowed-origins "https://yntravel-site-ue8266.azurewebsites.net" "http://yntravel-site-ue8266.azurewebsites.net"

# 部署前端（打包 index.html + app + 云南 → zip）。
# 用 .NET ZipFile 而非 Compress-Archive，避免漏掉 .htaccess 等 dotfile。
az webapp deploy -n yntravel-site-ue8266 -g rg-yn-travel --src-path .deploy-site.zip --type zip
```

线上地址：<https://yntravel-site-ue8266.azurewebsites.net>（`/` 跳云南页；`/app/trip-collections/?trip=<ID>` 为收藏路由）。

### 存储账户
- `--allow-blob-public-access true`：让 `proofs` 容器里的图片能通过 URL 直接访问。

---

## 手动创建命令（参考）

以下是本环境实际执行过的命令。**新环境请改用 skill 自动生成唯一名称**。

```powershell
# 变量
$RG   = "rg-yn-travel"
$LOC  = "eastasia"
$SFX  = "ue8266"                       # 新环境请换成随机后缀
$SA   = "styn$SFX"                     # 存储账户，<=24 位小写字母数字
$FUNC = "func-yntravel-$SFX"           # 函数应用，全局唯一
$ORIGIN = "https://cfonheart.github.io"

# 1) 注册 Provider（首次）
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.Storage

# 2) 资源组
az group create -n $RG -l $LOC

# 3) 存储账户（启用公开 Blob 访问）
az storage account create -n $SA -g $RG -l $LOC `
  --sku Standard_LRS --allow-blob-public-access true

# 4) 函数应用（Linux 消费计划 · Node 22 · v4）
az functionapp create -n $FUNC -g $RG --storage-account $SA `
  --consumption-plan-location $LOC `
  --runtime node --runtime-version 22 --functions-version 4 --os-type Linux

# 5) v4 模型开关
az functionapp config appsettings set -n $FUNC -g $RG `
  --settings "AzureWebJobsFeatureFlags=EnableWorkerIndexing"

# 6) CORS
az functionapp cors add -n $FUNC -g $RG `
  --allowed-origins $ORIGIN "http://localhost:3000"

# 7) 发布代码
cd api
func azure functionapp publish $FUNC
```

---

## 部署后需要同步的地方

创建/更换了函数应用名后，**前端里的 `API_BASE` 必须更新**：

```js
// 云南/旅游计划.html
const API_BASE = 'https://<新的 FUNC 名称>.azurewebsites.net/api';
```

改完记得同步 `云南/index.html` 并推送。

---

## 清理（删除全部资源）

```powershell
az group delete -n rg-yn-travel --yes --no-wait
```

删除资源组会一并删除其中的存储账户、函数应用和计划，停止一切计费。
