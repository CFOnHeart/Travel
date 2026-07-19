# Travel · 行程生成平台

把中文行程描述解析成可协作、可分享的旅行记录页。平台侧核心对象是 **Trip**（整份行程 JSON），由 AI **生成**或用户在 **行程页**上继续编辑。

## Language

**Trip**:
一份完整旅行记录，包含行程结构、预定清单、出行物品、花销与照片元数据。
_Avoid_: 行程单、计划书、document

**Trip generation**:
从用户粘贴的中文描述创建新 Trip 的 AI 流程（`POST /api/trips/generate`）。
_Avoid_: 解析、生成器、create flow

**Generation stage**:
生成过程中对用户可见的一个步骤（如「解析行程文本」「提取航班与住宿」）。
_Avoid_: phase、step（在 UI 文案里可用「步骤」）

**Local-first validation**:
生成后先跑本地结构检查（`deterministicIssues` / `normalizeSections`）；仅当本地检查失败时才进入 LLM validate/repair 循环。
_Avoid_: 预校验、quick check

**Fast path**:
本地检查通过、无需 validate/repair 的生成路径，通常只需一次 LLM 调用。
_Avoid_: 快速模式、express generation

**Generation notes**:
写入 `trip.meta.generationNotes` 的生成结果摘要，标记是否需要用户复核（`needsReview`）。
_Avoid_: 生成日志、validation errors（不对用户暴露内部校验细节）

**Generation case**:
针对 `/trips/generate` 的固定输入 + mock LLM 输出 fixture，用于回归 fast path 与本地结构检查是否按预期触发。
_Avoid_: e2e test、live LLM test

**Generation profile**:
`POST /api/trips/generate` 响应中的生成元数据（如 `path`、`llmCalls`），仅供测试与观测，不对用户展示。
_Avoid_: 生成统计、debug info（面向用户的说法）
