/** 行程页主逻辑：加载、渲染、Tab 切换、勾选保存、分享、编辑。 */
import { getTrip, saveTrip } from './api.js';
import { RECENT_KEY } from './config.js';
import {
  renderHero, renderSections, renderChecklistPanel, renderPackingPanel, esc
} from './render.js';
import { initEditor, setEditorData } from './editor.js';
import { initChat } from './chat.js';

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
  const people = trip.people = trip.people || [];
  const expenses = trip.expenses = trip.expenses || [];
  const grand = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  $('#mpanel-expense').innerHTML = `
    <div class="exp-head">
      <h2>💰 花销统计</h2>
      <p class="sub">纵轴是时间轴，看得到每笔花销的时间走势</p>
      <div class="exp-grand">总花销 ¥${fmtMoney(grand)}</div>
    </div>
    <div class="exp-hint">💡 先「＋ 添加人员」，再为每人「＋ 添加」记一笔。纵轴为时间轴，可查看花钱的时间走势；把鼠标移到看板上还能看到该时刻的<b>累计花销</b>；每列顶部显示每人的<b>总花销</b>。</div>
    <div class="exp-toolbar"><button class="tool-btn primary" id="addPersonBtn" type="button">＋ 添加人员</button></div>
    <div id="expBoard"></div>`;

  $('#addPersonBtn').addEventListener('click', addPerson);

  if (!people.length) {
    $('#expBoard').innerHTML = `
      <div class="exp-empty-big"><div class="ee-icon">🧑‍🤝‍🧑</div>
      <p class="ee-title">还没有添加同行人员</p>
      <p class="ee-sub">点击上方「＋ 添加人员」，添加后即可为每个人记录花销，并在时间轴上查看走势与累计。</p></div>`;
    return;
  }
  buildBoard(people, expenses);
}

function addPerson() {
  trip.people = trip.people || [];
  trip.people.push({ id: genId(), name: '同行人' + (trip.people.length + 1) });
  renderExpense();
  queueSave();
  const inputs = $$('#expBoard .person-name');
  if (inputs.length) { const last = inputs[inputs.length - 1]; last.focus(); last.select(); }
}

