/**
 * 侧边栏右上角的同步状态提示。
 */
import { $ } from './utils.js';

const el = $('#syncStatus');

export function setStatus(kind, text) {
  el.className = 'sync-status ' + (kind || '');
  el.textContent = text || '';
}

/** 短暂显示一条提示后自动清除（若期间未被别的状态覆盖）。 */
export function flashStatus(text, ms = 1500) {
  setStatus('', text);
  setTimeout(() => { if (el.textContent === text) setStatus('', ''); }, ms);
}
