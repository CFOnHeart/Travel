/** 行程 Schema → HTML 渲染（复用与云南页一致的视觉类名）。 */

export function esc(s) {
  return cleanText(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/\u00e2[\u0080\u20ac][\u0093\u201c]/g, '-')
    .replace(/\u00e2[\u0080\u20ac][\u0094\u201d]/g, '-')
    .replace(/\u00e2[\u0080\u20ac][\u0098\u02dc]/g, "'")
    .replace(/\u00e2[\u0080\u20ac][\u0099\u2122]/g, "'")
    .replace(/\u00e2[\u0080\u20ac][\u009c\u0153]/g, '"')
    .replace(/\u00e2[\u0080\u20ac][\u009d\u009d]/g, '"')
    .replace(/\u00e2[\u0080\u20ac][\u00a6\u00a6]/g, '...')
    .replace(/\u00e2[\u009c\u0153][\u0088\u02c6](?:\u00ef\u00b8\u008f)?/g, 'AIR')
    .replace(/\u00c2\u00a0/g, ' ')
    .replace(/\u00c2\u00b7/g, '·');
}

// ---------- Hero ----------
function renderGenerationNotes(notes) {
  if (!notes || typeof notes !== 'object') return '';
  const decisions = Array.isArray(notes.decisions) ? notes.decisions.filter(Boolean) : [];
  return `
    <section class="generation-notes${notes.needsReview ? ' needs-review' : ''}" aria-label="AI 行程整理说明">
      <div class="generation-notes-icon" aria-hidden="true">✨</div>
      <div class="generation-notes-copy">
        <div class="generation-notes-head">
          <div>
            <span class="generation-notes-kicker">AI 整理说明</span>
            <h2>${esc(notes.title || 'AI 已完成行程整理')}</h2>
          </div>
          <span class="generation-notes-status">${notes.needsReview ? '建议核对' : '已整理'}</span>
        </div>
        ${notes.summary ? `<p class="generation-notes-summary">${esc(notes.summary)}</p>` : ''}
        ${decisions.length ? `<ul>${decisions.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
        ${notes.reviewHint ? `<p class="generation-notes-review"><b>请留意：</b>${esc(notes.reviewHint)}</p>` : ''}
        ${notes.chatHint ? `<p class="generation-notes-chat">💬 ${esc(notes.chatHint)}</p>` : ''}
      </div>
    </section>`;
}

export function renderHero(meta = {}) {
  const emoji = Array.isArray(meta.emoji) ? meta.emoji.join('  ') : '';
  return `
    <header class="hero">
      <h1>${esc(meta.title || '我的行程')}</h1>
      ${meta.subtitle ? `<p>${esc(meta.subtitle)}</p>` : ''}
      ${meta.dateLabel ? `<div class="dates">${esc(meta.dateLabel)}</div>` : ''}
      ${emoji ? `<div class="hero-emoji" style="position:absolute;bottom:14px;left:0;right:0;font-size:20px;opacity:.35;letter-spacing:18px;text-align:center;">${esc(emoji)}</div>` : ''}
    </header>
    ${renderGenerationNotes(meta.generationNotes)}`;
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
            <div class="line"></div><div class="plane">AIR</div>
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

function cleanGroupTitle(value, fallback = '未分组') {
  const text = String(value || '')
    .replace(/^(?:[\u00c0-\u00ff\u0080-\u009f\ufffd]+|\s)+/g, '')
    .replace(/^[^\w\u4e00-\u9fff]+/u, '')
    .trim();
  return text || fallback;
}

function renderTimeline(s) {
  const items = (s.items || []).map(it => `
    <div class="tl-item" data-photo-scope="timelineItem" data-child-id="${esc(s.id || '')}" data-item-id="${esc(it.id || '')}">
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

function renderArrival(s) {
  const text = String(s.text || '');
  const splitAt = text.indexOf('：');
  const label = splitAt >= 0 ? text.slice(0, splitAt) : /返回|返程|回/.test(text) ? '返程交通' : '交通方式';
  const detail = splitAt >= 0 ? text.slice(splitAt + 1) : text;
  const icon = /飞机|飞|航班|机场|浦东/.test(text) ? 'AIR' : /自驾|开车|租车|还车|车/.test(text) ? 'CAR' : 'GO';
  return `
    <div class="arrival-route">
      <div class="arrival-icon">${esc(icon)}</div>
      <div class="arrival-copy">
        <div class="arrival-label">${esc(label)}</div>
        <div class="arrival-text">${esc(detail)}</div>
      </div>
    </div>`;
}

function renderDestination(s) {
  const children = Array.isArray(s.children) ? s.children : [];
  const intro = s.summary ? `<p class="destination-summary">${esc(s.summary)}</p>` : '';
  const blocks = children.map(child => {
    const fn = child.kind === 'arrival' ? renderArrival : SECTION_RENDERERS[child.type] || renderNote;
    const title = child.kind === 'arrival' ? '' : `<div class="subsection-title">${esc(child.title || '')}</div>`;
    return `
      <div class="subsection" data-kind="${esc(child.kind || child.type || '')}">
        ${title}
        ${fn(child)}
      </div>`;
  }).join('');
  return `<div class="destination-card" data-section-id="${esc(s.id || '')}" data-destination="${esc(s.destination || s.title || '')}">
    ${intro}${blocks}
  </div>`;
}

const SECTION_RENDERERS = {
  flight: renderFlight, hotel: renderHotel, car: renderCar,
  timeline: renderTimeline, costTable: renderCostTable, note: renderNote,
  destination: renderDestination
};

export function renderSections(sections = []) {
  return sections.map((s, i) => {
    const fn = SECTION_RENDERERS[s.type] || renderNote;
    const sectionTitle = esc(s.title || '');
    const destinationPhotoButton = s.type === 'destination' ? `
          <button class="photo-section-btn" type="button" title="给${esc(s.destination || s.title || '这个地点')}添加照片" aria-label="给${esc(s.destination || s.title || '这个地点')}添加照片" data-photo-add data-scope-type="destination" data-section-id="${esc(s.id || '')}" data-label="${esc(s.title || s.destination || '')}">
            <span class="photo-section-btn-icon" aria-hidden="true">📷</span><span class="photo-section-btn-plus" aria-hidden="true">＋</span>
          </button>` : '';
    return `
      <section class="section">
        <div class="section-title"><span class="num">${esc(s.num || i + 1)}</span><span class="section-title-text">${sectionTitle}</span>${destinationPhotoButton}</div>
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
      <div class="g-title"><span class="g-title-mark" aria-hidden="true"></span>${esc(cleanGroupTitle(g.group, '预定'))}</div>
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
  const hasAttach = !!(it.img || it.note);
  return `
    <div class="todo ${it.done ? 'done' : 'pending'}${hasAttach ? ' has-attach' : ''}" data-id="${esc(it.id)}">
      <span class="box">${it.done ? '✓' : ''}</span>
      <div class="t-main">
        <div class="t-name">${esc(it.name || '')}</div>
        ${it.meta ? `<div class="t-meta">${esc(it.meta)}</div>` : ''}
      </div>
      <div class="t-row2">
        <input class="who-input" placeholder="完成人…" value="${esc(it.who || '')}">
        <button class="attach-btn" type="button">📎 附件<span class="dot"></span></button>
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
      <div class="g-title"><span class="g-title-mark" aria-hidden="true"></span>${esc(cleanGroupTitle(g.group, '物品'))}</div>
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
