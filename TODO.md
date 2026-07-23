# TODO / 开发待办

记录暂缓但有价值的功能，方便后续开发人员接手。

---

## 平台花销账本后续增强

**状态：** 分摊账本已实现，后续增强（Backlog）
**记录日期：** 2026-07-23

### 已完成功能

- 动态同行人，付款人与承担人分离。
- 平均分摊、自定义金额分摊及严格合计校验。
- 实际付款、实际承担、净余额和建议结算。
- 时间序列、全部订单和五列个人账单；表格默认折叠，可按交易时间/金额双向排序。
- 历史 payer-only 记录兼容；旧记录可编辑补充分摊。
- 编辑后保留当前视图、展开/排序状态和滚动位置。
- 小白熊行程助手支持经确认的花销增删改，并支持只读花销汇总。
- 分摊、账本、结算、工具执行和本地测试隔离已有自动化回归测试。
- AI 六类消费分析、个人类别环形图与订单明细抽屉已上线；分类独立存放，不改变原始订单和分摊。

完整现状与数据模型见 [docs/expense-ledger.md](docs/expense-ledger.md)。

### 后续建议

1. **结算状态**：允许将建议转账标记为已结清，并记录结算时间与备注。
2. **多币种**：为国际行程增加币种、汇率来源和本位币汇总。
3. **收据关联**：复用 `/api/upload` 给订单添加票据图片；后续可增加 OCR 识别金额与时间。
4. **筛选与导出**：按成员、日期、说明筛选，并导出 CSV/Excel。
5. **审计历史**：记录订单修改与删除历史，支持按记录恢复，避免多人协作误操作。
6. **AI 分类增强**：增加手动改类入口、分类审计历史和可选择的增量重分类策略。

---

## 照片墙后续增强

**状态：** MVP 已实现，后续增强（Backlog）
**记录日期：** 2026-07-12

### 已有 MVP
- `app/` 动态行程页新增 `🖼️ 照片墙` Tab。
- 支持全局上传照片，也支持在 destination / timeline item 上下文上传并自动关联。
- 照片元数据暂存 trip JSON 的 `photos[]`，图片复用 `/api/upload` 存 Blob。
- 左侧为最多 9 张随机照片的仿真照片墙；右侧桌面端为 Three.js + CSS3DRenderer 旋转照片球。
- 支持 Lightbox 查看、编辑 caption/destination/关联对象、删除照片元数据。

### 后续建议
1. **独立照片表**：照片数量变多后，将 `photos[]` 从 trip JSON 拆到 Table `tripPhotos`，`PartitionKey=tripId`、`RowKey=photoId`。
2. **Blob 清理**：增加删除照片时同步删除 Blob 的 API，避免只删元数据导致存储残留。
3. **批量上传**：上传控件支持一次选择多张，批量填写 destination / scope。
4. **封面机制**：支持 `isCover` 或 `coverPhotoId`，只在用户设置封面后显示大图 hero。
5. **Section 胶卷**：destination / timeline item 下展示横向照片胶卷预览。
6. **AI tool 化**：新增 `photo.add/update/delete/link/setCover` tool，继续走聊天确认卡片。
7. **服务端缩略图**：当前已用前端 Canvas 生成 `thumbUrl` / `displayUrl` 两档图片；如后续照片量变大，可改为服务端生成缩略图，减少客户端处理压力。
8. **3D 模式降级**：Three.js CDN 失败时保留当前 DOM sphere fallback，并在 UI 上弱提示。

---

## 结构级差异化模板（Structure-level Templates）

**状态：** 待开发（Backlog）
**记录日期：** 2026-07-11

### 背景
目前平台（`app/`）已实现**多模板机制**，但只是**主题级（颜色级）**差异：
- 通过 `meta.template` 字段（`resort` / `ocean` / `sunset` / `minimal`）
- 靠 `body.tpl-*` class 覆盖 CSS 变量 + Hero 渐变
- 所有模板**共用同一套 HTML 结构和排版**（`render.js` 的块渲染器）

### 目标
做**结构级**差异模板：不同模板不仅换颜色，还有**不同的布局与排版**。例如：
- **极简商务风**：更紧凑的单列/双列排版、去掉大 Hero、卡片更扁平、信息密度更高、弱化 emoji
- **杂志/画报风**：大图优先、错落布局、住宿/景点以图片卡片为主
- **时间线优先风**：整个行程以一条贯穿的时间轴呈现，航班/住宿都挂在时间轴节点上

### 实现思路（基于现有架构）
数据与视觉已解耦（同一份行程 Schema 可渲染成不同风格），因此：
1. 为每套结构模板准备**独立的渲染器**，例如 `app/js/render-resort.js`（现有 `render.js` 抽象而来）、`render-minimal.js`、`render-magazine.js`。
2. `trip.js` 根据 `meta.template` **动态选择渲染器**（可用动态 `import()`）。
3. 每套渲染器可配套**独立/附加的 CSS**（如 `css/tpl-minimal.css`），或在 `styles.css` 里用 `body.tpl-minimal .xxx` 覆盖结构相关样式（间距、栅格、Hero 显隐等）。
4. 保持四个面板（行程 / 预定清单 / 出行物品 / 花销）的**数据接口不变**，只改呈现。
5. 首页/风格切换处可加**结构模板预览**，方便用户选择。

### 涉及文件（现状参考）
- `app/js/render.js` — 当前唯一渲染器（`flight`/`hotel`/`car`/`timeline`/`costTable`/`note` 块渲染 + 清单/物品面板）
- `app/js/trip.js` — `applyTemplate()`（目前只切 class）、`renderAll()`（调用渲染器）
- `app/css/styles.css` — `body.tpl-*` 主题变量、Hero、卡片、时间轴等样式
- `app/trip.html` — 顶部「🎨 风格」下拉

### 注意
- 结构模板要兼容所有 `section.type`，缺字段要优雅降级（参考现有渲染器的 `esc()` 与空值处理）。
- 不要破坏现有主题级切换与 `meta.template` 的云端持久化。
- 与云南静态页（`云南/`）保持隔离，互不影响。
