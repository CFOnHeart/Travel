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
