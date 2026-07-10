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
│   ├── 旅游计划.html          # 页面标记（仅 HTML 结构，引用 css/ 与 js/）
│   ├── 旅游计划.pdf           # 导出的 PDF 快照
│   ├── css/
│   │   └── styles.css         # 全部样式
│   ├── js/                    # ES Modules（职责单一）
│   │   ├── config.js          # API 地址、常量、参数
│   │   ├── data.js            # GROUPS / PACKING 清单数据
│   │   ├── utils.js           # DOM / 转义 / 格式化 / 图片压缩
│   │   ├── api.js             # 云端 API 封装
│   │   ├── store.js           # 本地状态 + localStorage
│   │   ├── status.js          # 同步状态提示
│   │   ├── lightbox.js        # 图片放大
│   │   ├── attachmentModal.js # 附件弹窗
│   │   ├── checklist.js       # 清单渲染 + 同步
│   │   ├── expenses.js        # 花销看板 + 记账弹窗
│   │   ├── tabs.js            # Tab 切换 / 菜单按钮
│   │   └── main.js            # 入口：初始化与编排
│   └── images/                # 酒店、头像（man.png / woman.png）等图片
├── api/                       # 后端 Azure Functions（Node v4）
│   ├── host.json
│   ├── package.json
│   ├── .funcignore
│   ├── local.settings.json    # 本地配置（已 gitignore）
│   └── src/functions/
│       ├── state.js           # GET/POST /api/state
│       ├── upload.js          # POST /api/upload
│       └── expenses.js        # GET/POST/DELETE /api/expenses
├── docs/
│   └── azure-resources.md     # 后端资源创建文档
├── .github/
│   ├── hooks/                 # 文档同步检查 hook
│   └── skills/                # 自动化 skill
│       ├── deploy-travel-app/     # 部署新代码
│       └── provision-travel-backend/  # 创建/更新云端资源
└── README.md
```

---

## 一、前端（GitHub Pages）

### 技术
- 纯 **HTML + CSS + 原生 JavaScript（ES Modules）**，无框架、无构建步骤。
- 代码分层：`旅游计划.html` 只管结构；`css/styles.css` 管样式；`js/*.js` 按职责拆成 12 个模块（见目录结构）。
- 依赖方向：`config/data/utils`（叶子）→ `api/store/status`（中间）→ `checklist/expenses/tabs`（视图）→ `main`（编排），无循环依赖。
- 响应式布局：宽屏左侧固定侧栏，窄屏用 `☰` 折叠。
- **左侧栏双 Tab**：📋 预定清单 / 🎒 出行物品。
- **主内容区双 Tab**：🗺️ 行程（航班、酒店、时间轴、费用表） / 💰 花销（4 人共享时间轴）。

### 交互功能
| 区域 | 功能 | 说明 |
|------|------|------|
| 预定清单 | 勾选完成 | 点击方框切换状态，进度条实时更新 |
| 预定清单 | 完成人 | 每项输入框，停顿 0.6s 自动保存 |
| 预定清单 | 附件 | 📎 弹窗填文字说明、上传图片凭证（canvas 压缩到 ≤1000px），点缩略图全屏 |
| 出行物品 | 勾选准备 | 按路线/季节整理的行李清单，仅勾选（无完成人） |
| 花销 | 记一笔 | 每人「＋ 添加」→ 金额/说明/时间（默认当前，可用日期组件改） |
| 花销 | 统一时间轴 | 4 人共享一条从最早到最晚的时间轴，按时间比例定位，横向对比先后 |
| 花销 | 头像 | 人名前显示 `images/man.png` / `woman.png` |
| 通用 | 🔄 刷新 | 手动云端同步；切回标签页 / 每 30s 自动同步 |

### 数据流
1. 页面加载 → 先用 `localStorage` 缓存渲染 → 再 `GET /api/state` 拉云端覆盖；切到花销 Tab 时 `GET /api/expenses`。
2. 清单改动 → 本地渲染 + `POST /api/state`（附图先 `POST /api/upload` 换成 URL）。
3. 花销改动 → `POST /api/expenses` 新增 / `DELETE /api/expenses/{id}` 删除。
4. 断网时自动回退到本地缓存，状态栏显示"离线"。

### 关键配置
- 后端地址写在 [云南/js/config.js](云南/js/config.js) 顶部：
  ```js
  export const API_BASE = 'https://func-yntravel-ue8266.azurewebsites.net/api';
  ```
- 预定清单与出行物品在 [云南/js/data.js](云南/js/data.js) 的 `GROUPS` / `PACKING`；花销人物与头像在 `config.js` 的 `PEOPLE` / `PERSON_ICON`（`id` 为唯一键，不要随意改动已有 id）。

### 修改与发布
1. 按需编辑 `云南/旅游计划.html`（结构）、`云南/css/styles.css`（样式）或 `云南/js/*.js`（逻辑/数据）。
2. 本地预览：**ES 模块不能用 `file://` 直接双击打开**，请用本地服务器：
   ```powershell
   python -m http.server 3000 -d 云南   # 然后访问 http://localhost:3000/旅游计划.html
   ```
   （`http://localhost:3000` 已在后端 CORS 白名单中，本地也能联调云端）。
3. 同步为首页：`Copy-Item "云南/旅游计划.html" "云南/index.html" -Force`
4. 提交推送：`git add -A; git commit -m "..."; git push`，GitHub Pages（https）自动更新（约 1 分钟）。

> 也可以直接用 skill：`/deploy-travel-app`，见下文。

---

## 二、后端（Azure Functions + Storage）

### 技术
- **Azure Functions**（Node 22，v4 编程模型，Linux 消费计划）。
- **Azure Table Storage** 存清单状态与花销；**Azure Blob Storage** 存图片。
- 通过 **CORS** 只允许 GitHub Pages 域名调用。

### API
| 方法 | 路由 | 作用 | 请求体 | 返回 |
|------|------|------|--------|------|
| GET | `/api/state` | 读取全部清单 | — | `{ items: { [id]: {done,who,note,img} } }` |
| POST | `/api/state` | 写入/更新一项 | `{ id, done, who, note, img }` | `{ ok: true }` |
| POST | `/api/upload` | 上传图片 | `{ id, dataUrl }` | `{ url }` |
| GET | `/api/expenses` | 读取全部花销 | — | `{ items: [ {id,person,amount,note,time} ] }` |
| POST | `/api/expenses` | 新增/更新一笔 | `{ id?, person, amount, note, time }` | `{ id }` |
| DELETE | `/api/expenses/{id}` | 删除一笔 | — | `{ ok: true }` |

### 数据模型
- Table `checklist`：`PartitionKey = "yn"`，`RowKey = 条目 id`，字段 `done/who/note/img`。
- Table `expenses`：`PartitionKey = "yn"`，`RowKey = 花销 id`，字段 `person/amount/note/time`。
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

### 文档同步 Hook
`Stop` 生命周期钩子 [.github/hooks/docs-sync-check.json](.github/hooks/docs-sync-check.json)（脚本 [check-docs-sync.ps1](.github/hooks/check-docs-sync.ps1)）在**每次 AI 回答结束后**运行：
若检测到 `api/`、前端页面或 skill 脚本有未提交改动、但 `README.md` / `docs/` / `SKILL.md` 未同步，会注入提醒，
指示助手**先询问用户是否需要更新相关文档，并在用户明确确认前不自动修改**；用户确认后才执行更新。无相关改动时静默。

---

## 成本
消费计划 Functions（每月百万次免费额度）+ Standard LRS 存储，低流量下约 **¥0–1/月**。
