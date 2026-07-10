/** 行程页主逻辑：加载、渲染、Tab 切换、勾选保存、分享、编辑。 */
import { getTrip, saveTrip } from './api.js';
import { RECENT_KEY } from './config.js';
import {
  renderHero, renderSections, renderChecklistPanel, renderPackingPanel, renderExpensePanel
} from './render.js';
import { initEditor, setEditorData } from './editor.js';

const PANELS = ['trip', 'booking', 'packing', 'expense'];
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const params = new URLSearchParams(location.search);
const tripId = params.get('trip');

let trip = null;
let saveTimer = null;

function showOverlay(text) {
  $('#loadText').textContent = text;
  $('#loadOverlay').classList.add('open');
}
function hideOverlay() { $('#loadOverlay').classList.remove('open'); }

function renderAll() {
  $('#heroSlot').innerHTML = renderHero(trip.meta || {});
  $('#mpanel-trip').innerHTML = renderSections(trip.sections || []);
  $('#mpanel-booking').innerHTML = renderChecklistPanel(trip);
  $('#mpanel-packing').innerHTML = renderPackingPanel(trip);
  renderExpense();
  document.title = (trip.meta && trip.meta.title) || '我的行程';
  wireChecklist();
}

function renderExpense() {
  $('#mpanel-expense').innerHTML = renderExpensePanel(trip);
  wireExpense();
}

// ---- Tab 切换 ----
function initTabs() {
  $$('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.mtab;
      $$('.main-tab').forEach(b => b.classList.toggle('active', b === btn));
      PANELS.forEach(p =>
        $('#mpanel-' + p).classList.toggle('active', p === tab));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ---- 勾选 / 完成人 ----
function findItem(id) {
  for (const g of (trip.checklist || [])) for (const it of (g.items || [])) if (it.id === id) return it;
  for (const g of (trip.packing || [])) for (const it of (g.items || [])) if (it.id === id) return it;
  return null;
}

function wireChecklist() {
  $$('.todo .box').forEach(box => {
    box.addEventListener('click', () => {
      const row = box.closest('.todo');
      const it = findItem(row.dataset.id);
      if (!it) return;
      it.done = !it.done;
      // 局部刷新对应面板
      if (row.dataset.pack) $('#mpanel-packing').innerHTML = renderPackingPanel(trip);
      else $('#mpanel-booking').innerHTML = renderChecklistPanel(trip);
      wireChecklist();
      queueSave();
    });
  });
  $$('.todo .who-input').forEach(input => {
    input.addEventListener('input', () => {
      const it = findItem(input.closest('.todo').dataset.id);
      if (!it) return;
      it.who = input.value;
      queueSave();
    });
  });
}

// ---- 花销（动态人员）----
let expModalPerson = null;

function wireExpense() {
  const addP = $('#addPersonBtn');
  if (addP) addP.addEventListener('click', () => {
    trip.people = trip.people || [];
    trip.people.push({ id: genId(), name: '同行人' + (trip.people.length + 1) });
    renderExpense();
    queueSave();
    const inputs = $$('.person-name');
    if (inputs.length) { const last = inputs[inputs.length - 1]; last.focus(); last.select(); }
  });

  $$('.person-name').forEach(inp => {
    inp.addEventListener('input', () => {
      const pid = inp.closest('.person-card').dataset.pid;
      const p = (trip.people || []).find(x => x.id === pid);
      if (p) { p.name = inp.value; queueSave(); }
    });
  });

  $$('.person-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.closest('.person-card').dataset.pid;
      if (!confirm('删除该人员及其所有花销记录？')) return;
      trip.people = (trip.people || []).filter(x => x.id !== pid);
      trip.expenses = (trip.expenses || []).filter(e => e.personId !== pid);
      renderExpense();
      queueSave();
    });
  });

  $$('.add-exp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      expModalPerson = btn.closest('.person-card').dataset.pid;
      openExpModal();
    });
  });

  $$('.exp-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const eid = btn.closest('.exp-item').dataset.eid;
      trip.expenses = (trip.expenses || []).filter(e => e.id !== eid);
      renderExpense();
      queueSave();
    });
  });
}

function openExpModal() {
  const p = (trip.people || []).find(x => x.id === expModalPerson);
  $('#expPerson').textContent = p ? ('为「' + (p.name || '') + '」记一笔') : '';
  $('#expAmount').value = '';
  $('#expNote').value = '';
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $('#expTime').value = now.toISOString().slice(0, 16);
  $('#expModal').classList.add('open');
  $('#expAmount').focus();
}
function closeExpModal() { $('#expModal').classList.remove('open'); }

function initExpenseModal() {
  $('#expCancel').addEventListener('click', closeExpModal);
  $('#expModal').addEventListener('click', e => { if (e.target.id === 'expModal') closeExpModal(); });
  $('#expSave').addEventListener('click', () => {
    const amount = Number($('#expAmount').value);
    if (!isFinite(amount) || amount <= 0) { $('#expAmount').focus(); return; }
    trip.expenses = trip.expenses || [];
    trip.expenses.push({
      id: genId(),
      personId: expModalPerson,
      amount,
      note: $('#expNote').value.trim().slice(0, 200),
      time: $('#expTime').value || new Date().toISOString()
    });
    closeExpModal();
    renderExpense();
    queueSave();
  });
}

// ---- 云端保存（防抖）----
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await saveTrip(tripId, trip); } catch (e) { console.warn('保存失败', e); }
  }, 700);
}

// ---- 分享 ----
function initShare() {
  $('#shareBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const b = $('#shareBtn'); const old = b.textContent;
      b.textContent = '✅ 已复制'; setTimeout(() => b.textContent = old, 1500);
    } catch { alert('复制失败，请手动复制地址栏链接'); }
  });
}

// ---- 最近访问（本地）----
function rememberRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const title = (trip.meta && trip.meta.title) || '未命名行程';
    const sub = (trip.meta && trip.meta.subtitle) || '';
    const next = [{ tripId, title, sub, at: Date.now() }, ...list.filter(x => x.tripId !== tripId)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

// ---- 编辑保存 ----
async function onEditorSave(next) {
  trip = next;
  renderAll();
  rememberRecent();
  showOverlay('保存中…');
  try { await saveTrip(tripId, trip); } finally { hideOverlay(); }
}

async function init() {
  if (!tripId) { location.replace('index.html'); return; }
  initTabs();
  initShare();
  initEditor(onEditorSave);
  initExpenseModal();
  showOverlay('加载行程中…');
  try {
    trip = await getTrip(tripId);
    trip.people = trip.people || [];
    trip.expenses = trip.expenses || [];
    setEditorData(trip);
    renderAll();
    rememberRecent();
  } catch (e) {
    $('#tripRoot').innerHTML = `<div class="home-wrap"><div class="gen-card"><h2 style="color:#c0561f;">加载失败</h2><p>${e.message}</p><p><a class="tool-btn" href="index.html">返回首页</a></p></div></div>`;
  } finally {
    hideOverlay();
  }
}

init();
