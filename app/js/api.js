/** 后端调用封装：生成 / 读取 / 保存行程。 */
import { API_BASE } from './config.js';
import { CHAT_STRUCTURE_GUARD, normalizeTripStructure } from './structure.js';

export async function generateTrip(text) {
  const resp = await fetch(`${API_BASE}/trips/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `生成失败（${resp.status}）`);
  if (data.trip) data.trip = normalizeTripStructure(data.trip);
  return data; // { tripId, trip }
}

export async function getTrip(tripId) {
  const resp = await fetch(`${API_BASE}/trips/${encodeURIComponent(tripId)}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `读取失败（${resp.status}）`);
  return normalizeTripStructure(data.trip);
}

export async function saveTrip(tripId, trip) {
  const resp = await fetch(`${API_BASE}/trips/${encodeURIComponent(tripId)}/save`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trip: normalizeTripStructure(trip) })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `保存失败（${resp.status}）`);
  return data;
}

export async function chatTrip(tripId, trip, messages) {
  const guardedMessages = [...messages];
  if (guardedMessages.length) {
    const last = guardedMessages[guardedMessages.length - 1];
    if (last && last.role === 'user') last.content = `${last.content}\n\n${CHAT_STRUCTURE_GUARD}`;
  }
  const resp = await fetch(`${API_BASE}/trips/${encodeURIComponent(tripId)}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trip: normalizeTripStructure(trip), messages: guardedMessages })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `助手出错（${resp.status}）`);
  if (data.updatedTrip) data.updatedTrip = normalizeTripStructure(data.updatedTrip);
  return data; // { reply, updatedTrip, focus }
}

export async function executeTripTools(tripId, trip, toolCalls) {
  const resp = await fetch(`${API_BASE}/trips/${encodeURIComponent(tripId)}/tools/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trip: normalizeTripStructure(trip), toolCalls })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `执行失败（${resp.status}）`);
  if (data.updatedTrip) data.updatedTrip = normalizeTripStructure(data.updatedTrip);
  return data;
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
