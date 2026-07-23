# 平台花销与分摊账本

本文说明 `app/` 多行程平台中的花销功能。它与 `云南/` 手写页面使用的旧版 `/api/expenses` 独立：平台花销随整份 trip Schema 存入 `trips` Table，不写入独立的 `expenses` Table。

## 功能概览

- 动态同行人，不限制人数。
- 付款人与承担人分离：付款人负责垫付，参与人负责承担。
- 支持平均分摊和自定义金额分摊。
- 自动计算每人的实际付款、实际承担、净余额和建议结算转账。
- 提供时间序列看板、全部订单表和每人账单表。
- 表格默认折叠，可分别展开；支持按交易时间或订单金额升序/降序排序。
- 可从时间线卡片或表格编辑旧记录；保存后保留当前视图、表格展开/排序状态和滚动位置。
- 小白熊行程助手可在用户明确确认后新增、修改或删除花销，也能只读回答花销总额、实际付款和实际承担。
- 兼容只有 `personId` 的旧记录，不要求一次性迁移历史数据。

## 用户操作

### 添加或编辑

1. 在“💰 花销”标签点击“记一笔”，或点击时间线/表格中的编辑图标。
2. 选择付款人并输入订单总额。
3. 选择一个或多个参与人。
4. 选择分摊方式：
   - **平均分摊**：按分精确均分；除不尽的分从首位参与人开始依次补 1 分，保证合计严格等于订单总额。
   - **自定义金额**：为每位参与人输入金额；只有分配合计等于订单总额时才允许保存。
5. 填写说明和交易时间后保存。

切回平均分摊时，自定义金额输入区会隐藏并清空；再次选择自定义时根据当前参与人重新生成输入项。

### 阅读账本

汇总区展示：

- **总花销**：所有订单金额之和。
- **实际付款（paid）**：该成员真实垫付的订单金额。
- **实际承担（owed）**：该成员按分摊应承担的金额。
- **净余额（balance）**：`paid - owed`。正数表示应收，负数表示应付。
- **建议结算**：将欠款人和收款人按余额匹配，生成“谁向谁转多少钱”的建议。

表格默认按交易时间升序排列，而不是按数据库写入顺序。每张表保留自己的排序字段、方向和展开状态。个人账单固定为五列：时间、订单、订单金额、付款人、自己承担。

## 数据模型

`trip.people[]`：

```json
{
  "id": "p-jun",
  "name": "Jun"
}
```

`trip.expenses[]`：

```json
{
  "id": "expense-dinner",
  "personId": "p-jun",
  "payerId": "p-jun",
  "amount": 300,
  "note": "晚餐",
  "time": "2026-07-22T19:30",
  "participantIds": ["p-jun", "p-wenwen", "p-kun"],
  "splitMode": "custom",
  "allocations": [
    { "personId": "p-jun", "amount": 120 },
    { "personId": "p-wenwen", "amount": 100 },
    { "personId": "p-kun", "amount": 80 }
  ]
}
```

字段约束：

| 字段 | 说明 |
| --- | --- |
| `id` | 花销唯一 ID，编辑和删除依赖该值 |
| `personId` | 兼容字段，与 `payerId` 都表示付款人 |
| `payerId` | 实际付款人的 `people[].id` |
| `amount` | 订单总额，按人民币元保存 |
| `note` | 可选说明，后端工具最长保留 200 字符 |
| `time` | 交易时间；用于时间线定位和默认排序 |
| `participantIds` | 承担该订单的成员 ID 列表 |
| `splitMode` | `equal` 或 `custom` |
| `allocations` | 每位参与人的最终承担金额；合计必须与 `amount` 相等 |

金额计算统一先转换为整数分，再进行均分、累计和结算，避免浮点误差。

## 旧数据兼容

历史记录可能只有：

```json
{
  "id": "legacy-expense",
  "personId": "p-jun",
  "amount": 100,
  "note": "旧订单",
  "time": "2026-07-20T12:00"
}
```

兼容规则：

1. `payerId` 缺失时使用 `personId`。
2. `allocations` 和 `participantIds` 都缺失时，默认该笔费用只由付款人承担。
3. 有效的 `allocations` 优先；其金额合计不等于总额时，会按有效参与人重新平均分摊。
4. 编辑并保存旧记录后，会写入完整的新字段，同时保留 `personId`。

> 该规则只保证读取和编辑兼容，不会自动把旧记录改成“所有人平均承担”。如需改变承担关系，应逐笔编辑确认。

## 结算算法

账本先计算每个人的 `balance = paid - owed`，再分别建立收款人和欠款人列表。结算使用贪心匹配：每次在当前欠款人与收款人之间转移两者剩余金额的较小值，直到所有余额归零。结算结果是建议，不会自动生成支付记录，也不会标记“已结清”。

## AI 助手与安全确认

花销写操作使用 `expense.item` 工具，支持 `add`、`update`、`delete`。参数可包含付款人、参与人、平均/自定义分摊及分配明细。

