/** 行程 Schema → HTML 渲染（复用与云南页一致的视觉类名）。 */

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- Hero ----------
export function renderHero(meta = {}) {
  const emoji = Array.isArray(meta.emoji) ? meta.emoji.join('  ') : '';
  return `
    <header class="hero">
      <h1>${esc(meta.title || '我的行程')}</h1>
      ${meta.subtitle ? `<p>${esc(meta.subtitle)}</p>` : ''}
      ${meta.dateLabel ? `<div class="dates">${esc(meta.dateLabel)}</div>` : ''}
      ${emoji ? `<div class="hero-emoji" style="position:absolute;bottom:14px;left:0;right:0;font-size:20px;opacity:.35;letter-spacing:18px;text-align:center;">${esc(emoji)}</div>` : ''}
    </header>`;
}

// ---------- 各类 section ----------
function badges(list) {
  if (!Array.isArray(list) || !list.length) return '';
  return list.map(b => `<span class="badge${b.warn ? ' warn' : ''}">${esc(b.text)}</span>`).join('');
}

function renderFlight(s) {
  const f = s.from || {}, t = s.to || {};
  return `
    <div class="card flight">
      <div class="route">
        <div class="ends">
          <div class="city"><div class="time">${esc(f.time || '')}</div><div class="name">${esc(f.name || '')} ${esc(f.code || '')}</div></div>
          <div class="path">
            <small>${esc(s.date || '')} ${esc(s.weekday || '')}</small>
            <div class="line"></div><div class="plane">✈️</div>
            <small>${esc(s.flightNo || '')}</small>
          </div>
          <div class="city"><div class="time">${esc(t.time || '')}</div><div class="name">${esc(t.name || '')} ${esc(t.code || '')}</div></div>
        </div>
        ${badges(s.badges)}
      </div>
      ${s.price != null && s.price !== '' ? `<div class="price">
        <div class="tag">${esc(s.priceLabel || '参考价')}</div>
        <div class="amt">¥${esc(s.price)}<small style="font-size:.8rem;color:var(--muted);">${esc(s.unit || '')}</small></div>
      </div>` : ''}
    </div>`;
}

