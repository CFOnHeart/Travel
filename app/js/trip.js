/** 行程页主逻辑：加载、渲染、Tab 切换、勾选保存、分享、编辑。 */
import { getTrip, saveTrip, uploadImage } from './api.js';
import { RECENT_KEY } from './config.js';
import {
  renderHero, renderSections, renderChecklistPanel, renderPackingPanel, esc
} from './render.js?v=figma-travel-20260715';
import { initEditor, setEditorData } from './editor.js';
import { initChat } from './chat.js';
import { initPhotos, renderPhotosPanel } from './photos.js';
import { expenseLedger, normalizeExpense, settlementTransfers, spreadTimelinePositions } from './expense-model.js';

const PANELS = ['trip', 'booking', 'packing', 'expense', 'photos'];
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
  $('#mpanel-photos').innerHTML = renderPhotosPanel(trip);
  document.title = (trip.meta && trip.meta.title) || '我的行程';
  wireChecklist();
}

function renderExpense() {
  const people = trip.people = trip.people || [];
  const expenses = trip.expenses = trip.expenses || [];
  const ledger = expenseLedger(people, expenses);
  const selectedId = people.some(person => person.id === trip.expenseViewerId) ? trip.expenseViewerId : (people[0] && people[0].id);
  trip.expenseViewerId = selectedId || '';
  const selected = ledger.stats[selectedId] || { paid: 0, owed: 0, balance: 0 };
  $('#mpanel-expense').innerHTML = `
    <div class="exp-head">
      <h2>💰 花销统计</h2>
      <p class="sub">同时记录谁付款、谁承担，以及每个人最终应该收付的金额</p>
    </div>
    <div class="exp-viewer-row">
      <label for="expenseViewer">当前查看人</label>
      <select id="expenseViewer">${people.map(person => `<option value="${esc(person.id)}" ${person.id === selectedId ? 'selected' : ''}>${esc(person.name || '未命名')}</option>`).join('')}</select>
      <button class="tool-btn primary" id="addPersonBtn" type="button">＋ 添加人员</button>
      <button class="tool-btn" id="addExpenseBtn" type="button" ${people.length ? '' : 'disabled'}>＋ 记一笔</button>
    </div>
    <div class="exp-summary-grid">
      ${summaryCard('总支出', ledger.total, '全部已记录消费')}
      ${summaryCard('我的实际付款', selected.paid, '实际垫付金额')}
      ${summaryCard('我的应承担', selected.owed, '参与订单中的份额')}
      ${summaryCard(selected.balance >= 0 ? '我的应收' : '我的应付', Math.abs(selected.balance), selected.balance >= 0 ? '其他人应还给我' : '我需要还给其他人', selected.balance >= 0 ? 'positive' : 'negative')}
    </div>
    <div class="exp-hint">💡 历史花销未设置承担人时，默认只由付款人自己承担；点击时间序列订单或表格中的「编辑」可补充实际参与人。</div>
    <div class="exp-view-tabs" role="tablist">
      <button class="active" type="button" data-exp-view="timeline">时间序列</button>
      <button type="button" data-exp-view="tables">表格明细</button>
    </div>
    <div id="expTimelineView" class="exp-view-panel active"><div id="expBoard"></div></div>
    <div id="expTablesView" class="exp-view-panel"></div>`;

  $('#addPersonBtn').addEventListener('click', addPerson);
  $('#addExpenseBtn').addEventListener('click', () => { expModalPerson = selectedId; openExpModal(); });
  if ($('#expenseViewer')) $('#expenseViewer').addEventListener('change', event => { trip.expenseViewerId = event.target.value; renderExpense(); });
  $$('.exp-view-tabs button').forEach(button => button.addEventListener('click', () => switchExpenseView(button.dataset.expView)));

  if (!people.length) {
    $('#expBoard').innerHTML = `
      <div class="exp-empty-big"><div class="ee-icon">🧑‍🤝‍🧑</div>
      <p class="ee-title">还没有添加同行人员</p>
      <p class="ee-sub">点击上方「＋ 添加人员」，添加后即可为每个人记录花销，并在时间轴上查看走势与累计。</p></div>`;
    return;
  }
  buildBoard(people, ledger.rows);
  buildExpenseTables(people, ledger);
}

function summaryCard(label, value, hint, tone = '') {
  return `<article class="exp-summary-card ${tone}"><span>${label}</span><strong>¥${fmtMoney(value)}</strong><small>${hint}</small></article>`;
}

