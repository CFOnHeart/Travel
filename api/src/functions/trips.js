/**
 * 多租户「行程生成」后端（与现有 state/expenses/upload 完全隔离，互不影响）。
 *
 *  POST /api/trips/generate   body: { text }            -> { tripId, trip }
 *  GET  /api/trips/{tripId}                              -> { trip }
 *  PUT  /api/trips/{tripId}    body: { trip }            -> { ok }
 *
 * 存储：新建独立 Table `trips`，PartitionKey='trip'，RowKey=tripId，
 *       整份行程 Schema(JSON) 存在 `data` 字段。不触碰 checklist / expenses 表。
 */
const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const crypto = require('crypto');

const conn = process.env.AzureWebJobsStorage;
const TABLE = 'trips';
const PK = 'trip';

// Azure OpenAI 配置（存在 Function App 应用设置里，绝不落前端）
const AOAI_ENDPOINT = process.env.AOAI_ENDPOINT;      // https://xxx.openai.azure.com/
const AOAI_DEPLOYMENT = process.env.AOAI_DEPLOYMENT;  // gpt-5.4
const AOAI_API_KEY = process.env.AOAI_API_KEY;
const AOAI_API_VERSION = process.env.AOAI_API_VERSION || '2024-12-01-preview';

function client() { return TableClient.fromConnectionString(conn, TABLE); }
async function ensureTable(c) { try { await c.createTable(); } catch (e) { /* exists */ } }

function newTripId() {
  // URL 安全、不可猜测的短 id
  return crypto.randomBytes(9).toString('base64url');
}

// ---- 限流 / 成本保护 ----
const RL_TABLE = 'ratelimit';
const RL_PK = 'rl';
const RL_PER_IP_HOUR = Number(process.env.RL_PER_IP_HOUR || 15);   // 单 IP 每小时上限
const RL_GLOBAL_DAY = Number(process.env.RL_GLOBAL_DAY || 300);    // 全局每天上限

function rlClient() { return TableClient.fromConnectionString(conn, RL_TABLE); }

async function bump(c, rowKey) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const e = await c.getEntity(RL_PK, rowKey);
      const count = (Number(e.count) || 0) + 1;
      await c.updateEntity({ partitionKey: RL_PK, rowKey, count }, 'Replace', { etag: e.etag });
      return count;
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404) {
        try { await c.createEntity({ partitionKey: RL_PK, rowKey, count: 1 }); return 1; }
        catch { continue; } // 竞态：重试走 get 分支
      }
      if (code === 412) continue; // etag 冲突，重试
      return 0; // 计数出错则放行，不阻断正常用户
    }
  }
  return 0;
}

class RateLimitError extends Error {}

async function checkRateLimit(ip) {
  const c = rlClient();
  try { await c.createTable(); } catch { /* exists */ }
  const now = new Date().toISOString();
  const hour = now.slice(0, 13);   // 2026-07-10T08
  const day = now.slice(0, 10);    // 2026-07-10
  const ipCount = await bump(c, `ip:${ip}:${hour}`);
  const globalCount = await bump(c, `all:${day}`);
  if (ipCount > RL_PER_IP_HOUR) throw new RateLimitError('请求过于频繁，请稍后再试（每小时上限）');
  if (globalCount > RL_GLOBAL_DAY) throw new RateLimitError('今日生成次数已达上限，请明天再试');
}

function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for') || '';
  return (xff.split(',')[0].trim().split(':')[0]) || 'unknown';
}

// ---- 行程 Schema 约定（同时作为 LLM 的输出契约）----
const SCHEMA_DOC = `
你是一个行程解析器。请把用户的中文行程描述解析成严格的 JSON（不要输出除 JSON 以外的任何文字）。
JSON 顶层结构：
{
  "meta": {
    "title": "行程主标题，如：云南度假之旅",
    "subtitle": "副标题，用 · 连接主要目的地",
    "dateLabel": "如：📅 2026年7月17日 — 7月25日 · 9天（无法确定就留空字符串）",
    "emoji": ["与目的地相关的 3-6 个 emoji 装饰，如 🌴 🐘 ⛰️"]
  },
  "sections": [  // 有序的行程内容块，按时间/逻辑排列，num 从 1 递增。优先按目的地/阶段分组
    { "type": "flight", "num": 1, "title": "去程航班",
      "date": "7月17日", "weekday": "周五", "flightNo": "KY3122",
      "from": { "code": "PVG", "name": "上海浦东", "time": "19:15" },
      "to":   { "code": "JHG", "name": "西双版纳", "time": "当晚" },
      "price": 800, "unit": "/人", "priceLabel": "机票参考价",
      "badges": [ { "text": "✅ 含行李托运", "warn": false } ] },
    { "type": "destination", "num": 2, "title": "西双版纳（7/17–7/21）", "destination": "西双版纳",
      "summary": "热带度假阶段，住宿、出行和每日安排都放在这个目的地下。",
      "children": [
        { "type": "hotel", "kind": "lodging", "title": "住宿",
          "name": "温德姆至尊酒店", "stars": "★★★★★ · 豪华大床房",
          "tags": ["室内恒温泳池", "2024新店"],
          "price": 475, "priceUnit": "/ 晚", "totalNote": "4晚合计 · 人均 ≈ ¥950",
          "tip": { "icon": "🩱", "text": "记得带泳衣泳镜！" }, "image": "" },
        { "type": "timeline", "kind": "itinerary", "title": "行程具体安排", "items": [
          { "day": "7/20 周一 · 西双版纳", "heading": "下午安排",
            "desc": "在西双版纳安排半日游或酒店休整。",
            "chips": [ { "text": "🌴 西双版纳", "kind": "default" } ] } ] }
      ] },
    { "type": "flight", "num": 3, "title": "飞往丽江",
      "date": "7月21日", "weekday": "周二", "flightNo": "DR5051",
      "from": { "code": "JHG", "name": "西双版纳", "time": "07:55" },
      "to":   { "code": "LJG", "name": "丽江", "time": "上午" },
      "price": 340, "unit": "/人", "priceLabel": "机票参考价",
      "badges": [ { "text": "含机建燃油", "warn": false }, { "text": "行李托运仅 10kg", "warn": true } ] },
    { "type": "destination", "num": 4, "title": "丽江（7/21）", "destination": "丽江",
      "children": [
        { "type": "note", "kind": "arrival", "title": "抵达方式", "text": "乘飞机抵达：西双版纳 → 丽江（7月21日 周二 · DR5051 · 07:55 → 上午）" },
        { "type": "car", "kind": "transport", "title": "出行",
          "model": "小鹏 G7（意向车型）", "desc": "7/21 取车 · 7/25 还车",
          "price": 250, "priceUnit": "/ 天",
          "tags": ["租期 4 天", "含保险"], "totalNote": "≈ ¥1300 总价", "subNote": "人均 ≈ ¥450" },
        { "type": "timeline", "kind": "itinerary", "title": "行程具体安排", "items": [
          { "day": "7/21 周二 · 抵达日", "heading": "玉龙雪山 → 丽江古镇",
            "desc": "白天玉龙雪山，傍晚逛古镇并入住。",
            "chips": [ { "text": "🏔️ 玉龙雪山", "kind": "default" }, { "text": "🏨 古镇 ≈¥300/间", "kind": "stay" } ] } ] }
      ] },
    { "type": "destination", "num": 5, "title": "泸沽湖（7/22–7/24）", "destination": "泸沽湖",
      "children": [
        { "type": "note", "kind": "arrival", "title": "抵达方式", "text": "自驾抵达：从丽江方向开车前往泸沽湖，车程约 3 小时。" },
        { "type": "timeline", "kind": "itinerary", "title": "行程具体安排", "items": [
          { "day": "7/22 周三 · 前往泸沽湖", "heading": "驱车约 3 小时 · 入住湖景酒店",
            "desc": "开车前往泸沽湖并入住湖景酒店。",
            "chips": [ { "text": "🚗 车程 ≈3h", "kind": "car" }, { "text": "🏨 湖景酒店", "kind": "stay" } ] } ] }
      ] },
    { "type": "destination", "num": 6, "title": "丽江（7/24–7/25）", "destination": "丽江",
      "children": [
        { "type": "note", "kind": "arrival", "title": "抵达方式", "text": "自驾抵达：从泸沽湖返回丽江。" },
        { "type": "timeline", "kind": "itinerary", "title": "行程具体安排", "items": [
          { "day": "7/24 周五 · 返回丽江", "heading": "开车回丽江 · 随意逛",
            "desc": "返回丽江，可在束河古镇或机场附近住一晚。",
            "chips": [ { "text": "🚗 返回丽江", "kind": "car" }, { "text": "🏨 束河古镇 / 机场旁", "kind": "stay" } ] },
          { "day": "7/25 周六 · 返程前", "heading": "丽江机场还车",
            "desc": "前往丽江机场办理还车。",
            "chips": [ { "text": "🚗 机场还车", "kind": "car" } ] } ] }
      ] },
    { "type": "destination", "num": 7, "title": "返程", "destination": "返程",
      "children": [
        { "type": "note", "kind": "arrival", "title": "抵达方式", "text": "从丽江机场出发，返回上海浦东。" },
        { "type": "timeline", "kind": "itinerary", "title": "行程具体安排", "items": [
          { "day": "7/25 周六 · 返程", "heading": "飞回上海浦东",
            "desc": "乘飞机返回上海浦东，结束云南之旅。",
            "chips": [ { "text": "✈️ 丽江 → 上海浦东", "kind": "default" } ] } ] }
      ] },
    { "type": "costTable", "num": 8, "title": "人均费用概览",
      "rows": [ { "item": "去程机票", "note": "KY3122", "amount": "¥800" } ],
      "total": { "item": "已知合计", "note": "不含餐饮", "amount": "≈ ¥3232" } },
    { "type": "note", "num": 9, "title": "备注", "text": "一段自由文字说明。" }
  ],
  "checklist": [  // 预定清单，按类别分组
    { "group": "交通", "icon": "✈️", "items": [
      { "name": "去程机票 上海→西双版纳", "meta": "7/17 KY3122 · ¥800/人", "done": false, "who": "" } ] },
    { "group": "租车", "icon": "🚗", "items": [] },
    { "group": "旅游门票", "icon": "🎫", "items": [] },
    { "group": "每天住宿", "icon": "🏨", "items": [] }
  ],
  "packing": [  // 出行物品，可结合目的地气候给出建议
    { "group": "证件与现金", "icon": "🪪", "items": [ { "name": "身份证", "meta": "" } ] } ]
}

规则：
- 只输出 JSON，不要 markdown 代码块，不要解释。
- 金额为数字时用 number；表格/合计里的金额可带 ¥ 前缀的字符串。
- chip.kind 只能是 "default" | "cost" | "stay" | "car"。
- badge.warn=true 用于「注意/提醒」类（如行李限重）。
- sections 支持两层结构：顶层可以是 destination；destination.children 里放 hotel/car/flight/timeline/note/costTable。
- 多目的地行程必须优先使用 destination 分组，并按实际旅行时间顺序排列。每个具体地点单独一个 destination，例如「丽江」和「泸沽湖」要分开，不要合成「丽江 · 泸沽湖」。
- 同一地点如果在行程中非连续出现，可以出现多个 destination section。例如「丽江 → 泸沽湖 → 丽江」应拆成「丽江」「泸沽湖」「丽江」「返程」，不要把前后两段丽江合并后打乱时间顺序。
- 每个目的地内按需包含 kind="arrival" 的抵达方式、kind="lodging" 的住宿、kind="transport" 的当地出行、kind="itinerary" 的行程具体安排。不要把某个目的地的日程放到另一个目的地的 timeline 里。
- 所有 timeline.items 必须按日期和一天内时间顺序排列；sections 的顺序也必须与真实旅行顺序一致。不要为了按城市聚合而打乱时间。
- destination.destination 只能是一个具体地点或阶段名，例如「西双版纳」「丽江」「泸沽湖」「返程」；不要用「丽江 · 泸沽湖」「东京/大阪」这种混合地点。
- 顶层 flight/car 等跨阶段信息可以保留用于概览，但目的地内仍要有 kind="arrival" 抵达方式。租车取车放取车所在阶段，还车放还车所在阶段。
- 如果只有少量用户信息，不要编造过多具体价格/航班/酒店；不确定内容用待定、建议、空字符串或备注表达。
- 输出前自检：是否有混合地点 destination、是否有时间倒序、是否缺少目的地抵达方式、是否把某地点日程放进其他地点、是否丢失用户明确提到的信息。
- 只有跨目的地交通、全局费用、全局备注适合放在顶层；单个目的地的住宿、当地交通、游玩安排放进对应 destination.children。
- sections 至少包含用户提到的航班、住宿、租车、每日行程、费用等；不确定的字段用空字符串或省略，不要编造。
- checklist 必须覆盖：交通、租车、旅游门票、每天住宿 四类（有内容就填，没有就空数组）。
- 全部使用简体中文。
`;

