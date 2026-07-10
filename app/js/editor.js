/** 编辑抽屉：基本信息 + 预定清单/出行物品可视化编辑 + 行程内容(JSON 高级)。 */
import { esc } from './render.js';

const $ = (sel, root = document) => root.querySelector(sel);

let current = null;   // 工作副本（打开时深拷贝）
let onSaveCb = null;

export function initEditor(onSave) {
  onSaveCb = onSave;
  $('#editBtn').addEventListener('click', open);
  $('#editorClose').addEventListener('click', close);
  $('#editorCancel').addEventListener('click', close);
  $('#editorMask').addEventListener('click', close);
  $('#editorSave').addEventListener('click', save);
}

export function setEditorData(trip) { current = trip; }

function deepClone(o) { return JSON.parse(JSON.stringify(o || {})); }

function open() {
  current = deepClone(current || {});
  current.meta = current.meta || {};
  current.checklist = current.checklist || [];
  current.packing = current.packing || [];
  current.sections = current.sections || [];
  renderBody();
  document.getElementById('editorMask').classList.add('open');
  document.getElementById('editor').classList.add('open');
}

function close() {
  document.getElementById('editorMask').classList.remove('open');
  document.getElementById('editor').classList.remove('open');
}

// ---------- 渲染表单 ----------
function renderBody() {
  const m = current.meta;
  const emoji = Array.isArray(m.emoji) ? m.emoji.join(' ') : '';
  const body = $('#editorBody');
  body.innerHTML = `
    <div class="ed-section-title">基本信息</div>
    <div class="ed-field"><label>标题</label><input data-meta="title" value="${esc(m.title || '')}"></div>
    <div class="ed-field"><label>副标题</label><input data-meta="subtitle" value="${esc(m.subtitle || '')}"></div>
    <div class="ed-field"><label>日期标签</label><input data-meta="dateLabel" value="${esc(m.dateLabel || '')}"></div>
    <div class="ed-field"><label>装饰 Emoji（空格分隔）</label><input data-meta="emoji" value="${esc(emoji)}"></div>

    <div class="ed-section-title">📋 预定清单</div>
    <div id="edChecklist">${current.checklist.map((g, gi) => groupHtml(g, gi, 'c')).join('')}</div>
    <button class="tool-btn" type="button" data-add-group="c">＋ 添加分组</button>

    <div class="ed-section-title">🎒 出行物品</div>
    <div id="edPacking">${current.packing.map((g, gi) => groupHtml(g, gi, 'p')).join('')}</div>
    <button class="tool-btn" type="button" data-add-group="p">＋ 添加分组</button>

    <div class="ed-section-title">🗺️ 行程内容（高级）</div>
    <details>
      <summary style="cursor:pointer;color:var(--muted);font-size:.86rem;margin-bottom:8px;">展开编辑行程块 JSON（航班/住宿/时间轴等）</summary>
      <div class="ed-field"><textarea class="json" data-sections>${esc(JSON.stringify(current.sections, null, 2))}</textarea></div>
    </details>
    <div class="ed-msg" id="edMsg"></div>`;

  body.onclick = onBodyClick;
}

function groupHtml(g, gi, scope) {
  const items = (g.items || []).map((it, ii) => itemHtml(it, gi, ii, scope)).join('');
  return `
    <div class="ed-group" data-scope="${scope}" data-gi="${gi}" style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <input data-field="icon" value="${esc(g.icon || '')}" placeholder="图标" style="width:52px;text-align:center;border:1px solid var(--line);border-radius:8px;padding:6px;">
        <input data-field="group" value="${esc(g.group || '')}" placeholder="分组名称" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:6px 10px;">
        <button class="editor-close" type="button" data-del-group title="删除分组" style="font-size:1.1rem;">🗑️</button>
      </div>
      ${items}
      <button class="tool-btn" type="button" data-add-item style="font-size:.8rem;padding:5px 12px;">＋ 添加一项</button>
    </div>`;
}

