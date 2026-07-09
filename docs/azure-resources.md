# 后端 Azure 资源说明

本项目后端由一组 Azure 资源组成，全部位于 **East Asia**，属于个人订阅
**Visual Studio Enterprise Subscription**（`765e1ed7-a890-4d1d-86a3-a7116c7c7250`）。

> 一键创建/更新请用 skill：[`/provision-travel-backend`](../.github/skills/provision-travel-backend/SKILL.md)

---

## 资源清单

| # | 资源 | 类型 (ARM) | 名称（当前环境） | SKU / 配置 | 作用 |
|---|------|-----------|-----------------|-----------|------|
| 1 | 资源组 | `Microsoft.Resources/resourceGroups` | `rg-yn-travel` | 位置 `eastasia` | 统一管理所有资源 |
| 2 | 存储账户 | `Microsoft.Storage/storageAccounts` | `stynue8266` | `Standard_LRS`，启用公开 Blob 访问 | ① Functions 运行时存储 ② Table 存清单 ③ Blob 存图片 |
| 3 | Table | `.../storageAccounts/tableServices/tables` | `checklist` | — | 清单状态（首次调用自动创建） |
| 4 | Blob 容器 | `.../storageAccounts/blobServices/containers` | `proofs` | 公开只读（blob） | 图片凭证（首次上传自动创建） |
| 5 | 函数应用 | `Microsoft.Web/sites` (kind `functionapp,linux`) | `func-yntravel-ue8266` | Linux · **消费计划** · Node 22 · Functions v4 | 承载 API |
| 6 | 消费计划 | `Microsoft.Web/serverfarms` | 自动生成（`ASP-*`） | Dynamic (Y1) | Functions 的按量计费宿主 |

> `ue8266` 是创建时生成的 6 位随机后缀，保证存储账户名与函数应用名全局唯一。
> 在新环境部署会生成新的后缀（见 skill）。

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
