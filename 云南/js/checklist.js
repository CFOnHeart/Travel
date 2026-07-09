/**
 * 预定清单 + 出行物品：渲染、云端同步、逐项保存。
 */
import { GROUPS, PACKING } from './data.js';
import { state, itemState, cacheLocal } from './store.js';
import { $, esc } from './utils.js';
import { fetchState, saveItem } from './api.js';
import { setStatus, flashStatus } from './status.js';
import { openAttachmentModal } from './attachmentModal.js';

const whoTimers = {};
let pending = 0;

// ---- 单行渲染 ----
function makeRow(item, opts) {
  const st = itemState(item);
  const showWho = opts.who !== false;
  const row = document.createElement('div');
  row.className = 'todo ' + (st.done ? 'done' : 'pending') + ((st.img || st.note) ? ' has-attach' : '');

  const controls = (showWho || opts.attach)
    ? '<div class="t-row2">' +
        (showWho ? `<input class="who-input" placeholder="${opts.whoPlaceholder || '完成人…'}" value="${esc(st.who)}">` : '') +
        (opts.attach ? '<button class="attach-btn" type="button">📎 附件<span class="dot"></span></button>' : '') +
      '</div>'
    : '';

  row.innerHTML =
    `<span class="box">${st.done ? '✓' : ''}</span>` +
    `<div class="t-main"><div class="t-name">${esc(item.name)}</div>` +
    (item.meta ? `<div class="t-meta">${esc(item.meta)}</div>` : '') + '</div>' +
    controls;

  $('.box', row).addEventListener('click', () => { st.done = !st.done; render(); pushItem(item.id); });

  if (showWho) {
    const input = $('.who-input', row);
    input.addEventListener('input', () => {
      st.who = input.value;
      cacheLocal();
      clearTimeout(whoTimers[item.id]);
      whoTimers[item.id] = setTimeout(() => pushItem(item.id), 600);
    });
  }

  if (opts.attach) {
    $('.attach-btn', row).addEventListener('click', () => openAttachmentModal(item, st, (fields) => {
      st.who = fields.who; st.note = fields.note; st.img = fields.img;
      render();
      pushItem(item.id);
    }));
  }

  return row;
}

function renderList(container, groups, fillId, labelId, doneWord, opts) {
  container.innerHTML = '';
  let total = 0, done = 0;
  groups.forEach(g => {
    const groupEl = document.createElement('div');
    groupEl.className = 'todo-group';
    const title = document.createElement('div');
    title.className = 'g-title';
    title.textContent = g.title;
    groupEl.appendChild(title);
    g.items.forEach(item => {
      total++;
      if (itemState(item).done) done++;
      groupEl.appendChild(makeRow(item, opts));
    });
    container.appendChild(groupEl);
  });
  $('#' + fillId).style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  $('#' + labelId).textContent = `${doneWord} ${done} / ${total} 项`;
}

/** 渲染两个清单。 */
export function render() {
  renderList($('#todoContainer'), GROUPS, 'progressFill', 'progressLabel', '已完成', { attach: true, whoPlaceholder: '完成人…' });
  renderList($('#packingContainer'), PACKING, 'packFill', 'packLabel', '已准备', { attach: false, who: false });
}

// ---- 云端同步 ----
export async function loadFromServer() {
  setStatus('saving', '同步中…');
  try {
    const data = await fetchState();
    const items = (data && data.items) || {};
    GROUPS.concat(PACKING).forEach(g => g.items.forEach(item => {
      const s = itemState(item);
      const remote = items[item.id];
      if (remote) {
        s.done = !!remote.done;
        s.who = remote.who || '';
        s.note = remote.note || '';
        s.img = remote.img || '';
      }
    }));
    cacheLocal();
    render();
    flashStatus('已同步 ✓', 2000);
  } catch {
    render();
    setStatus('error', '离线（用本地缓存）');
  }
}

export async function pushItem(id) {
  const s = state[id];
  if (!s) return;
  pending++;
  setStatus('saving', '保存中…');
  try {
    await saveItem({ id, done: !!s.done, who: s.who || '', note: s.note || '', img: s.img || '' });
    cacheLocal();
    if (--pending <= 0) { pending = 0; flashStatus('已保存 ✓'); }
  } catch {
    pending--;
    setStatus('error', '保存失败，请重试');
  }
}