function itemHtml(it, gi, ii, scope) {
  const who = scope === 'c'
    ? `<input data-field="who" value="${esc(it.who || '')}" placeholder="完成人" style="width:90px;border:1px solid var(--line);border-radius:8px;padding:5px 8px;">`
    : '';
  const doneChk = scope === 'c'
    ? `<label style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;color:var(--muted);white-space:nowrap;"><input type="checkbox" data-field="done" ${it.done ? 'checked' : ''}>完成</label>`
    : '';
  return `
    <div class="ed-item" data-ii="${ii}" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
      <input data-field="name" value="${esc(it.name || '')}" placeholder="名称" style="flex:2;min-width:120px;border:1px solid var(--line);border-radius:8px;padding:5px 8px;">
      <input data-field="meta" value="${esc(it.meta || '')}" placeholder="说明" style="flex:1;min-width:100px;border:1px solid var(--line);border-radius:8px;padding:5px 8px;">
      ${doneChk}${who}
      <button class="editor-close" type="button" data-del-item title="删除" style="font-size:1rem;">×</button>
    </div>`;
}

// ---------- 事件 ----------
function onBodyClick(e) {
  const t = e.target;
  if (t.matches('[data-add-group]')) { collect(); addGroup(t.dataset.addGroup); return; }
  if (t.matches('[data-del-group]')) { collect(); const g = t.closest('.ed-group'); removeGroup(g.dataset.scope, +g.dataset.gi); return; }
  if (t.matches('[data-add-item]')) { collect(); const g = t.closest('.ed-group'); addItem(g.dataset.scope, +g.dataset.gi); return; }
  if (t.matches('[data-del-item]')) { collect(); const g = t.closest('.ed-group'); const it = t.closest('.ed-item'); removeItem(g.dataset.scope, +g.dataset.gi, +it.dataset.ii); return; }
}

function listOf(scope) { return scope === 'c' ? current.checklist : current.packing; }

function addGroup(scope) { listOf(scope).push({ icon: scope === 'c' ? '📌' : '🎒', group: '', items: [] }); renderBody(); }
function removeGroup(scope, gi) { listOf(scope).splice(gi, 1); renderBody(); }
function addItem(scope, gi) {
  const it = { name: '', meta: '' };
  if (scope === 'c') { it.done = false; it.who = ''; }
  listOf(scope)[gi].items.push(it); renderBody();
}
function removeItem(scope, gi, ii) { listOf(scope)[gi].items.splice(ii, 1); renderBody(); }

// 把 DOM 当前值同步进 current（结构变化前调用）
function collect() {
  const body = $('#editorBody');
  body.querySelectorAll('[data-meta]').forEach(inp => {
    const k = inp.dataset.meta;
    current.meta[k] = k === 'emoji' ? (inp.value.trim() ? inp.value.trim().split(/\s+/) : []) : inp.value.trim();
  });
  ['c', 'p'].forEach(scope => {
    const list = listOf(scope);
    body.querySelectorAll(`.ed-group[data-scope="${scope}"]`).forEach(gEl => {
      const gi = +gEl.dataset.gi; const g = list[gi]; if (!g) return;
      g.icon = gEl.querySelector('[data-field="icon"]').value;
      g.group = gEl.querySelector('[data-field="group"]').value;
      gEl.querySelectorAll('.ed-item').forEach(iEl => {
        const ii = +iEl.dataset.ii; const it = g.items[ii]; if (!it) return;
        it.name = iEl.querySelector('[data-field="name"]').value;
        it.meta = iEl.querySelector('[data-field="meta"]').value;
        if (scope === 'c') {
          it.who = iEl.querySelector('[data-field="who"]').value;
          it.done = iEl.querySelector('[data-field="done"]').checked;
        }
      });
    });
  });
}

function save() {
  const msg = $('#edMsg'); msg.className = 'ed-msg';
  collect();
  const ta = $('[data-sections]');
  try {
    const parsed = JSON.parse(ta.value);
    if (!Array.isArray(parsed)) throw new Error('行程内容必须是数组');
    current.sections = parsed;
  } catch (e) {
    msg.className = 'ed-msg err';
    msg.textContent = '行程内容 JSON 有误：' + e.message;
    return;
  }
  close();
  if (onSaveCb) onSaveCb(deepClone(current));
}