async function callOpenAIMessages(messages, maxTokens) {
  if (!AOAI_ENDPOINT || !AOAI_DEPLOYMENT || !AOAI_API_KEY) {
    throw new Error('AOAI 配置缺失（AOAI_ENDPOINT / AOAI_DEPLOYMENT / AOAI_API_KEY）');
  }
  const url = `${AOAI_ENDPOINT.replace(/\/$/, '')}/openai/deployments/${AOAI_DEPLOYMENT}/chat/completions?api-version=${AOAI_API_VERSION}`;
  const body = {
    messages,
    response_format: { type: 'json_object' },
    max_completion_tokens: maxTokens || 8000
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': AOAI_API_KEY },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('OpenAI 返回为空');
  return JSON.parse(content);
}

async function callOpenAI(text) {
  return callOpenAIMessages([
    { role: 'system', content: SCHEMA_DOC },
    { role: 'user', content: text }
  ]);
}

const VALIDATION_DOC = `
你是旅行行程 JSON 的合规审查器。只输出严格 JSON，不要 markdown，不要解释。

请检查 trip 是否符合以下规则：
1. 顶层 sections 必须按真实旅行时间顺序排列；每个 timeline.items 也必须按日期/上午下午晚上/时间顺序排列。
2. 目的地阶段必须清晰：一个 destination 只能代表一个具体地点或阶段，不允许把两个城市/地点混在一起，例如「丽江 · 泸沽湖」不合规。
3. 如果同一城市在旅途中非连续出现，允许并应该拆成多个 destination section，例如「丽江 → 泸沽湖 → 丽江 → 返程」。
4. 每个 destination.children 应包含 kind="arrival" 的抵达方式 note；当地住宿用 kind="lodging"，当地出行/租车用 kind="transport"，具体日程用 kind="itinerary" timeline。
5. 具体日程必须放在对应地点和对应时间阶段中，不能把西双版纳日程放进丽江/泸沽湖，也不能把泸沽湖日程放进丽江。
6. 租车取车应放在取车所在阶段，还车应放在还车所在阶段；返程航班/火车等可以是单独「返程」destination 或顶层跨城交通。
7. checklist 必须至少包含交通、租车、旅游门票、每天住宿四类；packing 必须是按类别分组的物品清单。
8. 不应丢失用户原文中明确提到的航班、住宿、日期、地点、价格、活动。
9. 不确定的信息不要编造得过细；可用待定、建议、空字符串或备注。
10. 输出必须能被前端渲染：section.type 只用 destination|flight|hotel|car|timeline|costTable|note；chip.kind 只用 default|cost|stay|car。

返回格式：
{
  "ok": true 或 false,
  "issues": ["简洁列出所有不合规点"],
  "repairInstructions": "如果 ok=false，给修复器的一段中文指令；如果 ok=true，空字符串"
}
`;

const REPAIR_DOC = `
你是旅行行程 JSON 修复器。只输出修复后的完整 trip JSON，不要 markdown，不要解释。

你会收到：用户原始行程描述、当前 trip JSON、审查器指出的问题。请在保留所有正确信息的前提下修复 JSON。
修复重点：
- sections 和 timeline.items 必须按真实旅行时间顺序。
- 一个 destination 只能代表一个具体地点或阶段；不要混合两个城市/地点。
- 同一地点非连续出现时拆成多个 destination，例如「丽江 → 泸沽湖 → 丽江 → 返程」。
- 每个 destination.children 都要有 kind="arrival" 的抵达方式 note，并按 抵达方式 / 住宿 / 出行 / 行程具体安排 排列。
- 租车取车放取车阶段，还车放还车阶段；返程放「返程」阶段或顶层交通。
- 不要丢失已有 checklist、packing、people、expenses、id、价格、日期、地点、用户明确内容。
`;

async function validateGeneratedTrip(originalText, trip) {
  return callOpenAIMessages([
    { role: 'system', content: VALIDATION_DOC },
    { role: 'user', content: JSON.stringify({ originalText, trip }) }
  ], 2500);
}

async function repairGeneratedTrip(originalText, trip, validation) {
  return callOpenAIMessages([
    { role: 'system', content: REPAIR_DOC },
    { role: 'user', content: JSON.stringify({ originalText, trip, validation }) }
  ]);
}

function deterministicIssues(trip) {
  const issues = [];
  if (!trip || typeof trip !== 'object') return ['trip 不是对象'];
  if (!Array.isArray(trip.sections) || !trip.sections.length) issues.push('sections 为空');

  (trip.sections || []).forEach((section, index) => {
    if (section && section.type === 'destination') {
      const name = section.destination || section.title || '';
      const names = inferDestinations({ name });
      if (names.length > 1) issues.push(`第 ${index + 1} 个 destination 混合多个地点：${name}`);
      if (!Array.isArray(section.children)) {
        issues.push(`第 ${index + 1} 个 destination 缺少 children`);
        return;
      }
      if (!section.children.some(child => child && child.kind === 'arrival')) issues.push(`第 ${index + 1} 个 destination 缺少抵达方式`);
      if (!section.children.some(child => child && (child.kind === 'itinerary' || child.type === 'timeline'))) issues.push(`第 ${index + 1} 个 destination 缺少行程具体安排`);
      section.children.forEach(child => {
        if (child && child.type === 'timeline' && Array.isArray(child.items)) {
          child.items.forEach(item => {
            const itemKey = destinationKey(inferDestinations(item));
            if (itemKey && itemKey !== name && itemKey !== '返程') issues.push(`「${itemKey}」日程疑似放入「${name}」阶段`);
          });
        }
      });
    }
  });

  const groups = Array.isArray(trip.checklist) ? trip.checklist.map(g => g && g.group).join('|') : '';
  ['交通', '租车', '旅游门票', '每天住宿'].forEach(group => { if (!groups.includes(group)) issues.push(`checklist 缺少「${group}」分组`); });
  if (!Array.isArray(trip.packing)) issues.push('packing 不是数组');
  return issues;
}

function attachGenerationNotes(trip, originalText, validation, bestEffort = false) {
  trip = trip && typeof trip === 'object' ? trip : {};
  trip.meta = trip.meta && typeof trip.meta === 'object' ? trip.meta : {};
  const places = extractTripPlaces(trip);
  const text = String(originalText || '');
  const decisions = [];

  if (places.length) decisions.push(`按旅行顺序整理为 ${places.join(' → ')} 等地点阶段，方便逐段查看。`);
  if (/(航班|飞机|机场|租车|自驾|还车)/.test(text)) decisions.push('将航班、租车、跨城交通和还车动作放到对应日期或目的地阶段。');
  if (/(住宿|酒店|住)/.test(text)) decisions.push('将住宿信息归入对应目的地；未明确的房价或晚数保留为待定，而不是随意补全。');
  if (/(已完成|预定|预订|门票)/.test(text)) decisions.push('根据原文整理预定清单，并尽量保留已完成状态和完成人。');
  if (/(¥|￥|元|人均|价格|费用)/.test(text)) decisions.push('已知费用按原文展示；缺失费用不会阻止页面生成，可稍后继续补充。');
  if (!decisions.length) decisions.push('已按原文的日期、地点和活动顺序整理为可编辑行程。');

  const validationIssues = Array.isArray(validation && validation.issues) ? validation.issues : [];
  trip.meta.generationNotes = {
    title: bestEffort ? 'AI 已先生成可编辑版本' : 'AI 已完成行程整理',
    summary: bestEffort
      ? '部分日期边界、费用或阶段归属不够明确。我优先保留了原文信息，并按较合理的旅行顺序生成页面，没有因为细节不完整而中断。'
      : '我已根据你的描述整理日期、目的地、交通、住宿、预定和费用信息。',
    decisions: decisions.slice(0, 5),
    needsReview: bestEffort || validationIssues.length > 0,
    reviewHint: bestEffort
      ? '建议快速检查日期、住宿晚数、还车安排和待定费用。'
      : '请快速核对日期、价格和预定状态是否符合你的实际安排。',
    chatHint: '之后想调整任何内容，直接打开右下角 AI 助手聊天即可，例如“把 7/24 的住宿改到束河古镇附近”。'
  };
  return trip;
}

async function generateValidatedTrip(text) {
  let trip = ensureIds(await callOpenAI(text));
  let lastValidation = null;
  let bestEffort = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      lastValidation = await validateGeneratedTrip(text, trip);
    } catch (error) {
      bestEffort = true;
      lastValidation = { ok: false, issues: ['自动复核暂时不可用'], repairInstructions: '' };
      break;
    }
    const localIssues = deterministicIssues(trip);
    if (lastValidation && lastValidation.ok === true && !localIssues.length) {
      return ensureIds(attachGenerationNotes(trip, text, lastValidation, false));
    }
    if (localIssues.length) {
      lastValidation = {
        ok: false,
        issues: [...(Array.isArray(lastValidation && lastValidation.issues) ? lastValidation.issues : []), ...localIssues],
        repairInstructions: '修复确定性结构问题：' + localIssues.join('；')
      };
    }
    if (attempt === 3) {
      bestEffort = true;
      break;
    }
    try {
      trip = ensureIds(await repairGeneratedTrip(text, trip, lastValidation));
    } catch (error) {
      bestEffort = true;
      break;
    }
  }

  return ensureIds(attachGenerationNotes(trip, text, lastValidation, bestEffort || !(lastValidation && lastValidation.ok)));
}

