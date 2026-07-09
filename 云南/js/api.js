/**
 * 云端 API 封装（Azure Functions）。
 */
import { API_BASE } from './config.js';

async function asJson(res) {
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function postJson(path, body) {
  return fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(asJson);
}

// ---- 清单 ----
export const fetchState = () => fetch(API_BASE + '/state', { cache: 'no-store' }).then(asJson);
export const saveItem = (payload) => postJson('/state', payload);

/** 上传图片，返回可访问的 URL。 */
export async function uploadImage(id, dataUrl) {
  const { url } = await postJson('/upload', { id, dataUrl });
  return url;
}

// ---- 花销 ----
export const fetchExpenses = () => fetch(API_BASE + '/expenses', { cache: 'no-store' }).then(asJson);
export const addExpense = (payload) => postJson('/expenses', payload);
export const removeExpense = (id) =>
  fetch(API_BASE + '/expenses/' + encodeURIComponent(id), { method: 'DELETE' }).then(asJson);
