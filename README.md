# Travel · 云南之旅

个人旅行计划平台，采用 **数据驱动的静态前端（`app/`）+ 轻量云端后端（Azure Functions + Storage）** 架构。
首页粘贴行程文本 → 自动生成一页可分享、可勾选的行程记录；清单/花销/照片支持多人实时协作，数据同步到云端。

> 历史遗留说明：仓库早期有一个纯手写的单行程静态页 `云南/`（连同专属后端 `state.js`/`expenses.js`），已于 2026-07-27 完全下线并删除，其数据已迁移为 `app/` 平台的 trip **`yunnan2026`**，仍可正常访问（见下方目录结构与部署方式）。

- 🌐 在线地址：https://cfonheart.github.io/Travel/ （自动跳转到 `app/trip.html?trip=yunnan2026`）
- ☁️ 资源清单与创建说明：[docs/azure-resources.md](docs/azure-resources.md)

---

## 目录结构

```
Travel/
├── index.html                 # 根跳转页 → app/trip.html?trip=yunnan2026
├── app/                        # 数据驱动的多行程平台（唯一前端）
│   ├── index.html              # 首页：粘贴行程文本生成
│   ├── trip.html                # 行程详情页（?trip=<ID>）
│   ├── trip-collections/        # 干净收藏路由（仅 Azure App Service 根路径可用）
│   ├── css/styles.css
│   ├── images/
│   └── js/                      # api/chat/config/editor/photos/render/structure/trip 等模块
├── api/                        # 后端 Azure Functions（Node v4）
│   ├── host.json
│   ├── package.json
│   ├── .funcignore
│   ├── local.settings.json    # 本地配置（已 gitignore）
│   └── src/functions/
│       ├── trips.js           # 行程生成/读取/保存/AI 聊天/工具执行
│       └── upload.js          # POST /api/upload（图片上传，清单附件+照片墙共用）
├── docs/
│   ├── azure-resources.md     # 后端资源创建文档
│   └── expense-ledger.md      # 平台花销、分摊、结算与兼容规则
├── .github/
│   ├── hooks/                 # 文档同步检查 hook
│   └── skills/                # 自动化 skill
│       ├── deploy-travel-app/     # 部署新代码
│       └── provision-travel-backend/  # 创建/更新云端资源
└── README.md
```

---

## 一、常用命令速查

```powershell
# 前端本地预览（任意静态服务器）
npx serve app

# 改动了 Tailwind 工具类后，重新生成 app/css/tailwind.css（编译产物已提交到 git，部署不需要构建步骤）
cd app; npm run build:css

# 后端发布
cd api; func azure functionapp publish func-yntravel-ue8266

# 测试 API（yunnan2026 行程）
Invoke-RestMethod "https://func-yntravel-ue8266.azurewebsites.net/api/trips/yunnan2026"

# 查看云端资源
az resource list -g rg-yn-travel -o table
```

---

## 二、自动化 Skills

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
> ➕ 新增的前端托管 **App Service B1（`asp-yntravel-web`）是按小时计费的付费规格**（非免费层），约 ¥100+/月，见下方新增功能说明。

---

## 三、行程生成平台（`app/`）与新增功能

除了 `app/` 首页生成流程，仓库现在只有这一套**数据驱动的多行程平台**：首页输入行程文本 → `trip.html?trip=<ID>` 渲染。历史手写云南页（`云南/`）已删除，其内容已迁移为 trip **`yunnan2026`**（见下表）。

### 新增功能清单
| 功能 | 说明 | 相关文件 |
|------|------|---------|
| 🤖 AI 行程助手 | 右下角机器人按钮 → 右侧聊天框，用自然语言对行程/清单/物品/花销增删改查；**删除二次确认**；思考时 loading 旋转；完成后无刷新自动更新并提示去哪个标签查看 | `app/js/chat.js`、`api/src/functions/trips.js`（`/chat`） |
| 云南行程导入平台 | 手写云南页数据已迁移为平台 Schema，存为 trip **`yunnan2026`**（原静态页已删除） | — |
| 预定清单附件 | 平台清单自带**📎 附件**（完成人 / 文字说明 / 图片凭证，图片经 `/api/upload` 存 Blob） | `app/js/render.js`、`app/js/trip.js`、`app/js/api.js` |
| 🎨 多模板风格 | resort/ocean/sunset/minimal 四套，右上角切换，云端持久化 | `app/js/trip.js` |
| 💰 花销分摊账本 | 动态同行人；付款人与承担人分离；平均/自定义分摊；实际付款、实际承担、净余额和建议结算；时间线与可排序表格；旧记录兼容 | `app/js/expense-model.js`、`app/js/trip.js`、[完整说明](docs/expense-ledger.md) |
| 🖼️ 照片墙 MVP | 新增照片墙 Tab；支持全局上传、按 destination / timeline item 自动关联、照片墙展示、Lightbox 查看与编辑 caption/destination/关联对象；右侧桌面端 Three.js/CSS3D 旋转照片球与筛选联动 | `app/js/photos.js`、`app/js/trip.js`、`app/js/render.js`、`app/css/styles.css` |
| ⭐ 收藏路由 | 干净 URL `/app/trip-collections?trip=<ID>`（App Service 上目录方式实现） | `app/trip-collections/index.html` |
| 🧰 Tailwind CSS（渐进式） | 保留原有手写 `styles.css` 不动，新增 `tailwind.css` 作为工具类补充层（`preflight` 已关闭，不重置现有样式），用于新写的响应式/移动端布局，逐步减少手写媒体查询 | `app/tailwind.config.js`、`app/css/tailwind-input.css` → 编译产物 `app/css/tailwind.css` |

