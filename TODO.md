# TODO / 开发待办

记录暂缓但有价值的功能，方便后续开发人员接手。

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