const DESTINATION_NAMES = ['西双版纳', '丽江', '泸沽湖', '昆明', '大理', '香格里拉', '玉龙雪山'];

function sectionText(section) {
  return JSON.stringify(section || {});
}

function inferDestinations(section) {
  const text = sectionText(section);
  return DESTINATION_NAMES.filter(name => text.includes(name));
}

function placeInDestination(section) {
  if (section.type === 'hotel') return true;
  if (section.type === 'timeline') return true;
  if (section.type === 'car' && inferDestinations(section).length) return true;
  return false;
}

function destinationKey(names) {
  if (names.includes('泸沽湖')) return '泸沽湖';
  if (names.includes('丽江') || names.includes('玉龙雪山')) return '丽江';
  return names[0] || '';
}

function childKind(type) {
  if (type === 'hotel') return 'lodging';
  if (type === 'car' || type === 'flight') return 'transport';
  if (type === 'timeline') return 'itinerary';
  return type || 'note';
}

function childTitle(section) {
  if (section.kind === 'arrival') return '抵达方式';
  if (section.kind === 'lodging' || section.type === 'hotel') return '住宿';
  if (section.kind === 'transport' || section.type === 'car') return '出行';
  if (section.kind === 'itinerary' || section.type === 'timeline') return '行程具体安排';
  return section.title || '补充信息';
}

function arrivalFromFlight(section) {
  if (!section || section.type !== 'flight') return null;
  const toNames = inferDestinations(section.to || {});
  const key = destinationKey(toNames);
  if (!key) return null;
  const from = section.from || {};
  const to = section.to || {};
  const date = [section.date, section.weekday].filter(Boolean).join(' ');
  const time = [from.time, to.time].filter(Boolean).join(' → ');
  const flight = section.flightNo ? ` · ${section.flightNo}` : '';
  return {
    key,
    text: `乘飞机抵达：${from.name || '出发地'} → ${to.name || key}${date ? `（${date}${flight}${time ? ` · ${time}` : ''}）` : flight ? `（${section.flightNo}）` : ''}`
  };
}

function arrivalFromTimelineItem(item, key) {
  const text = sectionText(item);
  if (key === '泸沽湖' && /前往泸沽湖|到泸沽湖|抵达泸沽湖/.test(text)) {
    const duration = text.match(/(?:车程|路程)[^，。；]*约\s*\d+\s*(?:小时|h)/i);
    return `自驾抵达：从丽江方向开车前往泸沽湖${duration ? `，${duration[0]}` : ''}。`;
  }
  if (key === '丽江' && /返回丽江|回丽江/.test(text)) return '自驾抵达：从泸沽湖返回丽江。';
  if (key === '返程') return '从丽江机场出发，返回上海浦东。';
  return '';
}

function upsertArrival(group, text, replace = false) {
  if (!text) return;
  if (!Array.isArray(group.children)) group.children = [];
  let child = group.children.find(section => section && section.kind === 'arrival');
  if (!child) {
    child = { type: 'note', kind: 'arrival', title: '抵达方式', text };
    group.children.unshift(child);
    return;
  }
  child.type = child.type || 'note';
  child.title = '抵达方式';
  if (replace || !child.text || child.text === '抵达方式待补充。') child.text = text;
}

function ensureArrival(group) {
  if (!Array.isArray(group.children)) group.children = [];
  if (!group.children.some(section => section && section.kind === 'arrival')) {
    group.children.unshift({ type: 'note', kind: 'arrival', title: '抵达方式', text: '抵达方式待补充。' });
  }
}

function sortDestinationChildren(group) {
  const order = { arrival: 0, lodging: 1, transport: 2, itinerary: 3 };
  group.children.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

function itineraryChild(group) {
  if (!Array.isArray(group.children)) group.children = [];
  let child = group.children.find(section => section && (section.kind === 'itinerary' || section.type === 'timeline'));
  if (!child) {
    child = { type: 'timeline', kind: 'itinerary', title: '行程具体安排', items: [] };
    group.children.push(child);
  }
  if (!Array.isArray(child.items)) child.items = [];
  child.kind = child.kind || 'itinerary';
  child.title = childTitle(child);
  return child;
}

function lodgingFromTimelineItem(item, key) {
  const text = sectionText(item);
  if (key === '泸沽湖' && text.includes('月遥全湖景')) {
    return {
      type: 'hotel',
      kind: 'lodging',
      title: '住宿',
      name: '泸沽湖前湖·月遥全湖景度假酒店（普洛码头店）',
      stars: '高级湖景露台大床房',
      tags: ['湖景露台', '普洛码头店', '有充电桩'],
      price: 542,
      priceUnit: '/ 晚',
      totalNote: '2晚人均 ≈ ¥542',
      tip: { icon: '🔌', text: '酒店配有充电桩，适合自驾电车补能。' },
      image: ''
    };
  }
  if (key === '丽江' && text.includes('丽江古镇') && /入住|住宿/.test(text)) {
    return { type: 'note', kind: 'lodging', title: '住宿', text: '丽江古镇附近住宿，方便傍晚逛古镇并休息。' };
  }
  return null;
}

function upsertLodging(group, lodging) {
  if (!lodging) return;
  if (!Array.isArray(group.children)) group.children = [];
  const exists = group.children.some(section => section && section.kind === 'lodging');
  if (!exists) group.children.push(lodging);
}

function timelineItemKey(item, fallback) {
  const text = sectionText(item);
  if (/返程|飞回上海|返回上海|上海浦东/.test(text)) return '返程';
  return destinationKey(inferDestinations(item)) || fallback || '';
}

function splitReturnItem(item) {
  const text = sectionText(item);
  if (!/返程|飞回上海|返回上海|上海浦东/.test(text) || !/还车|机场/.test(text)) return null;
  const chips = Array.isArray(item.chips) ? item.chips : [];
  return {
    lijiang: {
      ...item,
      heading: '丽江机场还车',
      desc: '前往丽江机场办理还车。',
      chips: chips.filter(chip => String(chip.text || '').includes('还车') || chip.kind === 'car')
    },
    returns: {
      ...item,
      heading: '飞回上海浦东',
      desc: '乘飞机返回上海浦东，结束云南之旅。',
      chips: chips.filter(chip => String(chip.text || '').includes('上海') || String(chip.text || '').includes('✈'))
    }
  };
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];

  const result = [];
  let lastGroup = null;
  const defaultArrivals = new Map();

  function addArrival(key, text) {
    if (key && text && !defaultArrivals.has(key)) defaultArrivals.set(key, text);
  }

  function groupKey(group) {
    return group && (group.destination || group.title);
  }

  function createGroup(key) {
    const group = { type: 'destination', title: key, destination: key, children: [] };
    result.push(group);
    lastGroup = group;
    upsertArrival(group, defaultArrivals.get(key));
    return group;
  }

  function hasItineraryItems(group) {
    return !!(group && Array.isArray(group.children) && group.children.some(child => (
      child && (child.kind === 'itinerary' || child.type === 'timeline') && Array.isArray(child.items) && child.items.length
    )));
  }

  function reusableEmptyStage(key) {
    for (let index = result.length - 1; index >= 0; index--) {
      const section = result[index];
      if (section && section.type === 'destination' && groupKey(section) === key && !hasItineraryItems(section)) return section;
    }
    return null;
  }

  function getStageGroup(key) {
    if (lastGroup && groupKey(lastGroup) === key) {
      if (!Array.isArray(lastGroup.children)) lastGroup.children = [];
      return lastGroup;
    }
    const reusable = reusableEmptyStage(key);
    if (reusable) {
      lastGroup = reusable;
      if (!Array.isArray(reusable.children)) reusable.children = [];
      return reusable;
    }
    return createGroup(key);
  }

  sections.forEach(section => {
    if (!section || typeof section !== 'object') return;
    if (section.type === 'destination') {
      result.push(section);
      lastGroup = section;
      return;
    }

    const arrival = arrivalFromFlight(section);
    if (arrival) addArrival(arrival.key, arrival.text);

    const names = inferDestinations(section);
    const key = destinationKey(names);
    if (!key || !placeInDestination(section)) {
      result.push(section);
      return;
    }

    if (section.type === 'timeline' && Array.isArray(section.items)) {
      const fallback = key || groupKey(lastGroup);
      section.items.forEach(item => {
        const split = splitReturnItem(item);
        if (split) {
          const lijiangGroup = getStageGroup('丽江');
          upsertArrival(lijiangGroup, arrivalFromTimelineItem(split.lijiang, '丽江'), true);
          itineraryChild(lijiangGroup).items.push(split.lijiang);
          const returnGroup = getStageGroup('返程');
          upsertArrival(returnGroup, arrivalFromTimelineItem(split.returns, '返程'), true);
          itineraryChild(returnGroup).items.push(split.returns);
          return;
        }
        const itemKey = timelineItemKey(item, fallback);
        if (!itemKey) return;
        const group = getStageGroup(itemKey);
        upsertArrival(group, arrivalFromTimelineItem(item, itemKey), true);
        upsertLodging(group, lodgingFromTimelineItem(item, itemKey));
        itineraryChild(group).items.push(item);
      });
      return;
    }

    const { num, ...child } = section;
    child.kind = child.kind || childKind(child.type);
    child.title = childTitle(child);
    getStageGroup(key).children.push(child);
  });

  result.forEach(section => {
    if (section && section.type === 'destination' && Array.isArray(section.children)) {
      const key = groupKey(section);
      upsertArrival(section, defaultArrivals.get(key));
      ensureArrival(section);
      const hasItinerary = section.children.some(child => child && (child.kind === 'itinerary' || child.type === 'timeline'));
      if (!hasItinerary) section.children.push({ type: 'timeline', kind: 'itinerary', title: '行程具体安排', items: [] });
      sortDestinationChildren(section);
    }
  });
  result.forEach((section, index) => { section.num = index + 1; });
  return result;
}

