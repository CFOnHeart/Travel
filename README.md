# Travel · 云南之旅

个人旅行计划页面，采用 **静态前端（GitHub Pages）+ 轻量云端后端（Azure Functions + Storage）** 架构。
清单支持多人实时协作：勾选完成、填写完成人、上传图片凭证或文字说明，数据同步到云端。

- 🌐 在线地址：https://cfonheart.github.io/Travel/
- 📄 PDF 版：[云南/旅游计划.pdf](云南/旅游计划.pdf)
- ☁️ 资源清单与创建说明：[docs/azure-resources.md](docs/azure-resources.md)

---

## 目录结构

```
Travel/
├── index.html                 # 根跳转页 → 云南/
├── 云南/
│   ├── index.html             # GitHub Pages 首页（旅游计划.html 的副本）
│   ├── 旅游计划.html          # 页面源文件（编辑这个，再同步到 index.html）
│   ├── 旅游计划.pdf           # 导出的 PDF 快照
│   └── images/                # 酒店等图片
├── api/                       # 后端 Azure Functions（Node v4）
│   ├── host.json
│   ├── package.json
│   ├── .funcignore
│   ├── local.settings.json    # 本地配置（已 gitignore）
│   └── src/functions/
│       ├── state.js           # GET/POST /api/state
│       └── upload.js          # POST /api/upload
├── docs/
│   └── azure-resources.md     # 后端资源创建文档
├── .github/skills/            # 自动化 skill
│   ├── deploy-travel-app/     # 部署新代码
│   └── provision-travel-backend/  # 创建/更新云端资源
└── README.md
```

---

## 一、前端（GitHub Pages）

### 技术
- 纯 **HTML + CSS + 原生 JavaScript**，无框架、无构建步骤。
- 响应式布局：宽屏左侧固定清单栏，窄屏用 `☰` 折叠。
- 右侧为行程正文（航班、酒店、时间轴、费用表）。

### 交互清单（左侧栏）
| 功能 | 说明 |
|------|------|
| 勾选完成 | 点击方框切换完成状态，顶部进度条实时更新 |
| 完成人 | 每项下方输入框，停顿 0.6s 后自动保存 |
| 附件 | 📎 打开弹窗，可填写文字说明、上传图片凭证（上传前用 canvas 压缩到 ≤1000px） |
| 图片放大 | 点击缩略图全屏查看 |
| 🔄 刷新 | 手动从云端拉取最新；切回标签页 / 每 30s 也会自动同步 |

### 数据流
1. 页面加载 → 先用 `localStorage` 缓存渲染 → 再 `GET /api/state` 拉云端覆盖。
2. 任意改动 → 立即本地渲染 + `POST /api/state` 写云端（附图先 `POST /api/upload` 换成 URL）。
3. 断网时自动回退到本地缓存，状态栏显示"离线"。

### 关键配置
- 后端地址写在 [云南/旅游计划.html](云南/旅游计划.html) 脚本顶部：
  ```js
  const API_BASE = 'https://func-yntravel-ue8266.azurewebsites.net/api';
  ```
- 清单条目在同一段脚本的 `GROUPS` 数组里定义（`id` 为唯一键，不要随意改动已有 id）。

### 修改与发布
1. 编辑 `云南/旅游计划.html`。
2. 复制成首页：`Copy-Item "云南/旅游计划.html" "云南/index.html" -Force`
3. 提交推送：`git add -A; git commit -m "..."; git push`，GitHub Pages 自动更新（约 1 分钟）。

> 也可以直接用 skill：`/deploy-travel-app`，见下文。

---

## 二、后端（Azure Functions + Storage）

### 技术
- **Azure Functions**（Node 22，v4 编程模型，Linux 消费计划）。
- **Azure Table Storage** 存清单状态；**Azure Blob Storage** 存图片。
- 通过 **CORS** 只允许 GitHub Pages 域名调用。

### API
| 方法 | 路由 | 作用 | 请求体 | 返回 |
|------|------|------|--------|------|
| GET | `/api/state` | 读取全部清单 | — | `{ items: { [id]: {done,who,note,img} } }` |
| POST | `/api/state` | 写入/更新一项 | `{ id, done, who, note, img }` | `{ ok: true }` |
| POST | `/api/upload` | 上传图片 | `{ id, dataUrl }` | `{ url }` |

### 数据模型
- Table `checklist`：`PartitionKey = "yn"`，`RowKey = 条目 id`，字段 `done/who/note/img`。
- Blob 容器 `proofs`：公开只读，图片文件名 `{id}-{timestamp}.jpg`。

### 本地运行
```powershell
cd api
npm install
func start           # 需要 Azurite 或在 local.settings.json 配置 AzureWebJobsStorage 连接串
```

### 部署
```powershell
cd api
func azure functionapp publish func-yntravel-ue8266
```

> 也可以直接用 skill：`/deploy-travel-app`。

---

## 三、常用命令速查

```powershell
# 前端本地预览（任意静态服务器）
npx serve 云南

# 后端发布
cd api; func azure functionapp publish func-yntravel-ue8266

# 测试 API
Invoke-RestMethod "https://func-yntravel-ue8266.azurewebsites.net/api/state"

# 查看云端资源
az resource list -g rg-yn-travel -o table
```

---

## 四、自动化 Skills

| Skill | 用途 |
|-------|------|
| [`/deploy-travel-app`](.github/skills/deploy-travel-app/SKILL.md) | 一键部署最新前端（GitHub Pages）+ 后端（Function App） |
| [`/provision-travel-backend`](.github/skills/provision-travel-backend/SKILL.md) | 在**新环境**创建全部 Azure 资源，或在**旧环境**更新配置并重新部署 |

---

## 成本
消费计划 Functions（每月百万次免费额度）+ Standard LRS 存储，低流量下约 **¥0–1/月**。
