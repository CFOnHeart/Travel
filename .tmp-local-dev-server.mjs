import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { __test } = require('./api/src/functions/trips.js');

const cloudApi = 'https://func-yntravel-ue8266.azurewebsites.net/api';
const localApi = 'http://localhost:7071/api';
const root = __dirname;
const localTrips = new Map();

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

async function proxyJson(targetUrl, init = {}) {
  const resp = await fetch(targetUrl, init);
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

const apiServer = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const url = new URL(req.url, localApi);

    if (url.pathname === '/api/trips/generate' && req.method === 'POST') {
      const body = await readJson(req);
      const text = String(body.text || '').trim();
      if (text.length < 10) return json(res, 400, { error: '行程描述太短' });
      const generated = await __test.generateValidatedTrip(text);
      const tripId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      localTrips.set(tripId, generated.trip);
      return json(res, 200, {
        tripId,
        trip: generated.trip,
        stages: generated.stages,
        localBackend: true,
      });
    }

    const match = url.pathname.match(/^\/api\/trips\/([^/]+)(?:\/(chat|save|tools\/execute))?$/);
    if (!match) return json(res, 404, { error: 'local dev proxy: route not found' });
    const tripId = decodeURIComponent(match[1]);
    const action = match[2] || '';

    if (tripId === 'local-demo' && !action && req.method === 'GET') {
      return json(res, 200, { trip: demoTrip() });
    }

    if (localTrips.has(tripId) && !action && req.method === 'GET') {
      return json(res, 200, { trip: localTrips.get(tripId) });
    }

    if (!action && req.method === 'GET') {
      const proxied = await proxyJson(`${cloudApi}/trips/${encodeURIComponent(tripId)}`);
      return json(res, proxied.status, proxied.data);
    }

    if (action === 'chat' && req.method === 'POST') {
      const body = await readJson(req);
      const result = await __test.processChatLocally(body.trip, body.messages || []);
      result.localBackend = true;
      return json(res, 200, result);
    }

    if (action === 'tools/execute') {
      return json(res, 409, { error: '本地检查模式已禁用写入执行。请只验证是否会弹出确认框；需要真实写入时再切回正式后端。' });
    }

    if (action === 'save') {
      if (localTrips.has(tripId)) {
        const body = await readJson(req);
        if (!body.trip || typeof body.trip !== 'object') return json(res, 400, { error: 'missing trip' });
        localTrips.set(tripId, body.trip);
        return json(res, 200, { ok: true, localBackend: true });
      }
      return json(res, 409, { error: '本地检查模式已禁用保存，避免写入线上数据。' });
    }

    return json(res, 405, { error: 'local dev proxy: method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message || String(error) });
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
    const filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) return send(res, 403, 'Forbidden');
    let body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    // Inject runtime API base for app pages so config.js picks up local API without file edits.
    if (ext === '.html' && filePath.startsWith(path.join(root, 'app'))) {
      const safeBase = JSON.stringify(localApi).replace(/</g, '\\u003c');
      const inject = `<script>window.__TRAVEL_API_BASE__=${safeBase};</script>`;
      body = Buffer.from(body.toString('utf8').replace(/<head(\s[^>]*)?>/i, `<head$1>${inject}`), 'utf8');
    }
    send(res, 200, body, { 'content-type': types.get(ext) || 'application/octet-stream' });
  } catch (error) {
    send(res, 404, 'Not found');
  }
});

apiServer.listen(7071, () => console.log(`Local API proxy: ${localApi}`));
staticServer.listen(5173, () => console.log('Local frontend: http://localhost:5173/app/trip.html'));
