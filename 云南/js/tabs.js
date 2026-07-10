/**
 * 主内容 Tab 切换逻辑（行程 / 预定清单 / 出行物品 / 花销）。
 */
import { $, $$ } from './utils.js';
import { loadExpenses } from './expenses.js';

const PANELS = ['trip', 'booking', 'packing', 'expense'];

function initMainTabs() {
  $$('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.mtab;
      $$('.main-tab').forEach(b => b.classList.toggle('active', b === btn));
      PANELS.forEach(p => $('#mpanel-' + p).classList.toggle('active', p === tab));
      if (tab === 'expense') loadExpenses();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

export function initTabs() {
  initMainTabs();
}