function switchExpenseView(view) {
  $$('.exp-view-tabs button').forEach(button => button.classList.toggle('active', button.dataset.expView === view));
  $('#expTimelineView').classList.toggle('active', view === 'timeline');
  $('#expTablesView').classList.toggle('active', view === 'tables');
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
const AXIS = { height: 560, top: 10, ticks: 6, cardGap: 92 };
function fmtMoney(n) { return (Math.round((Number(n) || 0) * 100) / 100).toString(); }
function fmtTime(t) { const d = new Date(t); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function fmtTick(t) { const d = new Date(t); const p = n => String(n).padStart(2, '0'); return `${p(d.getMonth() + 1)}-${p(d.getDate())}<br>${p(d.getHours())}:${p(d.getMinutes())}`; }

function buildBoard(people, expenses) {
  const board = $('#expBoard');
  board.innerHTML = '';
  const cols = `66px repeat(${people.length}, minmax(140px, 1fr))`;

  const totals = {};
  people.forEach(p => { totals[p.id] = expenses.filter(e => e.payerId === p.id).reduce((s, e) => s + (Number(e.amount) || 0), 0); });

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
      `<div class="p-total">¥${fmtMoney(totals[p.id])} <small>实际付款</small></div>` +
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
      trip.expenses = (trip.expenses || []).filter(e => (e.payerId || e.personId) !== p.id).map(e => ({ ...e, participantIds: (e.participantIds || []).filter(id => id !== p.id), allocations: (e.allocations || []).filter(a => a.personId !== p.id) }));
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

  const maxLaneItems = Math.max(1, ...people.map(person => expenses.filter(expense => expense.payerId === person.id).length));
  const H = Math.max(AXIS.height, maxLaneItems * AXIS.cardGap + 70), top0 = AXIS.top, N = AXIS.ticks;
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
  let maxVisualTop = H - 60;
  people.forEach(p => {
    const lane = document.createElement('div');
    lane.className = 'exp-lane';
    const laneExpenses = expenses.filter(e => e.payerId === p.id).sort((a, b) => new Date(a.time) - new Date(b.time));
    const visualPositions = spreadTimelinePositions(laneExpenses.map(e => posOf(new Date(e.time).getTime())), AXIS.cardGap);
    laneExpenses.forEach((e, expenseIndex) => {
        const t = new Date(e.time).getTime();
        if (isNaN(t)) return;
        const item = document.createElement('div');
        item.className = 'exp-dot-item';
        const visualTop = visualPositions[expenseIndex];
        maxVisualTop = Math.max(maxVisualTop, visualTop);
        item.style.top = visualTop + 'px';
        const participantNames = e.allocations.map(allocation => (people.find(person => person.id === allocation.personId) || {}).name).filter(Boolean);
        item.innerHTML =
          '<span class="dot"></span>' +
          `<button class="e-edit" type="button" title="编辑${esc(e.note || '这笔花销')}">编辑</button>` +
          '<div class="e-card"><button class="e-del" type="button" title="删除">✕</button>' +
          `<div class="e-amt">¥${fmtMoney(e.amount)}</div>` +
          (e.note ? `<div class="e-note">${esc(e.note)}</div>` : '') +
          `<div class="e-shares">承担：${esc(participantNames.join('、') || '待确认')}</div>` +
          `<div class="e-time">🕒 ${esc(fmtTime(e.time))}</div></div>`;
        item.querySelector('.e-del').addEventListener('click', () => {
          trip.expenses = (trip.expenses || []).filter(x => x.id !== e.id);
          renderExpense();
          queueSave();
        });
        item.querySelector('.e-edit').addEventListener('click', () => openExpModal(e.id));
        item.querySelector('.e-card').addEventListener('click', event => {
          if (!event.target.closest('.e-del')) openExpModal(e.id);
        });
        lane.appendChild(item);
      });
    body.appendChild(lane);
  });
  body.style.height = Math.max(H, maxVisualTop + AXIS.cardGap) + 'px';

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

function buildExpenseTables(people, ledger) {
  const names = Object.fromEntries(people.map(person => [person.id, person.name || '未命名']));
  const chronological = [...ledger.rows].sort((a, b) => new Date(a.time) - new Date(b.time));
  const detailRows = chronological.map(expense => `<tr>
    <td>${esc(fmtTime(expense.time))}</td><td>${esc(expense.note || '未填写说明')}</td>
    <td>${esc(names[expense.payerId] || '未知')}</td>
    <td>${expense.allocations.map(item => `${esc(names[item.personId] || '未知')} ¥${fmtMoney(item.amount)}`).join('<br>')}</td>
    <td class="money">¥${fmtMoney(expense.amount)}</td><td><button class="expense-edit-btn" type="button" data-expense-id="${esc(expense.id)}">编辑</button></td>
  </tr>`).join('');
  const personTables = people.map(person => {
    const stat = ledger.stats[person.id];
    const rows = stat.orders.map(order => `<tr><td>${esc(fmtTime(order.expense.time))}</td><td class="expense-order-cell"><span>${esc(order.expense.note || '未填写说明')}</span><button class="expense-edit-btn" type="button" data-expense-id="${esc(order.expense.id)}">编辑</button></td><td class="money">¥${fmtMoney(order.expense.amount)}</td><td>${esc(names[order.expense.payerId] || '未知')}</td><td class="money">¥${fmtMoney(order.share)}</td></tr>`).join('');
    return `<section class="person-exp-table"><header><div><span>个人账单</span><h3>${esc(person.name || '未命名')}</h3></div><div class="person-exp-totals"><b>实际付款 ¥${fmtMoney(stat.paid)}</b><b>实际花销 ¥${fmtMoney(stat.owed)}</b></div></header>
      <div class="exp-table-scroll"><table><thead><tr><th>时间</th><th>订单</th><th>订单金额</th><th>付款人</th><th>自己承担</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty-cell">尚未参与任何订单</td></tr>'}</tbody></table></div></section>`;
  }).join('');
  const transfers = settlementTransfers(people, ledger.rows).map(item => `<li><b>${esc(names[item.fromId])}</b><span>支付给</span><b>${esc(names[item.toId])}</b><strong>¥${fmtMoney(item.amount)}</strong></li>`).join('');
  $('#expTablesView').innerHTML = `<section class="expense-table-card"><header><span>全部流水</span><h3>按时间顺序</h3></header><div class="exp-table-scroll"><table><thead><tr><th>时间</th><th>消费</th><th>付款人</th><th>承担人与金额</th><th>总额</th><th></th></tr></thead><tbody>${detailRows || '<tr><td colspan="6" class="empty-cell">还没有花销记录</td></tr>'}</tbody></table></div></section>${personTables}<section class="expense-table-card settlement-card"><header><span>建议结算</span><h3>最少转账方案</h3></header><ul>${transfers || '<li class="settled">当前所有人的账目已平衡</li>'}</ul></section>`;
  $$('#expTablesView .expense-edit-btn').forEach(button => button.addEventListener('click', () => openExpModal(button.dataset.expenseId)));
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
  // 预定清单条目的「📎 附件」（完成人 / 说明 / 图片凭证）
  $$('#mpanel-booking .todo .attach-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const it = findItem(btn.closest('.todo').dataset.id);
      if (it) openAttachModal(it);
    });
  });
}