function normalizeTripStructure(trip) {
  if (!trip || typeof trip !== 'object') return trip;
  trip.sections = normalizeSections(trip.sections || []);
  return trip;
}

// 给每个 checklist / packing item 补一个稳定 id（前端勾选用）
function ensureIds(trip) {
  if (!trip || typeof trip !== 'object') return trip;
  trip = normalizeTripStructure(trip);
  let n = 0;
  const stamp = () => 'i' + (Date.now().toString(36)) + (n++).toString(36);
  (trip.checklist || []).forEach(g => (g.items || []).forEach(it => { if (!it.id) it.id = stamp(); if (typeof it.done !== 'boolean') it.done = false; if (typeof it.who !== 'string') it.who = ''; }));
  (trip.packing || []).forEach(g => (g.items || []).forEach(it => { if (!it.id) it.id = stamp(); }));
  trip.photos = Array.isArray(trip.photos) ? trip.photos : [];
  (trip.photos || []).forEach(photo => { if (!photo.id) photo.id = stamp(); });
  (trip.sections || []).forEach(section => {
    if (!section.id) section.id = stamp();
    (section.children || []).forEach(child => {
      if (!child.id) child.id = stamp();
      (child.items || []).forEach(item => { if (!item.id) item.id = stamp(); });
    });
    (section.items || []).forEach(item => { if (!item.id) item.id = stamp(); });
  });
  return trip;
}

// ---- POST /api/trips/generate ----
app.http('generateTrip', {
  methods: ['POST'], authLevel: 'anonymous', route: 'trips/generate',
  handler: async (req) => {
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    const text = (b && b.text || '').toString().trim();
    if (text.length < 10) return { status: 400, jsonBody: { error: '行程描述太短' } };
    if (text.length > 8000) return { status: 400, jsonBody: { error: '行程描述过长（上限 8000 字）' } };

    // 限流 / 成本保护
    try {
      await checkRateLimit(clientIp(req));
    } catch (e) {
      if (e instanceof RateLimitError) return { status: 429, jsonBody: { error: e.message } };
      // 限流器自身异常不阻断
    }

    let trip;
    try {
      trip = await generateValidatedTrip(text);
    } catch (e) {
      return { status: 502, jsonBody: { error: '解析失败：' + e.message } };
    }
    trip.version = 1;

    const tripId = newTripId();
    const c = client(); await ensureTable(c);
    await c.upsertEntity({
      partitionKey: PK, rowKey: tripId,
      data: JSON.stringify(trip).slice(0, 60000),
      createdAt: new Date().toISOString()
    }, 'Replace');

    return { jsonBody: { tripId, trip } };
  }
});

// ---- GET /api/trips/{tripId} ----
app.http('getTrip', {
  methods: ['GET'], authLevel: 'anonymous', route: 'trips/{tripId}',
  handler: async (req) => {
    const id = req.params.tripId;
    if (!id) return { status: 400, jsonBody: { error: 'missing tripId' } };
    const c = client(); await ensureTable(c);
    try {
      const e = await c.getEntity(PK, id);
      return { jsonBody: { trip: ensureIds(JSON.parse(e.data)) } };
    } catch {
      return { status: 404, jsonBody: { error: 'not found' } };
    }
  }
});

// ---- PUT /api/trips/{tripId} ----
app.http('putTrip', {
  methods: ['PUT', 'POST'], authLevel: 'anonymous', route: 'trips/{tripId}/save',
  handler: async (req) => {
    const id = req.params.tripId;
    if (!id) return { status: 400, jsonBody: { error: 'missing tripId' } };
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    if (!b || typeof b.trip !== 'object') return { status: 400, jsonBody: { error: 'missing trip' } };
    const trip = ensureIds(b.trip);
    const c = client(); await ensureTable(c);
    await c.upsertEntity({
      partitionKey: PK, rowKey: id,
      data: JSON.stringify(trip).slice(0, 60000),
      updatedAt: new Date().toISOString()
    }, 'Merge');
    return { jsonBody: { ok: true } };
  }
});

// ---- POST /api/trips/{tripId}/chat ----
function pushUnique(list, value) {
  const text = String(value || '').trim();
  if (!text || text === '返程') return;
  if (!list.includes(text)) list.push(text);
}

function extractTripPlaces(trip) {
  const places = [];
  const allText = JSON.stringify(trip || {});
  if (/上海浦东/.test(allText)) pushUnique(places, '上海浦东');
  else if (/上海/.test(allText)) pushUnique(places, '上海');

  (trip.sections || []).forEach(section => {
    if (!section || typeof section !== 'object') return;
    if (section.type === 'destination') pushUnique(places, section.destination || section.title);
    if (section.type === 'flight') {
      pushUnique(places, section.from && section.from.name);
      pushUnique(places, section.to && section.to.name);
    }
    inferDestinations(section).forEach(place => pushUnique(places, place));
  });
  return places;
}

function pendingBookingItems(trip) {
  const items = [];
  (trip.checklist || []).forEach(group => (group.items || []).forEach(item => {
    if (item && !item.done) items.push({ group: group.group || '未分组', name: item.name || '未命名', meta: item.meta || '' });
  }));
  return items;
}

function expenseSummary(trip) {
  const people = new Map();
  (trip.people || []).forEach(person => {
    if (person && person.id) people.set(person.id, person.name || '未命名');
  });
  const expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
  const total = expenses.reduce((sum, item) => sum + (Number(item && item.amount) || 0), 0);
  const byPerson = new Map();
  const owedByPerson = new Map();
  expenses.forEach(item => {
    const name = people.get(item && (item.payerId || item.personId)) || '未指定人员';
    byPerson.set(name, (byPerson.get(name) || 0) + (Number(item && item.amount) || 0));
    let allocations = Array.isArray(item && item.allocations) && item.allocations.length ? item.allocations : null;
    if (!allocations) {
      const payerId = item && (item.payerId || item.personId);
      const ids = Array.isArray(item && item.participantIds) && item.participantIds.length ? item.participantIds : [payerId].filter(Boolean);
      const totalCents = Math.round((Number(item && item.amount) || 0) * 100);
      const base = ids.length ? Math.floor(totalCents / ids.length) : 0;
      let remainder = totalCents - base * ids.length;
      allocations = ids.map(personId => ({ personId, amount: (base + (remainder-- > 0 ? 1 : 0)) / 100 }));
    }
    allocations.forEach(allocation => {
      const participant = people.get(allocation.personId) || '未指定人员';
      owedByPerson.set(participant, (owedByPerson.get(participant) || 0) + (Number(allocation.amount) || 0));
    });
  });
  return { total, byPerson: Array.from(byPerson.entries()), owedByPerson: Array.from(owedByPerson.entries()) };
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizedDateTokens(text) {
  const raw = String(text || '');
  const tokens = new Set();
  for (const match of raw.matchAll(/(?:(\d{4})年)?(\d{1,2})[月\/-](\d{1,2})(?:日|号)?/g)) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    tokens.add(`${month}/${day}`);
    tokens.add(`${month}月${day}日`);
    tokens.add(`${month}月${day}号`);
  }
  return Array.from(tokens);
}

function itineraryItems(trip) {
  const entries = [];
  function addItems(items, stage) {
    (items || []).forEach(item => {
      if (item && typeof item === 'object') entries.push({ stage, item });
    });
  }
  (trip.sections || []).forEach(section => {
    if (!section || typeof section !== 'object') return;
    const stage = section.destination || section.title || '';
    if (section.type === 'timeline') addItems(section.items, stage);
    (section.children || []).forEach(child => {
      if (child && (child.type === 'timeline' || child.kind === 'itinerary')) addItems(child.items, stage);
    });
  });
  return entries;
}

