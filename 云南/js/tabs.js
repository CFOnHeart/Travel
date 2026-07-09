/**
 * 侧边栏 Tab、主内容 Tab、移动端菜单按钮的切换逻辑。
 */
import { $, $$ } from './utils.js';
import { loadExpenses } from './expenses.js';

function initSidebarTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      const tab = btn.dataset.tab;
      $('#panel-booking').classList.toggle('active', tab === 'booking');
      $('#panel-packing').classList.toggle('active', tab === 'packing');
    });
  });
}

function initMainTabs() {
  $$('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.main-tab').forEach(b => b.classList.toggle('active', b === btn));
      const tab = btn.dataset.mtab;
      $('#mpanel-trip').classList.toggle('active', tab === 'trip');
      $('#mpanel-expense').classList.toggle('active', tab === 'expense');
      if (tab === 'expense') loadExpenses();
    });
  });
}

function initMenuButton() {
  const btn = $('#menuBtn');
  if (btn) btn.addEventListener('click', () => $('.sidebar').classList.toggle('open'));
}

export function initTabs() {
  initSidebarTabs();
  initMainTabs();
  initMenuButton();
}
