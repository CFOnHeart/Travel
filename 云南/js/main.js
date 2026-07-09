/**
 * 应用入口：初始化各模块、绑定刷新与自动同步、首次渲染。
 */
import { SYNC_INTERVAL_MS } from './config.js';
import { $ } from './utils.js';
import { render, loadFromServer } from './checklist.js';
import { initAttachmentModal, isAttachmentOpen } from './attachmentModal.js';
import { initLightbox } from './lightbox.js';
import { initExpenses } from './expenses.js';
import { initTabs } from './tabs.js';

function init() {
  initLightbox();
  initAttachmentModal();
  initExpenses();
  initTabs();

  // 手动刷新
  $('#refreshBtn').addEventListener('click', loadFromServer);

  // 自动同步：切回页面时刷新 + 定时轮询（弹窗打开时不打扰）
  window.addEventListener('focus', () => { if (!isAttachmentOpen()) loadFromServer(); });
  setInterval(() => {
    if (!isAttachmentOpen() && document.visibilityState === 'visible') loadFromServer();
  }, SYNC_INTERVAL_MS);

  render();          // 先用本地缓存渲染
  loadFromServer();  // 再从云端拉取最新
}

init();