// ---- 时间轴看板（动态人员，纵轴=时间，每人一列泳道）----
const AXIS = { height: 560, top: 10, ticks: 6 };
function fmtMoney(n) { return (Math.round((Number(n) || 0) * 100) / 100).toString(); }
function fmtTime(t) { const d = new Date(t); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function fmtTick(t) { const d = new Date(t); const p = n => String(n).padStart(2, '0'); return `${p(d.getMonth() + 1)}-${p(d.getDate())}<br>${p(d.getHours())}:${p(d.getMinutes())}`; }

function buildBoard(people, expenses) {
  const board = $('#expBoard');
  board.innerHTML = '';
  const cols = `66px repeat(${people.length}, minmax(140px, 1fr))`;

  const totals = {};
  people.forEach(p => { totals[p.id] = expenses.filter(e => e.personId === p.id).reduce((s, e) => s + (Number(e.amount) || 0), 0); });

  // 头部行：轴角占位 + 每人一列（姓名/总额/添加/删除）
  const headRow = document.createElement('div');
  headRow.className = 'exp-head-row';
  headRow.style.gridTemplateColumns = cols;
  headRow.appendChild(document.createElement('div'));
  people.forEach(p => {
    const head = document.createElement('div');
    head.className = 'p-head';
    head.innerHTML =
      `<div class="p-name"><input class="person-name" placeholder="姓名"></div>` +
      `<div class="p-total">¥${fmtMoney(totals[p.id])} <small>总花销</small></div>` +
      `<div style="display:flex;gap:6px;">` +
      `<button class="add-exp" type="button" style="flex:1;">＋ 添加</button>` +
      `<button class="person-del" type="button" title="删除人员" style="background:none;border:1px solid var(--line);border-radius:9px;cursor:pointer;padding:0 8px;">🗑️</button>` +
      `</div>`;
    const nameInput = head.querySelector('.person-name');
    nameInput.value = p.name || '';
    nameInput.addEventListener('input', () => { p.name = nameInput.value; queueSave(); });
    head.querySelector('.add-exp').addEventListener('click', () => { expModalPerson = p.id; openExpModal(); });
    head.querySelector('.person-del').addEventListener('click', () => {
      if (!confirm('删除该人员及其所有花销记录？')) return;
      trip.people = trip.people.filter(x => x.id !== p.id);
      trip.expenses = (trip.expenses || []).filter(e => e.personId !== p.id);
      renderExpense();
      queueSave();
    });
    headRow.appendChild(head);
  });
  board.appendChild(headRow);

  if (expenses.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'exp-empty';
    empty.textContent = '还没有花销记录，点击某人的「＋ 添加」记一笔。';
    board.appendChild(empty);
    return;
  }

  // 统一时间轴范围
  const times = expenses.map(e => new Date(e.time).getTime()).filter(t => !isNaN(t));
  const min = Math.min(...times);
  let max = Math.max(...times);
  if (!(max > min)) max = min + 3600000;

  const H = AXIS.height, top0 = AXIS.top, N = AXIS.ticks;
  const usable = H - 60;
  const posOf = t => top0 + ((t - min) / (max - min)) * usable;

  const body = document.createElement('div');
  body.className = 'exp-body';
  body.style.gridTemplateColumns = cols;
  body.style.height = H + 'px';

  // 横向刻度线 + 左侧时间刻度
  const gridlines = document.createElement('div');
  gridlines.className = 'exp-gridlines';
  const axis = document.createElement('div');
  axis.className = 'exp-axis';
  for (let i = 0; i < N; i++) {
    const t = min + (max - min) * i / (N - 1);
    const y = posOf(t);
    const line = document.createElement('div');
    line.className = 'gl'; line.style.top = y + 'px';
    gridlines.appendChild(line);
    const tick = document.createElement('div');
    tick.className = 'tick'; tick.style.top = y + 'px';
    tick.innerHTML = fmtTick(t);
    axis.appendChild(tick);
  }
  body.appendChild(gridlines);
  body.appendChild(axis);

  // 每人一条泳道，按时间比例定位
  people.forEach(p => {
    const lane = document.createElement('div');
    lane.className = 'exp-lane';
    expenses.filter(e => e.personId === p.id)
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .forEach(e => {
        const t = new Date(e.time).getTime();
        if (isNaN(t)) return;
        const item = document.createElement('div');
        item.className = 'exp-dot-item';
        item.style.top = posOf(t) + 'px';
        item.innerHTML =
          '<span class="dot"></span>' +
          '<div class="e-card"><span class="e-del" title="删除">✕</span>' +
          `<div class="e-amt">¥${fmtMoney(e.amount)}</div>` +
          (e.note ? `<div class="e-note">${esc(e.note)}</div>` : '') +
          `<div class="e-time">🕒 ${esc(fmtTime(e.time))}</div></div>`;
        item.querySelector('.e-del').addEventListener('click', () => {
          trip.expenses = (trip.expenses || []).filter(x => x.id !== e.id);
          renderExpense();
          queueSave();
        });
        lane.appendChild(item);
      });
    body.appendChild(lane);
  });

  board.appendChild(body);

  // 悬停累计游标
  const hoverLine = document.createElement('div');
  hoverLine.className = 'exp-hover-line';
  const hoverTotal = document.createElement('div');
  hoverTotal.className = 'exp-hover-total';
  body.appendChild(hoverLine);
  body.appendChild(hoverTotal);

  const points = expenses
    .map(e => ({ y: posOf(new Date(e.time).getTime()), amount: Number(e.amount) || 0 }))
    .filter(pt => !isNaN(pt.y))
    .sort((a, b) => a.y - b.y);

  const hide = () => { hoverLine.style.display = 'none'; hoverTotal.style.display = 'none'; };
  body.addEventListener('mousemove', ev => {
    const my = ev.clientY - body.getBoundingClientRect().top;
    let snap = null;
    for (const pt of points) { if (pt.y <= my) snap = pt; else break; }
    if (!snap) { hide(); return; }
    const cumulative = points.reduce((s, pt) => s + (pt.y <= snap.y ? pt.amount : 0), 0);
    hoverLine.style.top = snap.y + 'px';
    hoverTotal.style.top = snap.y + 'px';
    hoverTotal.textContent = '累计 ¥' + fmtMoney(cumulative);
    hoverLine.style.display = 'block';
    hoverTotal.style.display = 'block';
  });
  body.addEventListener('mouseleave', hide);
}

// ---- Tab 切换 ----
function switchTab(tab) {
  $$('.main-tab').forEach(b => b.classList.toggle('active', b.dataset.mtab === tab));
  PANELS.forEach(p => $('#mpanel-' + p).classList.toggle('active', p === tab));
}

function initTabs() {
  $$('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.mtab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ---- 助手更新：无刷新应用并保存 ----
function applyChatUpdate(updatedTrip, focus) {
  trip = updatedTrip;
  applyTemplate(trip.meta && trip.meta.template);
  setEditorData(trip);
  renderAll();
  rememberRecent();
  if (focus) switchTab(focus);
  queueSave();
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

// ---- 花销弹窗 ----
let expModalPerson = null;

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

// ---- 模板 / 风格切换 ----
const TEMPLATES = ['resort', 'ocean', 'sunset', 'minimal'];

function applyTemplate(name) {
  const tpl = TEMPLATES.includes(name) ? name : 'resort';
  document.body.classList.remove(...TEMPLATES.map(t => 'tpl-' + t));
  document.body.classList.add('tpl-' + tpl);
  $$('#tplMenu button').forEach(b => b.classList.toggle('active', b.dataset.tpl === tpl));
}

function initTemplateSwitch() {
  const btn = $('#tplBtn'), menu = $('#tplMenu');
  btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', () => menu.classList.remove('open'));
  menu.addEventListener('click', e => e.stopPropagation());
  $$('#tplMenu button').forEach(b => {
    b.addEventListener('click', () => {
      const name = b.dataset.tpl;
      trip.meta = trip.meta || {};
      trip.meta.template = name;
      applyTemplate(name);
      menu.classList.remove('open');
      queueSave();
    });
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
  applyTemplate(trip.meta && trip.meta.template);
  renderAll();
  rememberRecent();
  showOverlay('保存中…');
  try { await saveTrip(tripId, trip); } finally { hideOverlay(); }
}

async function init() {
  if (!tripId) { location.replace('index.html'); return; }
  initTabs();
  initShare();
  initTemplateSwitch();
  initEditor(onEditorSave);
  initExpenseModal();
  showOverlay('加载行程中…');
  try {
    trip = await getTrip(tripId);
    trip.people = trip.people || [];
    trip.expenses = trip.expenses || [];
    applyTemplate(trip.meta && trip.meta.template);
    setEditorData(trip);
    renderAll();
    rememberRecent();
    initChat({ tripId, getTrip: () => trip, applyUpdate: applyChatUpdate });
  } catch (e) {
    $('#tripRoot').innerHTML = `<div class="home-wrap"><div class="gen-card"><h2 style="color:#c0561f;">加载失败</h2><p>${e.message}</p><p><a class="tool-btn" href="index.html">返回首页</a></p></div></div>`;
  } finally {
    hideOverlay();
  }
}

init();