// ---- 花销弹窗 ----
let expModalPerson = null;
let editingExpenseId = null;

function openExpModal(expenseId = null) {
  const people = trip.people || [];
  editingExpenseId = expenseId;
  const source = expenseId ? (trip.expenses || []).find(item => item.id === expenseId) : null;
  const expense = source ? normalizeExpense(source, people) : null;
  const payerId = expense ? expense.payerId : expModalPerson;
  const participantIds = expense ? expense.participantIds : people.map(person => person.id);
  $('#expTitle').textContent = expense ? '编辑花销' : '记一笔';
  $('#expPerson').textContent = expense && !source.participantIds && !source.allocations ? '旧数据默认由付款人自己承担，可在这里修改' : '记录付款人与实际承担人';
  $('#expPayer').innerHTML = people.map(person => `<option value="${esc(person.id)}" ${person.id === payerId ? 'selected' : ''}>${esc(person.name || '未命名')}</option>`).join('');
  $('#expParticipants').innerHTML = people.map(person => `<label><input type="checkbox" value="${esc(person.id)}" ${participantIds.includes(person.id) ? 'checked' : ''}> <span>${esc(person.name || '未命名')}</span></label>`).join('');
  $('#expAmount').value = expense ? expense.amount : '';
  $('#expNote').value = expense ? (expense.note || '') : '';
  $(`input[name="expSplitMode"][value="${expense ? expense.splitMode : 'equal'}"]`).checked = true;
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $('#expTime').value = expense ? toLocalDateTime(expense.time) : now.toISOString().slice(0, 16);
  renderExpenseSplitEditor(expense && expense.splitMode === 'custom' ? expense.allocations : null);
  $('#expModal').classList.add('open');
  $('#expAmount').focus();
}
function closeExpModal() { $('#expModal').classList.remove('open'); }

