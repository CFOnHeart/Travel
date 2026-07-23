import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { gzipSync, gunzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const tokenPath = path.join(root, '.llm_token_local');
const storageSecretPath = path.join(root, '.storage_local');
const localConfig = JSON.parse(await fs.readFile(path.join(root, 'config', 'environments', 'local.json'), 'utf8'));

function parseEnvFile(text) {
  return Object.fromEntries(String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    const separator = line.indexOf('=');
    return separator < 0 ? ['', ''] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }).filter(([key]) => key));
}

const llmConfig = parseEnvFile(await fs.readFile(tokenPath, 'utf8').catch(() => ''));
const storageConfig = parseEnvFile(await fs.readFile(storageSecretPath, 'utf8').catch(() => ''));
const localStorageConnection = storageConfig.AZURE_STORAGE_CONNECTION_STRING || '';
if ((!llmConfig.API_KEY || !localStorageConnection) && process.env.LOCAL_DEV_SERVER_NO_LISTEN !== '1') {
  throw new Error('缺少本地配置：请检查 .llm_token_local 和 .storage_local。');
}
process.env.AOAI_ENDPOINT = llmConfig.ENDPOINT || 'https://openai-jun-test.openai.azure.com/';
process.env.AOAI_DEPLOYMENT = llmConfig.API_MODEL || 'gpt-5.4';
process.env.AOAI_API_VERSION = llmConfig.API_VERSION || '2024-12-01-preview';
process.env.AOAI_API_KEY = llmConfig.API_KEY || '';

const require = createRequire(import.meta.url);
const { __test } = require('./api/src/functions/trips.js');
const apiRequire = createRequire(path.join(root, 'api', 'package.json'));
const { TableClient } = apiRequire('@azure/data-tables');
const { BlobServiceClient } = apiRequire('@azure/storage-blob');

const localApi = 'http://localhost:7071/api';
const productionTripId = 'yunnan2026';
const TRIPS_TABLE = 'trips';
const ANALYSIS_TABLE = 'expenseAnalysis';
const PROOFS_CONTAINER = 'proofs';

function isWritableLocalTrip(tripId) { return Boolean(tripId); }
function tripClient() { return TableClient.fromConnectionString(localStorageConnection, TRIPS_TABLE); }
function analysisClient() { return TableClient.fromConnectionString(localStorageConnection, ANALYSIS_TABLE); }
function tableClient(tableName) { return TableClient.fromConnectionString(localStorageConnection, tableName); }
async function ensureTable(client) { try { await client.createTable(); } catch { /* already exists */ } }

function tripForStorage(trip) {
  const stored = {
    ...trip,
    expenses: (Array.isArray(trip && trip.expenses) ? trip.expenses : []).map(({ category, categoryConfidence, ...expense }) => expense)
  };
  delete stored.expenseAnalysis;
  return stored;
}

function encodeTripData(trip) {
  const json = JSON.stringify(trip);
  return json.length > 32000
    ? { data: gzipSync(Buffer.from(json, 'utf8')).toString('base64'), dataEncoding: 'gzip-base64' }
    : { data: json, dataEncoding: 'json' };
}

export { encodeTripData, isWritableLocalTrip, localConfig, parseEnvFile, productionTripId, tripForStorage };

async function readLocalTrip(tripId) {
  const client = tripClient(); await ensureTable(client);
  const entity = await client.getEntity('trip', tripId);
  const data = entity.dataEncoding === 'gzip-base64'
    ? gunzipSync(Buffer.from(entity.data, 'base64')).toString('utf8')
    : entity.data;
  return __test.ensureIds(JSON.parse(data));
}

async function saveLocalTrip(tripId, trip) {
  const client = tripClient(); await ensureTable(client);
  const normalized = __test.ensureIds(tripForStorage(trip));
  const encoded = encodeTripData(normalized);
  await client.upsertEntity({ partitionKey: 'trip', rowKey: tripId, ...encoded, updatedAt: new Date().toISOString() }, 'Merge');
  return normalized;
}

