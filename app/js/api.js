/** 后端调用封装：生成 / 读取 / 保存行程。 */
import { API_BASE } from './config.js';

export async function generateTrip(text) {
  const resp = await fetch(`${API_BASE}/trips/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `生成失败（${resp.status}）`);
  return data; // { tripId, trip }
}

export async function getTrip(tripId) {
  const resp = await fetch(`${API_BASE}/trips/${encodeURIComponent(tripId)}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `读取失败（${resp.status}）`);
  return data.trip;
}

export async function saveTrip(tripId, trip) {
  const resp = await fetch(`${API_BASE}/trips/${encodeURIComponent(tripId)}/save`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trip })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `保存失败（${resp.status}）`);
  return data;
}

export async function chatTrip(tripId, trip, messages) {
  const resp = await fetch(`${API_BASE}/trips/${encodeURIComponent(tripId)}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trip, messages })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `助手出错（${resp.status}）`);
  return data; // { reply, updatedTrip, focus }
}

/** 上传预定清单条目的图片凭证，返回可访问的 blob URL。 */
export async function uploadImage(id, dataUrl) {
  const resp = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, dataUrl })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `上传失败（${resp.status}）`);
  return data.url;
}
