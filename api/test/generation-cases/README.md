# Trip generation 回归用例

部署前必须通过的本目录用例，覆盖 **Trip generation** 的 local-first validation 与 **generation profile** 元数据。

- 使用 mock LLM fixture，不访问 Azure OpenAI
- 通过 `__test.generateValidatedTrip(text, deps)` 注入依赖
- 运行：`cd api && npm test`