async function writeExpenseAnalysis(tripId, classifications) {
  const client = analysisClient(); await ensureTable(client);
  const analyzedAt = new Date().toISOString();
  for (const item of classifications) await client.upsertEntity({ partitionKey: tripId, rowKey: item.id, category: item.category, confidence: item.confidence, analyzedAt }, 'Replace');
  return { analyzedAt };
}

async function applyExpenseAnalysis(tripId, trip) {
  const client = analysisClient(); await ensureTable(client);
  const rows = [];
  for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${String(tripId).replace(/'/g, "''")}'` } })) rows.push(entity);
  if (!rows.length) return trip;
  const byId = new Map(rows.map(item => [String(item.rowKey), item]));
  return {
    ...trip,
    expenses: (Array.isArray(trip.expenses) ? trip.expenses : []).map(expense => {
      const result = byId.get(String(expense.id));
      return result ? { ...expense, category: result.category, categoryConfidence: Number(result.confidence) || 0 } : expense;
    }),
    expenseAnalysis: {
      version: 1,
      categories: __test.EXPENSE_CATEGORIES,
      analyzedAt: rows.reduce((latest, item) => item.analyzedAt > latest ? item.analyzedAt : latest, ''),
      analyzedExpenseCount: rows.length,
      source: 'local-llm'
    }
  };
}

function demoTrip() {
  return {
    meta: {
      title: '本地测试行程',
      subtitle: '聊天意图门禁验证',
      dateLabel: '本地检查模式',
      emoji: ['🧪', '🧭', '✈️']
    },
    sections: [
      {
        id: 'demo-stage-lijiang',
        type: 'destination',
        num: 1,
        title: '丽江',
        destination: '丽江',
        children: [
          { id: 'demo-arrival', type: 'note', kind: 'arrival', title: '抵达方式', text: '本地测试数据：从机场抵达丽江。' },
          {
            id: 'demo-itinerary',
            type: 'timeline',
            kind: 'itinerary',
            title: '行程具体安排',
            items: [
              { id: 'demo-item-1', day: '7/21 周二', heading: '丽江古镇', desc: '本地测试数据，用来验证聊天不会误触发写入。', chips: [{ text: '丽江', kind: 'default' }] }
            ]
          }
        ]
      }
    ],
    checklist: [
      {
        group: '交通',
        icon: '✈️',
        items: [
          { id: 'demo-booking-1', name: '返程机票', meta: '丽江 → 上海，未完成', done: false, who: '' },
          { id: 'demo-booking-2', name: '去程机票', meta: '上海 → 丽江，已完成', done: true, who: 'Jun' }
        ]
      },
      {
        group: '每天住宿',
        icon: '🏨',
        items: [
          { id: 'demo-booking-3', name: '丽江住宿', meta: '未完成', done: false, who: '' }
        ]
      }
    ],
    packing: [
      {
        group: '车载用品',
        icon: '🚗',
        items: [
          { id: 'demo-packing-1', name: '车载手机支架', meta: '自驾导航' }
        ]
      }
    ],
    people: [{ id: 'demo-person-1', name: 'Jun' }],
    expenses: [],
    photos: []
  };
}

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    ...headers
  });
  res.end(isBuffer ? body : body == null ? '' : String(body));
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8' });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const apiServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const url = new URL(req.url, localApi);

    if (url.pathname === '/api/trips/generate' && req.method === 'POST') {
      const body = await readJson(req);
      const text = String(body.text || '').trim();
      if (text.length < 10) return json(res, 400, { error: '行程描述太短' });
      const trip = await __test.generateValidatedTrip(text);
      const tripId = `localtest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await saveLocalTrip(tripId, trip);
      return json(res, 200, { tripId, trip, localBackend: true, localStorage: localConfig.storageAccount });
    }

    if (url.pathname === '/api/upload' && req.method === 'POST') {
      const body = await readJson(req);
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(body.dataUrl || '');
      if (!match) return json(res, 400, { error: 'bad dataUrl' });
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 5 * 1024 * 1024) return json(res, 413, { error: 'image too large' });
      const container = BlobServiceClient.fromConnectionString(localStorageConnection).getContainerClient(PROOFS_CONTAINER);
      await container.createIfNotExists({ access: 'blob' });
      const safeId = String(body.id || 'img').replace(/[^a-z0-9-]/gi, '');
      const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
      const blob = container.getBlockBlobClient(`${safeId}-${Date.now()}.${ext}`);
      await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: match[1], blobCacheControl: 'public, max-age=31536000, immutable' } });
      return json(res, 200, { url: blob.url, bytes: buffer.length, localBackend: true });
    }

    if (url.pathname === '/api/state') {
      const client = tableClient('checklist'); await ensureTable(client);
      if (req.method === 'GET') {
        const items = {};
        for await (const entity of client.listEntities({ queryOptions: { filter: "PartitionKey eq 'yn'" } })) items[entity.rowKey] = { done: Boolean(entity.done), who: entity.who || '', note: entity.note || '', img: entity.img || '' };
        return json(res, 200, { items, localBackend: true });
      }
      if (req.method === 'POST') {
        const body = await readJson(req);
        if (!body.id) return json(res, 400, { error: 'missing id' });
        await client.upsertEntity({ partitionKey: 'yn', rowKey: String(body.id), done: Boolean(body.done), who: String(body.who || '').slice(0, 200), note: String(body.note || '').slice(0, 2000), img: String(body.img || '').slice(0, 500) }, 'Replace');
        return json(res, 200, { ok: true, localBackend: true });
      }
    }

    if (url.pathname === '/api/expenses') {
      const client = tableClient('expenses'); await ensureTable(client);
      if (req.method === 'GET') {
        const items = [];
        for await (const entity of client.listEntities({ queryOptions: { filter: "PartitionKey eq 'yn'" } })) items.push({ id: entity.rowKey, person: entity.person || '', amount: Number(entity.amount) || 0, note: entity.note || '', time: entity.time || '' });
        return json(res, 200, { items, localBackend: true });
      }
      if (req.method === 'POST') {
        const body = await readJson(req);
        const amount = Number(body.amount);
        if (!body.person || !Number.isFinite(amount)) return json(res, 400, { error: 'bad expense' });
        const id = body.id ? String(body.id) : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        await client.upsertEntity({ partitionKey: 'yn', rowKey: id, person: String(body.person), amount, note: String(body.note || '').slice(0, 300), time: String(body.time || new Date().toISOString()).slice(0, 40) }, 'Replace');
        return json(res, 200, { id, localBackend: true });
      }
    }

    const legacyExpenseDelete = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (legacyExpenseDelete && ['DELETE', 'POST'].includes(req.method)) {
      const client = tableClient('expenses'); await ensureTable(client);
      await client.deleteEntity('yn', decodeURIComponent(legacyExpenseDelete[1])).catch(() => {});
      return json(res, 200, { ok: true, localBackend: true });
    }
    const match = url.pathname.match(/^\/api\/trips\/([^/]+)(?:\/(chat|save|tools\/execute|expenses\/classify))?$/);
    if (!match) return json(res, 404, { error: 'local dev proxy: route not found' });
    const tripId = decodeURIComponent(match[1]);
    const action = match[2] || '';

    if (tripId === 'local-demo' && !action && req.method === 'GET') {
      return json(res, 200, { trip: demoTrip() });
    }

    if (!action && req.method === 'GET') {
      try {
        const trip = await applyExpenseAnalysis(tripId, await readLocalTrip(tripId));
        return json(res, 200, { trip, localBackend: true, localStorage: localConfig.storageAccount });
      } catch (error) {
        if (error && error.statusCode === 404) return json(res, 404, { error: 'not found' });
        throw error;
      }
    }

    if (action === 'chat' && req.method === 'POST') {
      const body = await readJson(req);
      const result = await __test.processChatLocally(body.trip, body.messages || []);
      result.localBackend = true;
      return json(res, 200, result);
    }

    if (action === 'expenses/classify' && req.method === 'POST') {
      const body = await readJson(req);
      if (!body.trip || typeof body.trip !== 'object') return json(res, 400, { error: 'missing trip' });
      const expenses = Array.isArray(body.trip.expenses) ? body.trip.expenses : [];
      const classifications = await __test.classifyExpensesWithLLM(expenses);
      const classifiedById = new Map(classifications.map(item => [item.id, item]));
      const stored = await writeExpenseAnalysis(tripId, classifications);
      const nextTrip = {
        ...body.trip,
        expenses: expenses.map(expense => {
          const result = classifiedById.get(String(expense.id));
          return result ? { ...expense, category: result.category, categoryConfidence: result.confidence } : expense;
        }),
        expenseAnalysis: {
          version: 1,
          categories: __test.EXPENSE_CATEGORIES,
          analyzedAt: stored.analyzedAt,
          analyzedExpenseCount: classifications.length,
          source: 'local-llm'
        }
      };
      return json(res, 200, { trip: nextTrip, classifications, localBackend: true, localStorage: localConfig.storageAccount });
    }

    if (action === 'tools/execute') {
      const body = await readJson(req);
      let trip = __test.ensureIds(body.trip);
      const toolCalls = Array.isArray(body.toolCalls) ? body.toolCalls : [];
      if (!trip || !toolCalls.length) return json(res, 400, { error: 'missing trip or toolCalls' });
      const messages = [];
      let focus = null;
      try {
        for (const call of toolCalls) {
          const result = __test.executeToolCall(trip, call);
          if (result.trip) trip = result.trip;
          if (result.message) messages.push(result.message);
          if (result.focus) focus = result.focus;
        }
      } catch (error) { return json(res, 400, { error: error.message }); }
      await saveLocalTrip(tripId, trip);
      return json(res, 200, { reply: messages.join('\n') || '已执行。', updatedTrip: trip, focus, localBackend: true });
    }

    if (action === 'save') {
      const body = await readJson(req);
      if (!body.trip || typeof body.trip !== 'object') return json(res, 400, { error: 'missing trip' });
      await saveLocalTrip(tripId, body.trip);
      return json(res, 200, { ok: true, localBackend: true, localStorage: localConfig.storageAccount });
    }

    return json(res, 405, { error: 'local dev proxy: method not allowed' });
  } catch (error) {
    const message = error && error.message ? error.message : String(error || 'Unknown local server error');
    return json(res, 500, { error: message || 'Unknown local server error' });
  }
});

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml']
]);

const staticServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:5173');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/app/trip.html';
    if (pathname.endsWith('/')) pathname += 'index.html';
    if (pathname.split('/').some(part => part.startsWith('.'))) return send(res, 404, 'Not found');
    const filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) return send(res, 403, 'Forbidden');
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, body, { 'content-type': types.get(ext) || 'application/octet-stream' });
  } catch (error) {
    send(res, 404, 'Not found');
  }
});

if (process.env.LOCAL_DEV_SERVER_NO_LISTEN !== '1') {
  apiServer.listen(7071, () => console.log(`Local API proxy: ${localApi}`));
  staticServer.listen(5173, () => {
    console.log('Local frontend: http://localhost:5173/app/trip-collections/?trip=yunnan2026');
    console.log(`Local Storage: ${localConfig.storageAccount} (${localConfig.resourceGroup})`);
    console.log(`Local LLM: ${process.env.AOAI_DEPLOYMENT} (${process.env.AOAI_API_VERSION})${llmConfig.API_KEY ? '' : ' — .llm_token_local is incomplete'}`);
  });
}