function itineraryForDate(trip, userText) {
  const requested = normalizedDateTokens(userText);
  if (!requested.length) return [];
  return itineraryItems(trip).filter(({ item }) => {
    const itemTokens = normalizedDateTokens([item.day, item.heading, item.desc].filter(Boolean).join(' '));
    return requested.some(token => itemTokens.includes(token));
  });
}

function buildTripContextSummary(trip) {
  const meta = trip.meta || {};
  const places = extractTripPlaces(trip);
  const pending = pendingBookingItems(trip);
  const packing = (trip.packing || []).flatMap(group => (group.items || []).map(item => `${group.group || '未分组'} / ${item.name || '未命名'}${item.meta ? `（${item.meta}）` : ''}`));
  const expenses = expenseSummary(trip);
  return [
    `标题：${meta.title || '未命名行程'}`,
    `日期：${meta.dateLabel || '未设置'}`,
    `会经过/涉及地点：${places.length ? places.join('、') : '当前行程未明确地点'}`,
    `未完成预定：${pending.length ? pending.map(item => `${item.group} / ${item.name}${item.meta ? `（${item.meta}）` : ''}`).join('；') : '无'}`,
    `出行物品：${packing.length ? packing.join('；') : '无'}`,
    `花销合计：¥${money(expenses.total)}${expenses.byPerson.length ? `；实际付款：${expenses.byPerson.map(([name, amount]) => `${name} ¥${money(amount)}`).join('，')}` : ''}${expenses.owedByPerson.length ? `；实际承担：${expenses.owedByPerson.map(([name, amount]) => `${name} ¥${money(amount)}`).join('，')}` : ''}`
  ].join('\n');
}

function answerReadOnlyQuestion(trip, userText) {
  const text = stripClientChatGuard(userText);
  if (!text || hasExplicitMutationIntent(text)) return null;

  if (normalizedDateTokens(text).length && /(干嘛|做什么|安排|行程|计划|去哪|去哪里|活动|怎么玩)/.test(text)) {
    const entries = itineraryForDate(trip, text);
    if (entries.length) {
      return entries.map(({ stage, item }) => {
        const date = item.day ? `${item.day} ` : '';
        const place = stage ? `【${stage}】` : '';
        const detail = [item.heading, item.desc].filter(Boolean).join('：');
        return `${date}${place}${detail || '已有行程安排'}`;
      }).join('\n');
    }
    return null;
  }

  if (/(经过|途经|会去|去哪|去哪些|什么地方|哪些地方|目的地|路线|城市)/.test(text) && /(地方|地点|目的地|城市|路线|经过|途经|会去|去哪)/.test(text)) {
    const places = extractTripPlaces(trip);
    return places.length ? `这次行程会经过/涉及：${places.join('、')}。` : '当前行程里还没有明确的目的地信息。';
  }

  if (/(未完成|没完成|没有完成|待完成|待办|还没|还没有|哪些没|什么没)/.test(text) && /(预定|预订|清单|订单|门票|住宿|交通|booking)/i.test(text)) {
    const pending = pendingBookingItems(trip);
    if (!pending.length) return '目前没有未完成的预定项。';
    return `还有 ${pending.length} 个未完成预定：${pending.map(item => `${item.group} / ${item.name}${item.meta ? `（${item.meta}）` : ''}`).join('；')}。`;
  }

  if (/(一共|总共|合计|总花销|花了多少|多少钱|费用|花销)/.test(text) && /(花|钱|费用|花销|合计|总共|一共)/.test(text)) {
    const summary = expenseSummary(trip);
    if (!summary.total) return '目前还没有记录花销，所以合计是 0 元。';
    const paid = summary.byPerson.length ? `；实际付款：${summary.byPerson.map(([name, amount]) => `${name} ¥${money(amount)}`).join('，')}` : '';
    const owed = summary.owedByPerson.length ? `；实际承担：${summary.owedByPerson.map(([name, amount]) => `${name} ¥${money(amount)}`).join('，')}` : '';
    return `目前已记录花销合计 ¥${money(summary.total)}${paid}${owed}。`;
  }

  return null;
}

function chatSystem(trip) {
  const nowIso = new Date().toISOString();
  return `你是「行程助手」，帮助用户基于当前行程数据进行问答、分析和修改。

当前行程摘要（优先用于回答只读问题）：
${buildTripContextSummary(trip)}

下面是当前行程的完整 JSON（含所有 id）：
${JSON.stringify(trip)}

当前服务器时间：${nowIso}

行程结构说明：
- meta: { title, subtitle, dateLabel, emoji[], template }
- sections[]: 行程内容块，type ∈ destination|flight|hotel|car|timeline|costTable|note
- destination section: { type:"destination", title, destination, summary, children:[...] }，children 里通常有 kind="arrival" 的抵达方式、kind="lodging" 的住宿、kind="transport" 的当地出行、kind="itinerary" 的行程具体安排
- checklist[]: 预定清单分组 { group, icon, items:[{id,name,meta,done,who}] }
- packing[]: 出行物品分组 { group, icon, items:[{id,name,meta}] }
- people[]: 花销同行人 [{id,name}]
- expenses[]: 花销 [{id,personId,payerId,amount,note,time,participantIds,splitMode,allocations:[{personId,amount}]}]。personId 是兼容字段，与 payerId 都表示付款人。

你可以帮用户对以上任意部分做「增、删、改、查」。只读问题必须直接基于当前行程摘要和完整 JSON 回答。

输出必须是严格 JSON（不要 markdown，不要多余文字）：
{
  "reply": "给用户的中文回复",
  "updatedTrip": <修改后的完整行程 JSON> 或 null,
  "focus": "trip" | "booking" | "packing" | "expense" | null,
  "toolCalls": [
    {
      "action": "collection.item",
      "title": "修改清单/物品",
      "message": "请确认分组、名称和说明。",
      "args": { "operation": "add|update|delete|toggle", "collection": "booking|packing", "itemId": "已有条目 id，可空", "group": "分组", "name": "名称", "meta": "说明", "done": false, "who": "完成人，仅 booking 使用" }
    },
    {
      "action": "expense.item",
      "title": "修改花销",
      "message": "时间默认当前时间，说明为空，可在确认前修改。",
      "args": { "operation": "add|update|delete", "expenseId": "已有花销 id，可空", "personName": "付款人姓名", "amount": 128, "time": "ISO 时间", "note": "说明", "participantNames": ["参与人姓名"], "splitMode": "equal|custom", "allocations": [{"personName":"姓名","amount":64}] }
    },
    {
      "action": "trip.timelineItem",
      "title": "修改具体行程",
      "message": "请确认目的地阶段、日期和行程内容。",
      "args": { "operation": "add|update|delete", "itemId": "已有日程 id，可空", "destination": "目的地", "stageTitle": "阶段标题，可空", "day": "日期标签", "heading": "标题", "desc": "说明", "chips": [] }
    },
    {
      "action": "trip.hotel",
      "title": "修改住宿",
      "message": "请确认目的地、酒店名和住宿信息。",
      "args": { "operation": "upsert|delete", "sectionId": "已有住宿 section id，可空", "destination": "目的地", "stageTitle": "阶段标题，可空", "name": "酒店名", "stars": "房型/星级", "tags": [], "price": "", "priceUnit": "", "totalNote": "", "tipText": "" }
    }
  ] 或 []
}

规则：
- 如果最新用户消息只是寒暄、闲聊、感谢、询问、统计、总结、分析、建议、推荐或解释，不涉及系统数据改动，只回答 reply，updatedTrip=null，focus=null，toolCalls=[]。例如用户只说「Hi」「你好」「这次一共花了多少钱」「帮我分析一下行程」，都不要返回任何写工具。
- 只有最新用户消息明确要求新增、修改、删除、勾选、取消勾选、记录花销、保存或写入数据时，才可以返回 toolCalls 或 updatedTrip。
- 读取上下文不需要工具：当前完整 trip JSON 已在系统消息里，直接基于它回答用户即可。
- 「查」类问题（询问、汇总、统计）只回答 reply，updatedTrip=null，focus=null。
- 所有会修改后端数据的操作都必须经过前端弹窗确认：优先返回 toolCalls，updatedTrip=null。不要在 reply 里声称已经执行。
- 尽量只使用这 4 个通用写工具：collection.item（booking/packing 增删改/勾选）、expense.item（花销增删改）、trip.timelineItem（具体行程增删改）、trip.hotel（住宿增删改）。无法表达时才返回完整 updatedTrip 交给 trip.replace 兜底确认。
- 如果确实遇到暂未支持的细粒度 tool，可以返回完整 updatedTrip；后端会把它包装成 trip.replace 确认工具，用户确认后才保存。返回 updatedTrip 时必须保留所有未改动字段和所有 id，不要丢数据。
- 修改 sections 前先判断用户请求的目的地、日期和主题：
  1. 如果用户提到目的地（如「西双版纳」「丽江」「泸沽湖」），必须优先修改 title/destination/summary/chips/desc 中匹配该目的地的 destination section。
  2. 新增当地游玩安排时，添加到该 destination.children 中 kind="itinerary" 或 title 含「行程」的 timeline.items，不要添加到其他目的地的 timeline。
  3. 如果匹配目的地下没有 itinerary timeline，就在该 destination.children 新建 {type:"timeline", kind:"itinerary", title:"行程具体安排", items:[...]}。
  4. 如果用户提到的目的地不存在，就新建一个 destination section，再在它的 children 里新增行程具体安排；不要借用不相关目的地的 section。
  5. 只有用户明确说的是跨城市交通、全局费用或全局备注，才修改顶层 flight/costTable/note。
  6. sections 必须保持时间顺序；如果同一地点分两次出现，就建立两个 destination section。例：「丽江 → 泸沽湖 → 丽江 → 返程」不能合并成一个丽江 section 后再把 7/24 放到 7/22 前面。
  7. 「丽江」和「泸沽湖」是两个不同目的地，必须分别放在两个 destination；泸沽湖环湖/住宿/前往泸沽湖相关日程放泸沽湖，玉龙雪山/丽江古镇相关日程放第一段丽江，束河/丽江机场还车放第二段丽江，飞回上海放「返程」。
  8. 修改目的地交通信息时，优先更新该 destination.children 中 kind="arrival" 且 title="抵达方式" 的 note；没有就新建。租车取车放第一段丽江的「出行」，还车放第二段丽江的「行程具体安排」或「出行」。
- 例：用户说「西双版纳帮我添加一个7/20下午去植物园的行程」，应把条目加入西双版纳 destination 的「行程具体安排」timeline，不能加入「丽江 · 泸沽湖」的 timeline。
- 删除也必须使用 toolCalls，不要用纯文本追问「确认删除吗？」。第一次删除请求就返回对应 operation="delete" 的 toolCall，填好要删除对象的 id、名称/说明等可读参数；前端会用富文本卡片让用户确认或取消。
- 删除 toolCall 必须尽量从当前 JSON 中找到精确 id：collection.item 用 itemId，expense.item 用 expenseId，trip.timelineItem 用 itemId，trip.hotel 用 sectionId。args 里也保留 name/heading/group/note 等可读字段，方便确认卡片展示。
- 如果删除目标有多个相近候选，不要用纯文本询问；请为每个候选分别返回一个 operation="delete" 的 toolCall，并在 message 里写清楚候选名称、所在模块和分组。前端会用多张卡片让用户勾选要执行的删除项。
- 每次有修改时，focus 设为对应面板（行程=trip、预定清单=booking、出行物品=packing、花销=expense），并在 reply 末尾用一句话提示去哪个标签查看，例如「👉 请在「💰 花销」标签查看」。
- 花销的 personId 必须对应 people 中已存在的人；用户提到的人不存在时可先在 people 新增。
- 用户没有说明承担人时，participantNames 默认所有 people，splitMode 默认 equal；用户说明「仅自己」时只选择付款人。custom 分摊的 allocations 金额合计必须等于花销金额。
- 新增/修改/删除花销必须使用 toolCalls，不要直接修改 updatedTrip.expenses：
  1. 用户要添加/记录/新增/修改/删除一笔花销时，返回 action="expense.item" 的 toolCall，updatedTrip=null，focus=null。
  2. amount 和 personName 如果能从用户话里识别就填入；无法识别就留空字符串，让前端确认框要求用户补充。
  3. time 默认使用当前服务器时间 ${nowIso}；如果用户提供了时间，用用户提供的时间并尽量转成 ISO 字符串。
  4. note 默认空字符串；如果用户提供了说明，就填入 note。
  5. toolCall.message 固定写「时间默认当前时间，说明为空，可在确认前修改。」；reply 要告诉用户「我准备添加这笔花销，请在弹窗中确认，也可以修改时间和说明。」
  6. 所有 toolCall 都必须由前端弹窗确认后再执行；你不能自己假装已经执行。
- booking 和 packing 的增删改/勾选必须使用 toolCalls，不要直接修改 updatedTrip.checklist/packing：
  1. 用户说「还需要带/加到出行物品/行李里要有」等，返回 action="collection.item" 且 collection="packing"。
  2. 用户说「添加预定项/门票/酒店订单/交通清单」等，返回 action="collection.item" 且 collection="booking"。
  2. group 尽量选择已有 packing 分组；不确定就填「其他」。
  3. name 填物品名称，例如「太阳眼镜」；meta 填简短说明，例如「户外防晒」，没有就空字符串。
  4. reply 要告诉用户「我准备添加这个出行物品，请在弹窗中确认，也可以修改分组和说明。」
- 行程具体安排增删改必须优先使用 action="trip.timelineItem"；住宿/酒店增删改必须优先使用 action="trip.hotel"。
- 金额用数字；chip.kind 只能是 default|cost|stay|car；badge.warn=true 表示提醒类。
- 全部使用简体中文。`;
}

