/** 小白熊行程助手：右侧聊天框，通过对话增删改查行程/清单/物品/花销。 */
import { chatTrip, executeTripTools, saveTrip } from './api.js';

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const FOCUS_LABEL = { trip: '🗺️ 行程', booking: '📋 预定清单', packing: '🎒 出行物品', expense: '💰 花销' };

function deepClone(value) { return JSON.parse(JSON.stringify(value || {})); }

/**
 * @param {object} ctx { tripId, getTrip:()=>trip, applyUpdate:(updatedTrip, focus)=>void }
 */
export function initChat(ctx) {
  const fab = $('#chatFab'), panel = $('#chatPanel'), mask = $('#chatMask');
  const msgs = $('#chatMsgs'), input = $('#chatText'), sendBtn = $('#chatSend');
  const history = [];            // 发给后端的对话历史 [{role, content}]
  let busy = false;
  let greeted = false;

  function open() {
    panel.classList.add('open'); mask.classList.add('open');
    fab.classList.add('hidden'); panel.setAttribute('aria-hidden', 'false');
    if (!greeted) {
      greeted = true;
      addBubble('bot', '你好！我是小白熊行程助手\n你可以让我帮你修改行程，例如：\n· 「把泸沽湖那笔花销改成 600」\n· 「给出行物品加一项防晒霜」\n· 「删掉返程机票的预定项」\n· 「这次一共花了多少钱？」');
    }
    setTimeout(() => input.focus(), 250);
  }
  function close() {
    panel.classList.remove('open'); mask.classList.remove('open');
    fab.classList.remove('hidden'); panel.setAttribute('aria-hidden', 'true');
  }

  fab.addEventListener('click', open);
  $('#chatClose').addEventListener('click', close);
  mask.addEventListener('click', close);

  // 自适应高度
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  function addBubble(role, text, updated) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot') + (updated ? ' updated' : '');
    wrap.innerHTML = `<div class="bubble">${esc(text)}</div>`;
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }

  function showThinking() {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg bot';
    wrap.innerHTML = `<div class="bubble chat-thinking"><span class="spin"></span>正在思考…</div>`;
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }

  function fieldMeta(call) {
    const trip = ctx.getTrip();
    const destinations = [...new Set((trip.sections || []).filter(s => s.type === 'destination').map(s => s.destination || s.title).filter(Boolean))];
    const stageTitles = [...new Set((trip.sections || []).filter(s => s.type === 'destination').map(s => s.title).filter(Boolean))];
    const bookingGroups = [...new Set([...(trip.checklist || []).map(g => g.group).filter(Boolean), '其他'])];
    const packingGroups = [...new Set([...(trip.packing || []).map(g => g.group).filter(Boolean), '其他'])];
    const people = (trip.people || []).map(p => p.name).filter(Boolean);
    if (call.action === 'expense.add') return [
      { name: 'personName', label: '付款人', type: 'select', required: true, options: people },
      { name: 'amount', label: '金额', type: 'number', required: true },
      { name: 'time', label: '时间', type: 'datetime-local', required: true },
      { name: 'note', label: '说明', type: 'text', required: false }
    ];
    if (call.action === 'expense.item') return [
      { name: 'operation', label: '操作', type: 'select', required: true, options: ['add', 'update', 'delete'] },
      { name: 'expenseId', label: '花销 ID', type: 'text', required: false },
      { name: 'personName', label: '付款人', type: 'select', required: false, options: people },
      { name: 'amount', label: '金额', type: 'number', required: false },
      { name: 'time', label: '时间', type: 'datetime-local', required: false },
      { name: 'note', label: '说明', type: 'text', required: false }
    ];
    if (call.action === 'collection.item') {
      const collection = (call.args || {}).collection;
      return [
        { name: 'operation', label: '操作', type: 'select', required: true, options: ['add', 'update', 'delete', 'toggle'] },
        { name: 'collection', label: '模块', type: 'select', required: true, options: ['booking', 'packing'] },
        { name: 'itemId', label: '条目 ID', type: 'text', required: false },
        { name: 'group', label: '分组', type: 'select', required: false, options: collection === 'booking' ? bookingGroups : packingGroups },
        { name: 'name', label: '名称', type: 'text', required: false },
        { name: 'meta', label: '说明', type: 'text', required: false },
        { name: 'done', label: '完成', type: 'checkbox', required: false },
        { name: 'who', label: '完成人', type: 'text', required: false }
      ];
    }
    if (call.action === 'packing.addItem') return [
      { name: 'group', label: '分组', type: 'select', required: true, options: packingGroups },
      { name: 'name', label: '物品名称', type: 'text', required: true },
      { name: 'meta', label: '说明', type: 'text', required: false }
    ];
    if (call.action === 'trip.timelineItem') return [
      { name: 'operation', label: '操作', type: 'select', required: true, options: ['add', 'update', 'delete'] },
      { name: 'itemId', label: '行程 ID', type: 'text', required: false },
      { name: 'destination', label: '目的地', type: 'select', required: false, options: destinations },
      { name: 'stageTitle', label: '阶段', type: 'select', required: false, options: stageTitles },
      { name: 'day', label: '日期', type: 'text', required: false },
      { name: 'heading', label: '标题', type: 'text', required: false },
      { name: 'desc', label: '说明', type: 'text', required: false },
      { name: 'chips', label: '标签 JSON', type: 'json', required: false }
    ];
    if (call.action === 'trip.hotel') return [
      { name: 'operation', label: '操作', type: 'select', required: true, options: ['upsert', 'delete'] },
      { name: 'sectionId', label: '住宿 ID', type: 'text', required: false },
      { name: 'destination', label: '目的地', type: 'select', required: false, options: destinations },
      { name: 'stageTitle', label: '阶段', type: 'select', required: false, options: stageTitles },
      { name: 'name', label: '酒店名', type: 'text', required: false },
      { name: 'stars', label: '房型/星级', type: 'text', required: false },
      { name: 'tags', label: '标签 JSON', type: 'json', required: false },
      { name: 'price', label: '价格', type: 'number', required: false },
      { name: 'priceUnit', label: '价格单位', type: 'text', required: false },
      { name: 'totalNote', label: '合计说明', type: 'text', required: false },
      { name: 'tipText', label: '提示', type: 'text', required: false }
    ];
    if (call.action === 'trip.replace') return [
      { name: 'focus', label: '更新后跳转', type: 'select', required: true, options: ['trip', 'booking', 'packing', 'expense'] },
      { name: 'updatedTrip', label: '行程 JSON（高级）', type: 'json', required: true }
    ];
    return Object.keys(call.args || {}).map(name => ({ name, label: name, type: 'text', required: false }));
  }

  function toLocalInputValue(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function fromLocalInputValue(value) {
    return value ? new Date(value).toISOString() : '';
  }

  function confirmTools(toolCalls) {
    return new Promise(resolve => {
      const isDeleteCall = call => ['delete'].includes(String((call.args || {}).operation || '').toLowerCase());
      const cards = toolCalls.map((call, ci) => {
        const fields = fieldMeta(call);
        return `
          <div class="tool-card${isDeleteCall(call) ? ' danger' : ''}" data-ci="${ci}">
            <label class="tool-card-enabled"><input type="checkbox" data-enabled checked> 执行此项</label>
            <div class="tool-card-title">${esc(call.title || call.action || '待执行操作')}</div>
            ${call.message ? `<p class="tool-card-msg">${esc(call.message)}</p>` : ''}
            <div class="tool-fields">
              ${fields.map(field => {
                const raw = (call.args || {})[field.name] ?? '';
                const value = field.type === 'datetime-local' ? toLocalInputValue(raw) : field.type === 'json' ? JSON.stringify(raw, null, 2) : raw;
                const common = `data-field="${esc(field.name)}" ${field.required ? 'required' : ''}`;
                if (field.type === 'select') {
                  return `<label>${esc(field.label)}${field.required ? '<b>*</b>' : ''}<select ${common}><option value="">请选择</option>${(field.options || []).map(opt => `<option value="${esc(opt)}" ${opt === value ? 'selected' : ''}>${esc(opt)}</option>`).join('')}</select></label>`;
                }
                if (field.type === 'checkbox') {
                  return `<label class="tool-check">${esc(field.label)}<input type="checkbox" ${value ? 'checked' : ''} ${common}></label>`;
                }
                if (field.type === 'json') {
                  return `<label class="tool-field-wide">${esc(field.label)}${field.required ? '<b>*</b>' : ''}<textarea ${common}>${esc(value)}</textarea></label>`;
                }
                return `<label>${esc(field.label)}${field.required ? '<b>*</b>' : ''}<input type="${esc(field.type)}" value="${esc(value)}" ${common}></label>`;
              }).join('')}
            </div>
          </div>`;
      }).join('');
      const wrap = document.createElement('div');
      wrap.className = 'chat-msg bot tool-msg';
      wrap.innerHTML = `
        <div class="tool-confirm">
          <h3>确认执行</h3>
          <p class="tool-confirm-sub">请检查并修改参数，确认后才会写入行程数据。</p>
          <div class="tool-card-list">${cards}</div>
          <div class="tool-confirm-actions">
            <button class="btn ghost" type="button" data-cancel>取消</button>
            <button class="btn primary${toolCalls.some(isDeleteCall) ? ' danger' : ''}" type="button" data-ok>${toolCalls.some(isDeleteCall) ? '确认删除' : '确认执行'}</button>
          </div>
        </div>`;
      msgs.appendChild(wrap);
      msgs.scrollTop = msgs.scrollHeight;

      function finish(value, text) {
        wrap.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = true; });
        const status = document.createElement('div');
        status.className = 'tool-confirm-status';
        status.textContent = text;
        wrap.querySelector('.tool-confirm').appendChild(status);
        resolve(value);
      }
      wrap.querySelector('[data-cancel]').addEventListener('click', () => finish(null, '已取消'));
      wrap.querySelector('[data-ok]').addEventListener('click', () => {
        try {
          const next = toolCalls.map((call, ci) => {
            const card = wrap.querySelector(`.tool-card[data-ci="${ci}"]`);
            if (!card.querySelector('[data-enabled]').checked) return null;
            const args = { ...(call.args || {}) };
            fieldMeta(call).forEach(field => {
              const input = Array.from(card.querySelectorAll('[data-field]')).find(el => el.dataset.field === field.name);
              if (!input) return;
              if (field.type === 'datetime-local') args[field.name] = fromLocalInputValue(input.value);
              else if (field.type === 'json') args[field.name] = JSON.parse(input.value);
              else if (field.type === 'checkbox') args[field.name] = input.checked;
              else args[field.name] = input.value;
            });
            return { ...call, args };
          }).filter(Boolean);
          finish(next, next.length ? '已确认，正在执行' : '未选择任何操作');
        } catch (e) {
          alert('参数格式有误：' + e.message);
        }
      });
    });
  }

  function applyToolResult(reply, updatedTrip, focus) {
    addBubble('bot', reply, !!updatedTrip);
    history.push({ role: 'assistant', content: reply });
    if (updatedTrip) {
      ctx.applyUpdate(updatedTrip, focus);
      if (focus && FOCUS_LABEL[focus]) addBubble('bot', `✅ 已更新，请在「${FOCUS_LABEL[focus]}」标签查看。`, true);
    }
  }

  async function applyLegacyReplace(call) {
    const nextTrip = call && call.args && call.args.updatedTrip;
    const focus = call && call.args && call.args.focus;
    if (!nextTrip) throw new Error('缺少要应用的行程数据');
    await saveTrip(ctx.tripId, nextTrip);
    return { reply: '已应用确认后的行程变更。', updatedTrip: nextTrip, focus };
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    input.value = ''; input.style.height = 'auto';
    const beforeTrip = deepClone(ctx.getTrip());

    addBubble('user', text);
    history.push({ role: 'user', content: text });

    const thinking = showThinking();
    try {
      let { reply, updatedTrip, focus, toolCalls } = await chatTrip(ctx.tripId, ctx.getTrip(), history);
      thinking.remove();
      if (updatedTrip && (!Array.isArray(toolCalls) || !toolCalls.length)) {
        await saveTrip(ctx.tripId, beforeTrip);
        toolCalls = [{
          action: 'trip.replace',
          title: '确认应用行程变更',
          message: '助手生成了一次行程数据修改。请确认后再写入；你也可以展开 JSON 做高级修改。',
          args: { updatedTrip, focus: focus || 'trip' }
        }];
        updatedTrip = null;
        focus = null;
        reply = '我准备应用这次变更，请在弹窗中确认。';
      }
      applyToolResult(reply, updatedTrip, focus);
      if (Array.isArray(toolCalls) && toolCalls.length) {
        const confirmed = await confirmTools(toolCalls);
        if (!confirmed) {
          addBubble('bot', '已取消执行。');
          return;
        }
        if (!confirmed.length) {
          addBubble('bot', '没有选择要执行的操作，已取消。');
          return;
        }
        const executing = showThinking();
        const result = confirmed.length === 1 && confirmed[0].action === 'trip.replace'
          ? await applyLegacyReplace(confirmed[0])
          : await executeTripTools(ctx.tripId, ctx.getTrip(), confirmed);
        executing.remove();
        applyToolResult(result.reply, result.updatedTrip, result.focus);
      }
    } catch (e) {
      thinking.remove();
      addBubble('bot', '⚠️ ' + e.message);
    } finally {
      busy = false; sendBtn.disabled = false;
      input.focus();
    }
  }
}