function selectedExpenseParticipants() {
  return $$('#expParticipants input:checked').map(input => input.value);
}

function currentSplitMode() {
  return ($('input[name="expSplitMode"]:checked') || {}).value || 'equal';
}

function renderExpenseSplitEditor(initialAllocations = null) {
  const ids = selectedExpenseParticipants();
  const people = trip.people || [];
  const amount = Number($('#expAmount').value) || 0;
  const custom = currentSplitMode() === 'custom';
  const holder = $('#expCustomSplits');
  holder.hidden = !custom;
  if (custom) {
    const previous = initialAllocations ? Object.fromEntries(initialAllocations.map(item => [item.personId, item.amount])) : Object.fromEntries($$('#expCustomSplits input').map(input => [input.dataset.personId, input.value]));
    holder.innerHTML = ids.map(id => {
      const person = people.find(item => item.id === id);
      return `<label><span>${esc((person && person.name) || '未命名')}</span><input type="number" min="0" step="0.01" data-person-id="${esc(id)}" value="${esc(previous[id] || '')}" placeholder="0.00"></label>`;
    }).join('');
    $$('#expCustomSplits input').forEach(input => input.addEventListener('input', updateExpenseSplitSummary));
  }
  const summary = $('#expSplitSummary');
  if (!ids.length) {
    summary.textContent = '请至少选择一位参与人。';
    summary.classList.add('invalid');
  } else if (!custom) {
    summary.textContent = amount > 0 ? `平均分摊：${ids.length} 人，每人约 ¥${fmtMoney(amount / ids.length)}` : `将由 ${ids.length} 位参与人平均分摊`;
    summary.classList.remove('invalid');
  }
  else updateExpenseSplitSummary();
}

function updateExpenseSplitSummary() {
  if (currentSplitMode() !== 'custom') { renderExpenseSplitEditor(); return; }
  const amount = Number($('#expAmount').value) || 0;
  const assigned = $$('#expCustomSplits input').reduce((sum, input) => sum + (Number(input.value) || 0), 0);
  const remaining = Math.round((amount - assigned) * 100) / 100;
  const summary = $('#expSplitSummary');
  summary.textContent = remaining === 0 && amount > 0 ? `分摊完成：合计 ¥${fmtMoney(assigned)}` : `已分配 ¥${fmtMoney(assigned)}，还需分配 ¥${fmtMoney(remaining)}`;
  summary.classList.toggle('invalid', remaining !== 0 || amount <= 0);
}

function expenseAllocations(amount, participantIds, mode) {
  if (mode === 'custom') return $$('#expCustomSplits input').map(input => ({ personId: input.dataset.personId, amount: Number(input.value) || 0 }));
  return normalizeExpense({ amount, payerId: $('#expPayer').value, participantIds }, trip.people || []).allocations;
}

function toLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function initExpenseModal() {
  $('#expCancel').addEventListener('click', closeExpModal);
  $('#expModal').addEventListener('click', e => { if (e.target.id === 'expModal') closeExpModal(); });
  $('#expAmount').addEventListener('input', () => currentSplitMode() === 'custom' ? updateExpenseSplitSummary() : renderExpenseSplitEditor());
  $('#expParticipants').addEventListener('change', () => renderExpenseSplitEditor());
  $$('input[name="expSplitMode"]').forEach(input => input.addEventListener('change', () => renderExpenseSplitEditor()));
  $('#expSave').addEventListener('click', () => {
    const amount = Number($('#expAmount').value);
    if (!isFinite(amount) || amount <= 0) { $('#expAmount').focus(); return; }
    const participantIds = selectedExpenseParticipants();
    if (!participantIds.length) { $('#expSplitSummary').textContent = '请至少选择一位参与人。'; return; }
    const splitMode = currentSplitMode();
    const allocations = expenseAllocations(amount, participantIds, splitMode);
    const allocated = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const invalidAllocation = allocations.some(item => !Number.isFinite(item.amount) || item.amount < 0);
    if (invalidAllocation || Math.abs(allocated - amount) > 0.005) {
      const summary = $('#expSplitSummary');
      updateExpenseSplitSummary();
      summary.textContent = invalidAllocation
        ? '每位参与人的承担金额必须是大于或等于 0 的数字。'
        : `无法保存：参与人承担金额合计 ¥${fmtMoney(allocated)}，必须等于订单总价 ¥${fmtMoney(amount)}。`;
      summary.classList.add('invalid');
      const firstInvalid = $$('#expCustomSplits input').find(input => !Number.isFinite(Number(input.value)) || Number(input.value) < 0);
      (firstInvalid || $('#expCustomSplits input'))?.focus();
      return;
    }
    const payerId = $('#expPayer').value;
    trip.expenses = trip.expenses || [];
    const nextExpense = {
      id: genId(),
      personId: payerId,
      payerId,
      amount,
      participantIds,
      splitMode,
      allocations,
      note: $('#expNote').value.trim().slice(0, 200),
      time: $('#expTime').value || new Date().toISOString()
    };
    if (editingExpenseId) {
      const index = trip.expenses.findIndex(item => item.id === editingExpenseId);
      if (index >= 0) trip.expenses[index] = { ...trip.expenses[index], ...nextExpense, id: editingExpenseId };
    } else trip.expenses.push(nextExpense);
    closeExpModal();
    renderExpense();
    queueSave();
  });
}