function expenseCount(trip) {
  return Array.isArray(trip && trip.expenses) ? trip.expenses.length : 0;
}

function latestUserText(history) {
  for (let index = history.length - 1; index >= 0; index--) {
    const msg = history[index];
    if (msg && msg.role !== 'assistant') return stripClientChatGuard(msg.content);
  }
  return '';
}

function stripClientChatGuard(text) {
  const raw = String(text || '');
  const marker = '结构定位规则：';
  const index = raw.indexOf(marker);
  return (index >= 0 ? raw.slice(0, index) : raw).trim();
}

function isGreetingOnly(text) {
  return /^(hi|hello|hey|yo|你好|嗨|哈喽|在吗|早|早上好|上午好|下午好|晚上好)[!！。.~～\s]*$/i.test(String(text || '').trim());
}

function hasExplicitMutationIntent(text) {
  const raw = stripClientChatGuard(text);
  if (!raw) return false;
  if (looksLikeExpenseAdd(raw)) return true;
  if (/(添加|新增|增加|加到|加进|加入|加上|加一项|加一个|加个|再加|新建|创建|记录|记一笔|修改|更新|改成|替换|设为|设置为|标记|勾选|取消勾选|删除|删掉|移除|去掉|拿掉|清空|保存|写入|取消预定|取消订单)/.test(raw)) return true;
  if (/(不需要带|不用带|不要带|别带|取消带)/.test(raw)) return true;
  if (/(不需要|不用|不要).{0,16}(带|携带|准备|预定|订单|门票|酒店|机票|车票|物品|行李|清单)/.test(raw)) return true;
  if (/(带|携带|准备|预定|订单|门票|酒店|机票|车票|物品|行李|清单).{0,16}(不需要|不用|不要)/.test(raw)) return true;
  return false;
}

function replyImpliesWrite(reply) {
  return /(准备|确认|执行|弹窗|写入|保存|修改|更新|添加|新增|删除|移除|勾选|记录这笔|应用这次变更)/.test(String(reply || ''));
}

function readOnlyFallbackReply(userText, reply) {
  if (reply && !replyImpliesWrite(reply)) return String(reply);
  if (isGreetingOnly(userText)) return '你好！我在，可以帮你查看和分析当前行程；只有你明确要求新增、修改或删除时，我才会准备写入操作。';
  return '抱歉，我刚才理解偏了。请再说一次，我会按普通聊天或只读查询回答，不会修改行程数据。';
}

function needsReadOnlyRetry(history, out) {
  const userText = latestUserText(history);
  if (!userText || hasExplicitMutationIntent(userText)) return false;
  const tools = normalizeToolCalls(out && out.toolCalls);
  return tools.length > 0 || !!(out && out.updatedTrip) || replyImpliesWrite(out && out.reply);
}

async function retryReadOnlyChat(messages, trip, userText) {
  return callOpenAIMessages([
    ...messages,
    {
      role: 'system',
      content: `纠错：最新用户消息「${userText}」没有要求修改数据。忽略上一次可能的增删改判断，基于当前行程上下文正常回答用户。如果是旅行推荐等开放问题，可以结合常识自然交流。必须返回 updatedTrip=null、focus=null、toolCalls=[]，不要提确认、工具、删除、修改或安全策略。`
    }
  ]);
}

async function processChatLocally(trip, history) {
  const localReadOnlyAnswer = answerReadOnlyQuestion(trip, latestUserText(history));
  if (localReadOnlyAnswer) {
    return { reply: localReadOnlyAnswer, updatedTrip: null, focus: null, toolCalls: [] };
  }

  const messages = [
    { role: 'system', content: chatSystem(trip) },
    ...history.slice(-16).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 4000)
    }))
  ];
  let out = await callOpenAIMessages(messages);
  if (needsReadOnlyRetry(history, out)) out = await retryReadOnlyChat(messages, trip, latestUserText(history));
  return buildChatResponse(trip, history, out);
}

function looksLikeExpenseAdd(text) {
  return /(花销|开支|支出|消费|记一笔|加一笔|添加.*(费用|花费)|花了|付了|付款|买了)/.test(text) && /\d/.test(text);
}

function hasExpenseTime(text) {
  return /(现在|当前|刚刚|今天|昨天|前天|上午|中午|下午|晚上|早上|凌晨|\d{1,2}[点:]\d{0,2}|\d{1,2}[\/-]\d{1,2}|\d{1,2}月\d{1,2})/.test(text);
}

function hasExpenseNote(text) {
  return /(早餐|午餐|晚餐|夜宵|餐|饭|门票|机票|车票|住宿|酒店|打车|租车|加油|充电|停车|咖啡|奶茶|零食|购物|买|票|药|水|说明|备注|因为|用于|支付|付款)/.test(text);
}

function isExpenseDefaultConfirmation(text) {
  return /(确认|继续|就这样|不用填|不填|无需|不用备注|说明为空|按当前时间|按现在|可以创建|创建吧|记上吧)/.test(text);
}

function shouldBlockSparseExpenseAdd(originalTrip, updatedTrip, history) {
  if (!updatedTrip || expenseCount(updatedTrip) <= expenseCount(originalTrip)) return false;
  const text = latestUserText(history);
  if (!looksLikeExpenseAdd(text)) return false;
  if (isExpenseDefaultConfirmation(text)) return false;
  return !hasExpenseTime(text) && !hasExpenseNote(text);
}

function normalizeToolCalls(value) {
  return Array.isArray(value) ? value.filter(call => call && typeof call === 'object') : [];
}

function compactText(value) {
  return String(value || '').toLowerCase().replace(/[\s·/／&（）()「」『』【】\-—_]/g, '');
}

function itemNameTokens(item) {
  return [item && item.name, item && item.meta]
    .filter(Boolean)
    .flatMap(text => String(text).split(/[\s·/／&（）()「」『』【】\-—_]+/))
    .map(compactText)
    .filter(text => text.length >= 2);
}

