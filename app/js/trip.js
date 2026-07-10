/** 行程页主逻辑：加载、渲染、Tab 切换、勾选保存、分享、编辑。 */
import { getTrip, saveTrip } from './api.js';
import { RECENT_KEY } from './config.js';
import {
  renderHero, renderSections, renderChecklistPanel, renderPackingPanel
} from './render.js';
import { initEditor, setEditorData } from './editor.js';

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
  document.title = (trip.meta && trip.meta.title) || '我的行程';
  wireChecklist();
}

// ---- Tab 切换 ----
function initTabs() {
  $$('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.mtab;
      $$('.main-tab').forEach(b => b.classList.toggle('active', b === btn));
      ['trip', 'booking', 'packing'].forEach(p =>
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
  showOverlay('加载行程中…');
  try {
    trip = await getTrip(tripId);
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
