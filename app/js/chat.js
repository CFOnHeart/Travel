/** 🤖 行程助手：右侧聊天框，通过对话增删改查行程/清单/物品/花销。 */
import { chatTrip } from './api.js';

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const FOCUS_LABEL = { trip: '🗺️ 行程', booking: '📋 预定清单', packing: '🎒 出行物品', expense: '💰 花销' };

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
      addBubble('bot', '你好！我是行程助手 🤖\n你可以让我帮你修改行程，例如：\n· 「把泸沽湖那笔花销改成 600」\n· 「给出行物品加一项防晒霜」\n· 「删掉返程机票的预定项」\n· 「这次一共花了多少钱？」');
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

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    input.value = ''; input.style.height = 'auto';

    addBubble('user', text);
    history.push({ role: 'user', content: text });

    const thinking = showThinking();
    try {
      const { reply, updatedTrip, focus } = await chatTrip(ctx.tripId, ctx.getTrip(), history);
      thinking.remove();
      addBubble('bot', reply, !!updatedTrip);
      history.push({ role: 'assistant', content: reply });
      if (updatedTrip) {
        ctx.applyUpdate(updatedTrip, focus);
        if (focus && FOCUS_LABEL[focus]) {
          addBubble('bot', `✅ 已更新，请在「${FOCUS_LABEL[focus]}」标签查看。`, true);
        }
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