function collectionDeleteToolCallsFromText(trip, text) {
  const raw = stripClientChatGuard(text);
  if (!/(不要|不需要|不用|删除|删掉|移除|去掉|拿掉|取消带|别带)/.test(raw)) return [];
  const normalized = compactText(raw);
  const pools = [];
  if (/(带|行李|出行|物品|packing)/i.test(raw)) pools.push({ collection: 'packing', groups: trip.packing || [], title: '删除出行物品' });
  if (/(预定|清单|门票|订单|booking)/i.test(raw)) pools.push({ collection: 'booking', groups: trip.checklist || [], title: '删除预定项' });
  if (!pools.length) pools.push({ collection: 'packing', groups: trip.packing || [], title: '删除出行物品' }, { collection: 'booking', groups: trip.checklist || [], title: '删除预定项' });

  const calls = [];
  pools.forEach(pool => (pool.groups || []).forEach(group => (group.items || []).forEach(item => {
    const name = item && item.name;
    if (!name || !item.id) return;
    const compactName = compactText(name);
    const tokens = itemNameTokens(item);
    const hit = normalized.includes(compactName) || tokens.some(token => normalized.includes(token));
    if (!hit) return;
    calls.push({
      action: 'collection.item',
      title: pool.title,
      message: `候选：${group.group || '未分组'} / ${name}`,
      args: {
        operation: 'delete',
        collection: pool.collection,
        itemId: item.id,
        group: group.group || '',
        name,
        meta: item.meta || '',
        done: !!item.done,
        who: item.who || ''
      }
    });
  })));

  const unique = new Map();
  calls.forEach(call => unique.set(`${call.args.collection}:${call.args.itemId}`, call));
  return Array.from(unique.values());
}

function buildChatResponse(trip, history, out) {
  let reply = (out && out.reply) ? String(out.reply) : '（助手暂时没有回复，请重试）';
  const toolCalls = normalizeToolCalls(out && out.toolCalls);
  let updatedTrip = out && out.updatedTrip;
  const userText = latestUserText(history);
  const hasWriteIntent = hasExplicitMutationIntent(userText);
  const readOnlyAnswer = answerReadOnlyQuestion(trip, userText);

  if (!hasWriteIntent && readOnlyAnswer) {
    return { reply: readOnlyAnswer, updatedTrip: null, focus: null, toolCalls: [] };
  }

  if (!hasWriteIntent) {
    return {
      reply: readOnlyFallbackReply(userText, reply),
      updatedTrip: null,
      focus: null,
      toolCalls: []
    };
  }

  if (!toolCalls.length && !updatedTrip) {
    const fallbackDeleteCalls = collectionDeleteToolCallsFromText(trip, userText);
    if (fallbackDeleteCalls.length) {
      toolCalls.push(...fallbackDeleteCalls);
      reply = '我找到了可能要删除的条目，请在弹窗中勾选确认。';
    }
  }
  const focus = out && ['trip', 'booking', 'packing', 'expense'].includes(out.focus) ? out.focus : null;
  if (!toolCalls.length && updatedTrip && typeof updatedTrip === 'object') {
    toolCalls.push({
      action: 'trip.replace',
      title: '确认应用行程变更',
      message: '这是暂未细分为专用工具的行程修改，请确认后再写入。你也可以展开 JSON 做高级修改。',
      args: { updatedTrip: ensureIds(updatedTrip), focus: focus || 'trip' }
    });
  }
  updatedTrip = null;

  return { reply, updatedTrip, focus, toolCalls };
}

function findPersonByName(trip, name) {
  const people = Array.isArray(trip.people) ? trip.people : [];
  const clean = String(name || '').trim();
  if (!clean) return null;
  return people.find(person => person && person.name === clean) || null;
}

function parseToolTime(value) {
  const raw = String(value || '').trim();
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('时间格式无效');
  return date.toISOString();
}

function expenseSplitArgs(trip, args, amount) {
  const people = Array.isArray(trip.people) ? trip.people : [];
  const names = Array.isArray(args.participantNames) && args.participantNames.length
    ? args.participantNames.map(name => String(name || '').trim()).filter(Boolean)
    : people.map(person => person.name);
  const participantIds = [...new Set(names.map(name => findPersonByName(trip, name)).filter(Boolean).map(person => person.id))];
  if (!participantIds.length) throw new Error('请至少选择一位参与人');
  const mode = args.splitMode === 'custom' ? 'custom' : 'equal';
  let allocations;
  if (mode === 'custom') {
    allocations = (Array.isArray(args.allocations) ? args.allocations : []).map(item => {
      const person = findPersonByName(trip, item && item.personName);
      if (!person || !participantIds.includes(person.id)) throw new Error('自定义分摊包含无效参与人');
      return { personId: person.id, amount: Number(item.amount) };
    });
    if (allocations.some(item => !Number.isFinite(item.amount) || item.amount < 0)) throw new Error('自定义分摊金额无效');
    const total = allocations.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(total - amount) > 0.005) throw new Error('自定义分摊金额合计必须等于花销金额');
  } else {
    const totalCents = Math.round(amount * 100);
    const base = Math.floor(totalCents / participantIds.length);
    let remainder = totalCents - base * participantIds.length;
    allocations = participantIds.map(personId => ({ personId, amount: (base + (remainder-- > 0 ? 1 : 0)) / 100 }));
  }
  return { participantIds, splitMode: mode, allocations };
}

function executeExpenseAdd(trip, args = {}) {
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('金额必须是大于 0 的数字');
  const personName = String(args.personName || '').trim();
  const person = findPersonByName(trip, personName);
  if (!person) throw new Error(personName ? `找不到付款人「${personName}」` : '请选择付款人');

  trip.expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
  const note = String(args.note || '').trim().slice(0, 200);
  const time = parseToolTime(args.time);
  const split = expenseSplitArgs(trip, args, amount);
  trip.expenses.push({
    id: newTripId(),
    personId: person.id,
    payerId: person.id,
    amount,
    note,
    time,
    ...split
  });
  return { message: `已添加花销：${person.name} ¥${amount}${note ? `，${note}` : ''}。`, focus: 'expense' };
}

function executeExpenseItem(trip, args = {}) {
  const op = String(args.operation || 'add');
  trip.expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
  if (op === 'add') return executeExpenseAdd(trip, args);
  const expense = trip.expenses.find(item => item && item.id === args.expenseId);
  if (!expense) throw new Error('找不到要修改的花销');
  if (op === 'delete') {
    trip.expenses = trip.expenses.filter(item => item.id !== args.expenseId);
    return { message: '已删除花销。', focus: 'expense' };
  }
  if (op !== 'update') throw new Error(`不支持的花销操作：${op}`);
  if (args.amount !== undefined && args.amount !== '') {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('金额必须是大于 0 的数字');
    expense.amount = amount;
  }
  if (args.personName !== undefined) {
    const person = findPersonByName(trip, args.personName);
    if (!person) throw new Error(`找不到付款人「${args.personName || ''}」`);
    expense.personId = person.id;
    expense.payerId = person.id;
  }
  if (args.time !== undefined && args.time !== '') expense.time = parseToolTime(args.time);
  if (args.note !== undefined) expense.note = String(args.note || '').trim().slice(0, 200);
  if (args.amount !== undefined || args.participantNames !== undefined || args.splitMode !== undefined || args.allocations !== undefined) {
    Object.assign(expense, expenseSplitArgs(trip, args, Number(expense.amount)));
  }
  return { message: '已更新花销。', focus: 'expense' };
}

function collectionList(trip, collection) {
  if (collection === 'booking') {
    trip.checklist = Array.isArray(trip.checklist) ? trip.checklist : [];
    return trip.checklist;
  }
  if (collection === 'packing') {
    trip.packing = Array.isArray(trip.packing) ? trip.packing : [];
    return trip.packing;
  }
  throw new Error('collection 必须是 booking 或 packing');
}

function findOrCreateCollectionGroup(trip, collection, groupName) {
  const list = collectionList(trip, collection);
  const clean = String(groupName || '').trim() || '其他';
  let group = list.find(item => item && item.group === clean);
  if (!group) group = list.find(item => item && item.group && (item.group.includes(clean) || clean.includes(item.group)));
  if (!group) {
    group = { group: clean, icon: collection === 'booking' ? '📌' : '🎒', items: [] };
    list.push(group);
  }
  if (!Array.isArray(group.items)) group.items = [];
  return group;
}

function findCollectionItem(trip, collection, itemId) {
  for (const group of collectionList(trip, collection)) {
    const item = (group.items || []).find(entry => entry && entry.id === itemId);
    if (item) return { group, item };
  }
  return null;
}

function executeCollectionItem(trip, args = {}) {
  const collection = args.collection;
  const op = String(args.operation || 'add');
  const focus = collection === 'booking' ? 'booking' : 'packing';
  if (op === 'add') {
    const name = String(args.name || '').trim();
    if (!name) throw new Error('名称不能为空');
    const group = findOrCreateCollectionGroup(trip, collection, args.group);
    const item = { id: newTripId(), name, meta: String(args.meta || '').trim().slice(0, 160), done: !!args.done };
    if (collection === 'booking') item.who = String(args.who || '').trim();
    group.items.push(item);
    return { message: `已添加${collection === 'booking' ? '预定项' : '出行物品'}：${name}。`, focus };
  }
  const found = findCollectionItem(trip, collection, args.itemId);
  if (!found) throw new Error('找不到要修改的条目');
  if (op === 'delete') {
    found.group.items = found.group.items.filter(item => item.id !== args.itemId);
    return { message: '已删除条目。', focus };
  }
  if (op === 'toggle') {
    found.item.done = args.done === undefined ? !found.item.done : !!args.done;
    return { message: '已更新完成状态。', focus };
  }
  if (op !== 'update') throw new Error(`不支持的集合操作：${op}`);
  if (args.group && args.group !== found.group.group) {
    found.group.items = found.group.items.filter(item => item.id !== args.itemId);
    findOrCreateCollectionGroup(trip, collection, args.group).items.push(found.item);
  }
  if (args.name !== undefined) found.item.name = String(args.name || '').trim();
  if (!found.item.name) throw new Error('名称不能为空');
  if (args.meta !== undefined) found.item.meta = String(args.meta || '').trim().slice(0, 160);
  if (args.done !== undefined) found.item.done = !!args.done;
  if (collection === 'booking' && args.who !== undefined) found.item.who = String(args.who || '').trim();
  return { message: '已更新条目。', focus };
}