> Tailwind 使用说明：`app/` 下 `npm run build:css` 编译（`--minify`），`npm run watch:css` 本地开发监听。编译产物 `tailwind.css` **需要提交到 git**——部署流程仍是纯静态文件拷贝，没有构建步骤，所以任何 HTML/JS 里新增的 Tailwind class 必须在提交前本地跑一次 `build:css`。`tailwind.config.js` 里 `content` 扫描 `app/*.html`、`app/trip-collections/*.html`、`app/js/**/*.js`。

### 照片墙设计与数据
- 照片元数据暂存在 trip JSON 的 `photos` 数组里，图片文件复用现有 `/api/upload` 上传到 Blob 容器 `proofs`。当前 MVP 不单独建照片 Table。
- `photos[]` 典型结构：
  ```js
  {
    id: 'ph_xxx',
    url: 'https://...display.jpg',
    displayUrl: 'https://...display.jpg',
    thumbUrl: 'https://...thumb.jpg',
    caption: '蓝月谷水面很漂亮',
    destination: '丽江',
    scope: { type: 'timelineItem', sectionId: '...', childId: '...', itemId: '...' },
    uploadedAt: '2026-07-12T12:00:00.000Z',
    updatedAt: '2026-07-12T12:00:00.000Z'
  }
  ```
- 上传入口：
  - 照片墙 Tab 顶部「上传照片」默认关联整个行程。
  - destination section 和 timeline item 内的「＋ 照片」会自动带入当前 section / item 作为关联对象。
- 展示：
  - 上传时生成 `thumbUrl` 与 `displayUrl` 两档图片，并在 Blob 上设置长期缓存；照片墙和照片球只加载缩略图，Lightbox 才加载展示图。
  - 左侧主体为仿真照片墙：最多随机展示 9 张，支持图钉/胶带、轻墙面纹理、随机角度与大小、「重新排布」。
  - 右侧桌面端为 Three.js + CSS3DRenderer 照片球：最多展示 12 张，自动旋转，支持鼠标拖拽，跟「全部 / 各目的地」筛选联动。
  - 移动端隐藏右侧照片球，仅保留照片墙主体。
- Lightbox：点击照片可查看大图，并可编辑 caption、destination、关联对象，或删除照片元数据。
- 边界：MVP 不做 AI 自动识图、人脸识别、自动地理定位；删除照片当前只删除 trip 元数据，不删除 Blob 中的原图。

### 平台后端（多租户，与云南单租户隔离）
- `api/src/functions/trips.js`：`POST /api/trips/generate`、`GET /api/trips/{id}`、`PUT /api/trips/{id}/save`（upsert，可指定 id）、`POST /api/trips/{id}/chat`、`POST /api/trips/{id}/tools/execute`。
- `api/src/functions/upload.js`：照片墙、清单附件等图片上传入口，当前上传到 Blob 容器 `proofs`。
- 存储：Table `trips`（`PartitionKey="trip"`，`RowKey=tripId`，整份 Schema 存 `data` 字段，包含平台的 `people[]` 与 `expenses[]`）；Table `ratelimit` 限流。平台花销不写入旧版独立 `expenses` Table。
- Azure OpenAI（生成 + 聊天）：配置在 Function App 应用设置 `AOAI_ENDPOINT / AOAI_DEPLOYMENT / AOAI_API_KEY / AOAI_API_VERSION`（密钥不落前端）。

### 平台花销账本

- 数据结构、分摊规则、结算算法、旧数据兼容、AI 写入确认、本地隔离测试与测试覆盖详见 [docs/expense-ledger.md](docs/expense-ledger.md)。
- 新花销默认选择全部同行人并平均分摊；用户也可以只选择部分参与人或为每人填写自定义金额。
- 旧记录只有 `personId` 时，付款人同时视为唯一承担人，避免升级后悄然改变历史账目。
- 金额按整数分计算；自定义分配合计必须严格等于订单总额。

### 前端托管（两处）
- **GitHub Pages**：<https://cfonheart.github.io/Travel/>
- **Azure App Service B1**（国内可访问）：<https://yntravel-site-ue8266.azurewebsites.net>（详见 [docs/azure-resources.md](docs/azure-resources.md)）

> ⚠️ **改前端 JS 后的缓存**：浏览器会缓存 ES 模块（`&v=` 只刷 HTML，不刷 `./xxx.js` 嵌套 import）。回访用户需**硬刷新 Ctrl+F5**；新访客不受影响。