// ---- 预定清单「附件」弹窗（完成人 / 文字说明 / 图片凭证）----
let attachItem = null;       // 当前编辑的清单条目
let attachPreview = null;    // 预览图（已存 URL 或新 dataURL）；null 表示无图
let attachIsNew = false;     // 预览是否为待上传的新图

function openLightbox(src) { $('#lightboxImg').src = src; $('#lightbox').classList.add('open'); }

// 用 canvas 压缩图片，回调返回 base64 dataURL
function downscale(file, cb, maxDim = 1000, quality = 0.7) {
  const img = new Image(), reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(c.toDataURL('image/jpeg', quality));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function renderAttachPreview() {
  const p = $('#mPreview');
  if (!attachPreview) { p.innerHTML = ''; return; }
  p.innerHTML = `<img src="${attachPreview}" alt="预览"><br><span class="rm">✕ 移除图片</span>`;
  p.querySelector('img').addEventListener('click', () => openLightbox(attachPreview));
  p.querySelector('.rm').addEventListener('click', () => { attachPreview = null; attachIsNew = false; renderAttachPreview(); });
}

function openAttachModal(item) {
  attachItem = item;
  attachPreview = item.img || null;
  attachIsNew = false;
  $('#mTitle').textContent = item.name || '附件';
  $('#mMeta').textContent = item.meta || '';
  $('#mWho').value = item.who || '';
  $('#mNote').value = item.note || '';
  $('#mFile').value = '';
  renderAttachPreview();
  $('#attachModal').classList.add('open');
}
function closeAttachModal() { $('#attachModal').classList.remove('open'); }

function initAttachModal() {
  $('#mDrop').addEventListener('click', () => $('#mFile').click());
  $('#mFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    downscale(f, dataUrl => { attachPreview = dataUrl; attachIsNew = true; renderAttachPreview(); });
  });
  $('#mCancel').addEventListener('click', closeAttachModal);
  $('#attachModal').addEventListener('click', e => { if (e.target.id === 'attachModal') closeAttachModal(); });
  $('#lightbox').addEventListener('click', () => $('#lightbox').classList.remove('open'));
  $('#mSave').addEventListener('click', async () => {
    if (!attachItem) return;
    const btn = $('#mSave'); const old = btn.textContent;
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      const it = attachItem;
      let img = it.img || '';
      if (attachPreview === null) img = '';                             // 移除了图片
      else if (attachIsNew) img = await uploadImage(it.id, attachPreview); // 新图上传
      it.who = $('#mWho').value;
      it.note = $('#mNote').value;
      it.img = img;
      closeAttachModal();
      $('#mpanel-booking').innerHTML = renderChecklistPanel(trip);
      wireChecklist();
      queueSave();
    } catch (e) {
      alert('保存失败：' + e.message + '\n请检查网络后重试。');
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
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
  initAttachModal();
  showOverlay('加载行程中…');
  try {
    trip = await getTrip(tripId);
    trip.people = trip.people || [];
    trip.expenses = trip.expenses || [];
    trip.photos = trip.photos || [];
    applyTemplate(trip.meta && trip.meta.template);
    setEditorData(trip);
    renderAll();
    rememberRecent();
    initChat({ tripId, getTrip: () => trip, applyUpdate: applyChatUpdate });
    initPhotos({
      getTrip: () => trip,
      render: renderAll,
      save: async () => { await saveTrip(tripId, trip); rememberRecent(); }
    });
  } catch (e) {
    $('#tripRoot').innerHTML = `<div class="home-wrap"><div class="gen-card"><h2 style="color:#c0561f;">加载失败</h2><p>${e.message}</p><p><a class="tool-btn" href="index.html">返回首页</a></p></div></div>`;
  } finally {
    hideOverlay();
  }
}

init();
