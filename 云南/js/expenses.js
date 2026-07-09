/**
 * 💰 花销登记：4 人共享统一时间轴看板 + 记账弹窗。
 */
import { PEOPLE, PERSON_ICON, EXPENSE_AXIS } from './config.js';
import { $, $$, esc, fmtMoney, fmtTime, fmtTick, toInputValue } from './utils.js';
import { fetchExpenses, addExpense, removeExpense } from './api.js';

let expenses = [];

export async function loadExpenses() {
  try {
    const data = await fetchExpenses();
    expenses = (data && data.items) || [];
  } catch {
    /* 保留上一次数据 */
  }
  renderBoard();
}

function renderBoard() {
  const board = $('#expBoard');
  board.innerHTML = '';

  const all = expenses.slice();
  const grand = all.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  $('#expGrand').textContent = '总花销 ¥' + fmtMoney(grand);

  // 头部行：轴角占位 + 4 人（头像 / 姓名 / 总额 / 添加）
  const totals = {};
  PEOPLE.forEach(p => { totals[p] = all.filter(e => e.person === p).reduce((s, e) => s + (Number(e.amount) || 0), 0); });

  const headRow = document.createElement('div');
  headRow.className = 'exp-head-row';
  headRow.appendChild(document.createElement('div'));
  PEOPLE.forEach(person => {
    const head = document.createElement('div');
    head.className = 'p-head';
    head.innerHTML =
      `<div class="p-name"><img class="p-icon" src="images/${PERSON_ICON[person]}" alt="">${esc(person)}</div>` +
      `<div class="p-total">¥${fmtMoney(totals[person])} <small>总花销</small></div>` +
      '<button class="add-exp" type="button">＋ 添加</button>';
    $('.add-exp', head).addEventListener('click', () => openExpModal(person));
    headRow.appendChild(head);
  });
  board.appendChild(headRow);

  if (all.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'exp-empty';
    empty.textContent = '还没有花销记录，点击某人的「＋ 添加」记一笔。';
    board.appendChild(empty);
    return;
  }

  // 统一时间轴范围：最早 → 最晚
  const times = all.map(e => new Date(e.time).getTime()).filter(t => !isNaN(t));
  const min = Math.min(...times);
  let max = Math.max(...times);
  if (!(max > min)) max = min + 3600000; // 仅一笔或同刻，给 1 小时跨度避免除零

  const { height: H, top: top0, ticks: N } = EXPENSE_AXIS;
  const usable = H - 60;
  const posOf = t => top0 + ((t - min) / (max - min)) * usable;

  const body = document.createElement('div');
  body.className = 'exp-body';
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
    line.className = 'gl';
    line.style.top = y + 'px';
    gridlines.appendChild(line);
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.top = y + 'px';
    tick.innerHTML = fmtTick(t);
    axis.appendChild(tick);
  }
  body.appendChild(gridlines);
  body.appendChild(axis);

  // 每人一条泳道，按时间比例定位
  PEOPLE.forEach(person => {
    const lane = document.createElement('div');
    lane.className = 'exp-lane';
    all.filter(e => e.person === person)
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
        $('.e-del', item).addEventListener('click', () => deleteExpense(e.id));
        lane.appendChild(item);
      });
    body.appendChild(lane);
  });

  board.appendChild(body);
}

// ---- 记账弹窗 ----
const expMask = $('#expModal');
let expPerson = null;

function openExpModal(person) {
  expPerson = person;
  $('#expTitle').textContent = '记一笔 · ' + person;
  $('#expWho').textContent = '为 ' + person + ' 添加一笔花销';
  $('#expAmount').value = '';
  $('#expNote').value = '';
  $('#expTime').value = toInputValue(new Date());
  expMask.classList.add('open');
  setTimeout(() => $('#expAmount').focus(), 50);
}

async function onSaveExpense() {
  const amount = parseFloat($('#expAmount').value);
  if (!isFinite(amount) || amount < 0) { alert('请输入有效金额'); return; }
  const note = $('#expNote').value.trim();
  const tv = $('#expTime').value;
  const time = tv ? new Date(tv).toISOString() : new Date().toISOString();

  const btn = $('#expSave');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    await addExpense({ person: expPerson, amount, note, time });
    expMask.classList.remove('open');
    await loadExpenses();
  } catch (e) {
    alert('保存失败：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '保存';
  }
}

async function deleteExpense(id) {
  if (!confirm('删除这笔花销？')) return;
  try {
    await removeExpense(id);
    await loadExpenses();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

export function initExpenses() {
  $('#expCancel').addEventListener('click', () => expMask.classList.remove('open'));
  expMask.addEventListener('click', e => { if (e.target === expMask) expMask.classList.remove('open'); });
  $('#expSave').addEventListener('click', onSaveExpense);
}