function renderHotel(s) {
  const tags = (s.tags || []).map(x => `<span>${esc(x)}</span>`).join('');
  return `
    <div class="card hotel-card">
      ${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.name || '')}">` : ''}
      <div class="info">
        <h3>${esc(s.name || '')}</h3>
        ${s.stars ? `<div class="stars">${esc(s.stars)}</div>` : ''}
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        <div class="price-line">
          ${s.price != null && s.price !== '' ? `<div class="big">¥${esc(s.price)} <small>${esc(s.priceUnit || '')}</small></div>` : ''}
          ${s.totalNote ? `<span class="total">${esc(s.totalNote)}</span>` : ''}
        </div>
        ${s.tip && s.tip.text ? `<div class="tip"><span class="ico">${esc(s.tip.icon || '💡')}</span><span>${esc(s.tip.text)}</span></div>` : ''}
      </div>
    </div>`;
}

function renderCar(s) {
  const tags = (s.tags || []).map(x => `<span>${esc(x)}</span>`).join('');
  return `
    <div class="card hotel-card">
      <div style="font-size:3rem;line-height:1;">${esc(s.icon || '🚙')}</div>
      <div class="info">
        <h3>${esc(s.model || '')}</h3>
        ${s.desc ? `<div class="stars" style="color:var(--muted);">${esc(s.desc)}</div>` : ''}
        <div class="tags">
          ${s.price != null && s.price !== '' ? `<span>¥${esc(s.price)} ${esc(s.priceUnit || '')}</span>` : ''}
          ${tags}
        </div>
        <div class="price-line">
          ${s.totalNote ? `<div class="big" style="font-size:1.15rem;">${esc(s.totalNote)}</div>` : ''}
          ${s.subNote ? `<span class="total">${esc(s.subNote)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function chip(c) {
  const kind = ['cost', 'stay', 'car'].includes(c.kind) ? ' ' + c.kind : '';
  return `<span class="chip${kind}">${esc(c.text)}</span>`;
}

function renderTimeline(s) {
  const items = (s.items || []).map(it => `
    <div class="tl-item">
      ${it.day ? `<div class="day">${esc(it.day)}</div>` : ''}
      ${it.heading ? `<h5>${esc(it.heading)}</h5>` : ''}
      ${it.desc ? `<p>${esc(it.desc)}</p>` : ''}
      ${Array.isArray(it.chips) && it.chips.length ? `<div class="meta-row">${it.chips.map(chip).join('')}</div>` : ''}
    </div>`).join('');
  return `<div class="timeline">${items}</div>`;
}

function renderCostTable(s) {
  const rows = (s.rows || []).map(r => `
    <tr><td>${esc(r.item)}</td><td>${esc(r.note || '')}</td><td class="amt">${esc(r.amount)}</td></tr>`).join('');
  const total = s.total ? `
    <tr class="total-row"><td><b>${esc(s.total.item || '合计')}</b></td><td>${esc(s.total.note || '')}</td><td class="amt">${esc(s.total.amount)}</td></tr>` : '';
  return `
    <div class="card">
      <table class="cost-table">
        <thead><tr><th>项目</th><th>说明</th><th>人均</th></tr></thead>
        <tbody>${rows}${total}</tbody>
      </table>
    </div>`;
}

function renderNote(s) {
  return `<div class="card"><p style="color:var(--muted);line-height:1.8;">${esc(s.text || '')}</p></div>`;
}

const SECTION_RENDERERS = {
  flight: renderFlight, hotel: renderHotel, car: renderCar,
  timeline: renderTimeline, costTable: renderCostTable, note: renderNote
};

export function renderSections(sections = []) {
  return sections.map((s, i) => {
    const fn = SECTION_RENDERERS[s.type] || renderNote;
    return `
      <section class="section">
        <div class="section-title"><span class="num">${esc(s.num || i + 1)}</span>${esc(s.title || '')}</div>
        ${fn(s)}
      </section>`;
  }).join('');
}

// ---------- 预定清单 / 出行物品 ----------
export function renderChecklistPanel(trip) {
  const groups = trip.checklist || [];
  let total = 0, done = 0;
  groups.forEach(g => (g.items || []).forEach(it => { total++; if (it.done) done++; }));
  const pct = total ? Math.round(done / total * 100) : 0;
  const cards = groups.map(g => `
    <div class="todo-group">
      <div class="g-title">${esc(g.icon || '📌')} ${esc(g.group || '')}</div>
      ${(g.items || []).map(it => todoRow(it)).join('')}
    </div>`).join('');
  return `
    <div class="checklist-head">
      <div><h2>📋 预定清单</h2><p class="sub">勾选完成项，实时保存到云端</p></div>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="progress-label">已完成 ${done} / ${total} 项</div>
    </div>
    <div class="checklist-grid">${cards || '<p class="sidebar-note">暂无预定项。</p>'}</div>`;
}

function todoRow(it) {
  return `
    <div class="todo ${it.done ? 'done' : 'pending'}" data-id="${esc(it.id)}">
      <span class="box">${it.done ? '✓' : ''}</span>
      <div class="t-main">
        <div class="t-name">${esc(it.name || '')}</div>
        ${it.meta ? `<div class="t-meta">${esc(it.meta)}</div>` : ''}
      </div>
      <div class="t-row2">
        <input class="who-input" placeholder="完成人…" value="${esc(it.who || '')}">
      </div>
    </div>`;
}

export function renderPackingPanel(trip) {
  const groups = trip.packing || [];
  let total = 0, done = 0;
  groups.forEach(g => (g.items || []).forEach(it => { total++; if (it.done) done++; }));
  const pct = total ? Math.round(done / total * 100) : 0;
  const cards = groups.map(g => `
    <div class="todo-group">
      <div class="g-title">${esc(g.icon || '🎒')} ${esc(g.group || '')}</div>
      ${(g.items || []).map(it => `
        <div class="todo ${it.done ? 'done' : 'pending'}" data-id="${esc(it.id)}" data-pack="1">
          <span class="box">${it.done ? '✓' : ''}</span>
          <div class="t-main"><div class="t-name">${esc(it.name || '')}</div>${it.meta ? `<div class="t-meta">${esc(it.meta)}</div>` : ''}</div>
        </div>`).join('')}
    </div>`).join('');
  return `
    <div class="checklist-head"><div><h2>🎒 出行物品</h2><p class="sub">按类别整理的行李清单</p></div></div>
    <div class="progress-wrap">
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
      <div class="progress-label">已准备 ${done} / ${total} 项</div>
    </div>
    <div class="checklist-grid">${cards || '<p class="sidebar-note">暂无物品项。</p>'}</div>`;
}

// ---------- 花销（动态人员）----------
function fmtTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d)) return esc(t);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function renderExpensePanel(trip) {
  const people = trip.people || [];
  const expenses = trip.expenses || [];
  const sumOf = pid => expenses.filter(e => e.personId === pid).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const grand = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);

  const hint = `<div class="exp-hint">💡 先点击「＋ 添加人员」加入同行的人，再为每个人「记一笔」，系统会自动统计每人小计与总花销。</div>`;

  const empty = `
    <div class="exp-empty-big">
      <div class="ee-icon">🧑‍🤝‍🧑</div>
      <p class="ee-title">还没有添加同行人员</p>
      <p class="ee-sub">点击上方「＋ 添加人员」，添加后即可为每个人记录花销并自动统计。</p>
    </div>`;

  const cards = people.map(p => {
    const list = expenses
      .filter(e => e.personId === p.id)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      .map(e => `
        <div class="exp-item" data-eid="${esc(e.id)}">
          <span class="ea">¥${esc(e.amount)}</span>
          <span class="en">${esc(e.note || '')}</span>
          <span class="et">${fmtTime(e.time)}</span>
          <button class="exp-del" type="button" title="删除">×</button>
        </div>`).join('');
    return `
      <div class="person-card" data-pid="${esc(p.id)}">
        <div class="person-head">
          <input class="person-name" value="${esc(p.name || '')}" placeholder="姓名">
          <button class="person-del" type="button" title="删除人员">🗑️</button>
        </div>
        <div class="person-total">¥${sumOf(p.id).toFixed(2).replace(/\.00$/, '')}<small>小计</small></div>
        <div class="exp-list">${list || '<div class="exp-empty">还没有记录</div>'}</div>
        <button class="add-exp-btn" type="button">＋ 记一笔</button>
      </div>`;
  }).join('');

  return `
    <div class="exp-head">
      <h2>💰 花销统计</h2>
      <p class="sub">添加同行人员后即可记录并统计每人花销</p>
      <div class="exp-grand" id="expGrand">总花销 ¥${grand.toFixed(2).replace(/\.00$/, '')}</div>
    </div>
    ${hint}
    <div class="exp-toolbar"><button class="tool-btn primary" id="addPersonBtn" type="button">＋ 添加人员</button></div>
    ${people.length ? `<div class="exp-people">${cards}</div>` : empty}`;
}