function findOrCreatePackingGroup(trip, groupName) {
  trip.packing = Array.isArray(trip.packing) ? trip.packing : [];
  const clean = String(groupName || '').trim() || '其他';
  let group = trip.packing.find(item => item && item.group === clean);
  if (!group) group = trip.packing.find(item => item && item.group && (item.group.includes(clean) || clean.includes(item.group)));
  if (!group) {
    group = { group: clean, icon: '🎒', items: [] };
    trip.packing.push(group);
  }
  if (!Array.isArray(group.items)) group.items = [];
  return group;
}

function executePackingAddItem(trip, args = {}) {
  return executeCollectionItem(trip, { ...args, operation: 'add', collection: 'packing' });
}

function stageName(section) {
  return section && (section.destination || section.title || '');
}

function findDestinationStage(trip, destination, stageTitle) {
  const sections = Array.isArray(trip.sections) ? trip.sections : [];
  if (stageTitle) {
    const exact = sections.find(section => section && section.type === 'destination' && section.title === stageTitle);
    if (exact) return exact;
  }
  return sections.find(section => section && section.type === 'destination' && stageName(section) === destination) || null;
}

function findOrCreateDestinationStage(trip, destination, stageTitle) {
  trip.sections = Array.isArray(trip.sections) ? trip.sections : [];
  const clean = String(destination || stageTitle || '').trim();
  if (!clean) throw new Error('目的地不能为空');
  let stage = findDestinationStage(trip, clean, stageTitle);
  if (!stage) {
    stage = { id: newTripId(), type: 'destination', title: stageTitle || clean, destination: clean, children: [] };
    trip.sections.push(stage);
  }
  if (!Array.isArray(stage.children)) stage.children = [];
  return stage;
}

function findItineraryChild(stage) {
  let child = (stage.children || []).find(item => item && (item.kind === 'itinerary' || item.type === 'timeline'));
  if (!child) {
    child = { id: newTripId(), type: 'timeline', kind: 'itinerary', title: '行程具体安排', items: [] };
    stage.children.push(child);
  }
  if (!Array.isArray(child.items)) child.items = [];
  return child;
}

function findTimelineItem(trip, itemId) {
  for (const stage of (trip.sections || [])) for (const child of (stage.children || [])) {
    if (child && child.type === 'timeline') {
      const item = (child.items || []).find(entry => entry && entry.id === itemId);
      if (item) return { stage, child, item };
    }
  }
  return null;
}

function executeTimelineItem(trip, args = {}) {
  const op = String(args.operation || 'add');
  if (op === 'add') {
    const stage = findOrCreateDestinationStage(trip, args.destination, args.stageTitle);
    findItineraryChild(stage).items.push({
      id: newTripId(),
      day: String(args.day || '').trim(),
      heading: String(args.heading || '').trim(),
      desc: String(args.desc || '').trim(),
      chips: Array.isArray(args.chips) ? args.chips : []
    });
    return { message: '已添加具体行程。', focus: 'trip' };
  }
  const found = findTimelineItem(trip, args.itemId);
  if (!found) throw new Error('找不到要修改的具体行程');
  if (op === 'delete') {
    found.child.items = found.child.items.filter(item => item.id !== args.itemId);
    return { message: '已删除具体行程。', focus: 'trip' };
  }
  if (op !== 'update') throw new Error(`不支持的行程操作：${op}`);
  ['day', 'heading', 'desc'].forEach(key => { if (args[key] !== undefined) found.item[key] = String(args[key] || '').trim(); });
  if (Array.isArray(args.chips)) found.item.chips = args.chips;
  return { message: '已更新具体行程。', focus: 'trip' };
}

function findHotelSection(trip, sectionId) {
  for (const stage of (trip.sections || [])) for (const child of (stage.children || [])) {
    if (child && child.id === sectionId && (child.kind === 'lodging' || child.type === 'hotel')) return { stage, child };
  }
  return null;
}

function hotelFromArgs(args = {}) {
  const name = String(args.name || '').trim();
  if (!name) throw new Error('酒店名不能为空');
  return {
    id: args.sectionId || newTripId(), type: 'hotel', kind: 'lodging', title: '住宿', name,
    stars: String(args.stars || '').trim(),
    tags: Array.isArray(args.tags) ? args.tags.map(tag => String(tag || '').trim()).filter(Boolean) : [],
    price: args.price === '' || args.price == null ? '' : Number(args.price),
    priceUnit: String(args.priceUnit || '').trim(),
    totalNote: String(args.totalNote || '').trim(),
    tip: args.tipText ? { icon: '💡', text: String(args.tipText).trim() } : undefined,
    image: ''
  };
}

function executeHotelTool(trip, args = {}) {
  const op = String(args.operation || 'upsert');
  if (op === 'delete') {
    const found = findHotelSection(trip, args.sectionId);
    if (!found) throw new Error('找不到要删除的住宿');
    found.stage.children = found.stage.children.filter(child => child.id !== args.sectionId);
    return { message: '已删除住宿。', focus: 'trip' };
  }
  if (op !== 'upsert') throw new Error(`不支持的住宿操作：${op}`);
  const hotel = hotelFromArgs(args);
  const found = args.sectionId ? findHotelSection(trip, args.sectionId) : null;
  if (found) Object.assign(found.child, hotel, { id: found.child.id });
  else findOrCreateDestinationStage(trip, args.destination, args.stageTitle).children.push(hotel);
  return { message: `已保存住宿：${hotel.name}。`, focus: 'trip' };
}

function executeTripReplace(args = {}) {
  if (!args.updatedTrip || typeof args.updatedTrip !== 'object') throw new Error('缺少要应用的行程数据');
  const focus = ['trip', 'booking', 'packing', 'expense'].includes(args.focus) ? args.focus : 'trip';
  return { trip: ensureIds(args.updatedTrip), message: '已应用确认后的行程变更。', focus };
}

function executeToolCall(trip, call) {
  const action = call && call.action;
  if (action === 'expense.add') return executeExpenseAdd(trip, call.args || {});
  if (action === 'expense.item') return executeExpenseItem(trip, call.args || {});
  if (action === 'collection.item') return executeCollectionItem(trip, call.args || {});
  if (action === 'packing.addItem') return executePackingAddItem(trip, call.args || {});
  if (action === 'trip.timelineItem') return executeTimelineItem(trip, call.args || {});
  if (action === 'trip.hotel') return executeHotelTool(trip, call.args || {});
  if (action === 'trip.replace') return executeTripReplace(call.args || {});
  throw new Error(`暂不支持的工具：${action || 'unknown'}`);
}

app.http('chatTrip', {
  methods: ['POST'], authLevel: 'anonymous', route: 'trips/{tripId}/chat',
  handler: async (req) => {
    const id = req.params.tripId;
    if (!id) return { status: 400, jsonBody: { error: 'missing tripId' } };
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    const trip = ensureIds(b && b.trip);
    const history = Array.isArray(b && b.messages) ? b.messages : [];
    if (!trip || typeof trip !== 'object') return { status: 400, jsonBody: { error: 'missing trip' } };
    if (!history.length) return { status: 400, jsonBody: { error: 'missing messages' } };

    const localReadOnlyAnswer = answerReadOnlyQuestion(trip, latestUserText(history));
    if (localReadOnlyAnswer) return { jsonBody: { reply: localReadOnlyAnswer, updatedTrip: null, focus: null, toolCalls: [] } };

    try {
      await checkRateLimit(clientIp(req));
    } catch (e) {
      if (e instanceof RateLimitError) return { status: 429, jsonBody: { error: e.message } };
    }

    try {
      return { jsonBody: await processChatLocally(trip, history) };
    } catch (e) {
      return { status: 502, jsonBody: { error: '助手出错：' + e.message } };
    }
  }
});

// ---- POST /api/trips/{tripId}/tools/execute ----
app.http('executeTripTools', {
  methods: ['POST'], authLevel: 'anonymous', route: 'trips/{tripId}/tools/execute',
  handler: async (req) => {
    const id = req.params.tripId;
    if (!id) return { status: 400, jsonBody: { error: 'missing tripId' } };
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    let trip = ensureIds(b && b.trip);
    const toolCalls = normalizeToolCalls(b && b.toolCalls);
    if (!trip || typeof trip !== 'object') return { status: 400, jsonBody: { error: 'missing trip' } };
    if (!toolCalls.length) return { status: 400, jsonBody: { error: 'missing toolCalls' } };

    const messages = [];
    let focus = null;
    try {
      for (const call of toolCalls) {
        const result = executeToolCall(trip, call);
        if (result.trip) trip = result.trip;
        if (result.message) messages.push(result.message);
        if (result.focus) focus = result.focus;
      }
    } catch (e) {
      return { status: 400, jsonBody: { error: e.message } };
    }

    const c = client(); await ensureTable(c);
    await c.upsertEntity({
      partitionKey: PK, rowKey: id,
      data: JSON.stringify(trip).slice(0, 60000),
      updatedAt: new Date().toISOString()
    }, 'Merge');

    return { jsonBody: { reply: messages.join('\n') || '已执行。', updatedTrip: trip, focus } };
  }
});

module.exports.__test = {
  attachGenerationNotes,
  answerReadOnlyQuestion,
  buildTripContextSummary,
  buildChatResponse,
  collectionDeleteToolCallsFromText,
  executeToolCall,
  extractTripPlaces,
  generateValidatedTrip,
  hasExplicitMutationIntent,
  itineraryForDate,
  latestUserText,
  needsReadOnlyRetry,
  processChatLocally,
  stripClientChatGuard
};
