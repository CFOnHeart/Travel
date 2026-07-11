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
  "sections": [  // 有序的行程内容块，按时间/逻辑排列，num 从 1 递增
    { "type": "flight", "num": 1, "title": "去程航班",
      "date": "7月17日", "weekday": "周五", "flightNo": "KY3122",
      "from": { "code": "PVG", "name": "上海浦东", "time": "19:15" },
      "to":   { "code": "JHG", "name": "西双版纳", "time": "当晚" },
      "price": 800, "unit": "/人", "priceLabel": "机票参考价",
      "badges": [ { "text": "✅ 含行李托运", "warn": false } ] },
    { "type": "hotel", "num": 2, "title": "西双版纳住宿（7/17–7/21 · 4晚）",
      "name": "温德姆至尊酒店", "stars": "★★★★★ · 豪华大床房",
      "tags": ["室内恒温泳池", "2024新店"],
      "price": 475, "priceUnit": "/ 晚", "totalNote": "4晚合计 · 人均 ≈ ¥950",
      "tip": { "icon": "🩱", "text": "记得带泳衣泳镜！" }, "image": "" },
    { "type": "car", "num": 4, "title": "机场租车 · 4天自驾", "icon": "🚙",
      "model": "小鹏 G7（意向车型）", "desc": "7/21 取车 · 7/25 还车",
      "price": 250, "priceUnit": "/ 天",
      "tags": ["租期 4 天", "含保险"], "totalNote": "≈ ¥1300 总价", "subNote": "人均 ≈ ¥450" },
    { "type": "timeline", "num": 5, "title": "详细行程", "items": [
      { "day": "7/21 周二 · 抵达日", "heading": "玉龙雪山 → 丽江古镇",
        "desc": "白天玉龙雪山，傍晚逛古镇并入住。",
        "chips": [ { "text": "🏔️ 玉龙雪山", "kind": "default" }, { "text": "🏨 古镇 ≈¥300/间", "kind": "stay" } ] } ] },
    { "type": "costTable", "num": 6, "title": "人均费用概览",
      "rows": [ { "item": "去程机票", "note": "KY3122", "amount": "¥800" } ],
      "total": { "item": "已知合计", "note": "不含餐饮", "amount": "≈ ¥3232" } },
    { "type": "note", "num": 7, "title": "备注", "text": "一段自由文字说明。" }
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

// 给每个 checklist / packing item 补一个稳定 id（前端勾选用）
function ensureIds(trip) {
  let n = 0;
  const stamp = () => 'i' + (Date.now().toString(36)) + (n++).toString(36);
  (trip.checklist || []).forEach(g => (g.items || []).forEach(it => { if (!it.id) it.id = stamp(); if (typeof it.done !== 'boolean') it.done = false; if (typeof it.who !== 'string') it.who = ''; }));
  (trip.packing || []).forEach(g => (g.items || []).forEach(it => { if (!it.id) it.id = stamp(); }));
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
      trip = await callOpenAI(text);
    } catch (e) {
      return { status: 502, jsonBody: { error: '解析失败：' + e.message } };
    }
    trip = ensureIds(trip);
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
      return { jsonBody: { trip: JSON.parse(e.data) } };
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
function chatSystem(trip) {
  return `你是「行程助手」，帮助用户用自然语言修改一份旅行行程。下面是当前行程的完整 JSON（含所有 id）：
${JSON.stringify(trip)}

行程结构说明：
- meta: { title, subtitle, dateLabel, emoji[], template }
- sections[]: 行程内容块，type ∈ flight|hotel|car|timeline|costTable|note
- checklist[]: 预定清单分组 { group, icon, items:[{id,name,meta,done,who}] }
- packing[]: 出行物品分组 { group, icon, items:[{id,name,meta}] }
- people[]: 花销同行人 [{id,name}]
- expenses[]: 花销 [{id,personId,amount,note,time}]

你可以帮用户对以上任意部分做「增、删、改、查」。

输出必须是严格 JSON（不要 markdown，不要多余文字）：
{
  "reply": "给用户的中文回复",
  "updatedTrip": <修改后的完整行程 JSON> 或 null,
  "focus": "trip" | "booking" | "packing" | "expense" | null
}

规则：
- 「查」类问题（询问、汇总、统计）只回答 reply，updatedTrip=null，focus=null。
- 需要修改时，返回**完整**的 updatedTrip（保留所有未改动字段和所有 id，不要丢数据）；新增条目请生成新的字符串 id。
- **删除必须二次确认**：用户第一次要求删除时不要执行，reply 中复述要删除的内容并询问「确认删除吗？」，updatedTrip=null；只有当用户在随后消息中明确确认（如「确认」「是的」「删吧」）时，才返回执行删除后的 updatedTrip。
- 每次有修改时，focus 设为对应面板（行程=trip、预定清单=booking、出行物品=packing、花销=expense），并在 reply 末尾用一句话提示去哪个标签查看，例如「👉 请在「💰 花销」标签查看」。
- 花销的 personId 必须对应 people 中已存在的人；用户提到的人不存在时可先在 people 新增。
- 金额用数字；chip.kind 只能是 default|cost|stay|car；badge.warn=true 表示提醒类。
- 全部使用简体中文。`;
}

app.http('chatTrip', {
  methods: ['POST'], authLevel: 'anonymous', route: 'trips/{tripId}/chat',
  handler: async (req) => {
    const id = req.params.tripId;
    if (!id) return { status: 400, jsonBody: { error: 'missing tripId' } };
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    const trip = b && b.trip;
    const history = Array.isArray(b && b.messages) ? b.messages : [];
    if (!trip || typeof trip !== 'object') return { status: 400, jsonBody: { error: 'missing trip' } };
    if (!history.length) return { status: 400, jsonBody: { error: 'missing messages' } };

    try {
      await checkRateLimit(clientIp(req));
    } catch (e) {
      if (e instanceof RateLimitError) return { status: 429, jsonBody: { error: e.message } };
    }

    const messages = [
      { role: 'system', content: chatSystem(trip) },
      ...history.slice(-16).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 4000)
      }))
    ];

    let out;
    try {
      out = await callOpenAIMessages(messages);
    } catch (e) {
      return { status: 502, jsonBody: { error: '助手出错：' + e.message } };
    }

    const reply = (out && out.reply) ? String(out.reply) : '（助手暂时没有回复，请重试）';
    let updatedTrip = out && out.updatedTrip;
    if (updatedTrip && typeof updatedTrip === 'object') {
      updatedTrip = ensureIds(updatedTrip);
      // 持久化
      const c = client(); await ensureTable(c);
      await c.upsertEntity({
        partitionKey: PK, rowKey: id,
        data: JSON.stringify(updatedTrip).slice(0, 60000),
        updatedAt: new Date().toISOString()
      }, 'Merge');
    } else {
      updatedTrip = null;
    }
    const focus = out && ['trip', 'booking', 'packing', 'expense'].includes(out.focus) ? out.focus : null;

    return { jsonBody: { reply, updatedTrip, focus } };
  }
});
