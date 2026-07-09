/**
 * 清单本地状态：内存 state + localStorage 缓存（离线兜底）。
 */
import { STORE_KEY } from './config.js';

export const state = loadCache();

function loadCache() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}

/** 取某个 item 的可变状态，不存在则用默认值初始化。 */
export function itemState(item) {
  if (!state[item.id]) {
    state[item.id] = { done: item.done, who: item.who || '', note: '', img: '' };
  }
  return state[item.id];
}

/** 写入 localStorage 缓存。 */
export function cacheLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { /* 忽略配额错误 */ }
}