- 只有最新用户消息明确要求写入时，后端才允许返回写工具。
- 写操作先展示确认卡片；确认后才调用 `/api/trips/{id}/tools/execute` 并保存。
- 自定义分摊在前端和后端都校验，误差超过半分即拒绝。
- “这次一共花了多少钱”等只读问题直接使用当前 trip 数据回答，不触发写入确认。

## 存储与接口

平台花销位于 `trip.expenses[]`，随整份 trip JSON 通过以下接口读写：

| 方法 | 路由 | 作用 |
| --- | --- | --- |
| `GET` | `/api/trips/{id}` | 读取整份行程和花销 |
| `PUT` | `/api/trips/{id}/save` | 保存整份行程 Schema |
| `POST` | `/api/trips/{id}/chat` | 生成只读回答或待确认工具 |
| `POST` | `/api/trips/{id}/tools/execute` | 确认后执行花销等写工具 |

不要使用旧版 `/api/expenses` 修改平台花销；该接口服务于 `云南/` 手写页面，数据存放位置和字段都不同。

## 本地隔离测试

本地开发使用物理隔离的数据链路：`localhost:5173` → `.tmp-local-dev-server.mjs`（`localhost:7071`）→ `rg-yn-travel-local` 中的独立 Storage。Local 没有 Function App 或 App Service，也不会代理 Production Function。浏览器中的 `?trip=yunnan2026` 直接读取 Local `trips` Table 的同名记录，不做 ID 映射。

Storage 连接串放在被 Git 忽略的 `.storage_local`；本地 LLM 的 `API_KEY/API_MODEL/API_VERSION/ENDPOINT` 放在被忽略的 `.llm_token_local`。两个文件都不能提交或输出。Production 的 `yunnan2026-localtest` 只作为一次性复制源，复制为 Local `yunnan2026` 后仍保留在 Production，Production `yunnan2026` 不参与迁移。

Azure Table 的单个字符串属性最多约 32K 个 UTF-16 字符。Local API 保存前会移除已单独存放在 `expenseAnalysis` Table 的分类字段；如果行程本体仍超过限制，则自动将 `trips.data` 保存为 gzip + Base64，并通过 `dataEncoding` 标记，读取时透明解压。前端数据结构和操作方式不变。

### AI 消费分类与分析

平台的“消费分析”Tab 在 Production 与 Local 环境均可用：

- 点击“AI 分类”后，当前环境的 API 把花销 `id/amount/note` 发送给服务端配置的 Azure OpenAI；密钥不会进入浏览器。
- 模型只能从六类中选择：餐饮、交通、住宿、游玩、购物、其他；未知、漏项或非法类别会归入“其他”。
- 分类结果按 `PartitionKey=tripId`、`RowKey=expenseId` 写入当前环境独立的 `expenseAnalysis` Table，不会增加 `trips` Table 行的大小。
- 每次读取行程时，API 按花销 ID 合并分类；金额、付款人和分摊字段保持不变。
- 新增或编辑花销会让该笔记录在当前页面中变为待重新分类；点击“重新分析”可刷新全部类别。
- “消费分析”Tab 展示全体类别环形图、每位同行人的实际付款/实际承担金额和比例对比，以及每个人按实际承担金额计算的消费类型环形图。
- 点击个人环形图中的分类扇区或右侧分类行，会从右侧打开该成员该类型的全部订单明细，按时间倒序展示交易时间、付款人、订单总金额和该成员承担金额；可点遮罩、关闭按钮或按 `Esc` 关闭。

路由为 `POST /api/trips/{id}/expenses/classify`。Local 与 Production 使用物理隔离的 Storage，分类结果不会跨环境写入。

## 实现与测试

| 范围 | 文件 |
| --- | --- |
| 分摊、账本、结算、时间线防重叠 | `app/js/expense-model.js` |
| 页面、弹窗、表格、编辑和状态保留 | `app/js/trip.js` |
| 花销视觉样式 | `app/css/styles.css` |
| AI 花销工具和只读汇总 | `api/src/functions/trips.js` |
| 分摊与结算回归测试 | `api/test/expense-split.test.js` |
| 测试数据 | `api/test/fixtures/expense-split-trip.json` |
| 聊天写入与安全回归 | `api/test/chat-cases/`、`api/test/trips-chat-intent.test.js` |
| 本地环境隔离 | `.tmp-local-dev-server.mjs`、`config/environments/*.json`、`api/test/local-dev-server.test.js` |
| AI 分类与消费图表 | `api/src/functions/trips.js`、`.tmp-local-dev-server.mjs`、`app/js/trip.js`、`api/test/expense-analysis.test.js` |

部署前必须在 `api/` 运行 `npm test`。测试覆盖分余数、旧记录兼容、账本、结算、自定义合计校验、AI 新增/修改/删除和本地测试数据隔离。
