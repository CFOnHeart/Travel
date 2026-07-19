/** 首页逻辑：输入行程 → 生成 → 跳转到行程页；展示最近记录。 */
import { generateTrip } from './api.js';
import { RECENT_KEY } from './config.js';

const $ = (sel) => document.querySelector(sel);

const EXAMPLE = `1. 去程航班 — 7/17 周五 19:15 上海浦东出发 KY3122，含行李托运，约 ¥800/人
2. 住宿 7/17-7/21 共四晚，温德姆至尊酒店 豪华大床房（¥475/晚，室内恒温泳池、2024新店），人均约 950
3. 7/21 早 7:55 DR5051 飞丽江，含机建燃油 ¥340/人（提醒：行李托运只有 10kg 额度）
4. 7/21 机场租车，小鹏G7，¥250/天，租四天，含保险，约 1300，人均约 450
5. 7/21 白天去玉龙雪山（不想爬山可只看蓝月谷），傍晚逛丽江古镇并入住，约 ¥300/间，人均 150
6. 7/22 开车前往泸沽湖（约 3 小时），住前湖·月遥全湖景度假酒店，湖景露台大床房 ¥542/晚共两晚，有充电桩
7. 7/24 开车返回丽江，随便逛逛，可在束河古镇或机场旁住一晚
8. 7/25 机场还车，飞回上海浦东

已完成：出发机票（淦珺）、西双版纳住宿（淦珺）、泸沽湖住宿（雯雯）`;

// label 必须与后端 api/src/functions/trips.js 的 GENERATION_STAGE_DEFS 保持一致；atMs 是前端 timed 模式的展示节奏。
const GENERATION_STAGES = [
  { id: 'parse', label: '解析行程文本', atMs: 0 },
  { id: 'extract', label: '提取航班与住宿', atMs: 5000 },
  { id: 'organize', label: '整理目的地与清单', atMs: 12000 },
  { id: 'review', label: '复核结构', atMs: 20000 },
];
const SLOW_HINT_MS = 30000;
const DONE_PAUSE_MS = 600;

let progressTimer = null;
let progressStart = 0;

function renderRecent() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { list = []; }
  const box = $('#recentList');
  if (!list.length) { box.innerHTML = '<p class="recent-empty">还没有生成过行程。</p>'; return; }
  box.innerHTML = list.map(x => `
    <a class="recent-item" href="trip.html?trip=${encodeURIComponent(x.tripId)}">
      <div class="r-title">${escapeHtml(x.title || '未命名行程')}</div>
      <div class="r-sub">${escapeHtml(x.sub || '')}</div>
    </a>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pushRecent(tripId, trip) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const meta = trip.meta || {};
    const next = [{ tripId, title: meta.title || '未命名行程', sub: meta.subtitle || '', at: Date.now() }, ...list.filter(x => x.tripId !== tripId)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

function stageClass(status) {
  if (status === 'done') return 'done';
  if (status === 'skipped') return 'skipped';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function renderTimedStages(activeIndex) {
  const list = $('#genStageList');
  if (!list) return;
  list.innerHTML = GENERATION_STAGES.map((stage, index) => {
    const cls = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
    return `<li class="gen-stage ${cls}" data-stage="${stage.id}"><span class="gen-stage-dot" aria-hidden="true"></span>${escapeHtml(stage.label)}</li>`;
  }).join('');
}

function renderResponseStages(stages) {
  const list = $('#genStageList');
  if (!list || !Array.isArray(stages) || !stages.length) return;
  list.innerHTML = stages.map(stage => `
    <li class="gen-stage ${stageClass(stage.status)}" data-stage="${escapeHtml(stage.id)}">
      <span class="gen-stage-dot" aria-hidden="true"></span>${escapeHtml(stage.label)}
    </li>`).join('');
}

function startProgress() {
  progressStart = Date.now();
  renderTimedStages(0);
  const sub = $('#genOverlaySub');
  if (sub) sub.textContent = 'AI 正在整理你的行程，请稍候…';
  progressTimer = setInterval(() => {
    const elapsed = Date.now() - progressStart;
    let activeIndex = 0;
    for (let i = GENERATION_STAGES.length - 1; i >= 0; i--) {
      if (elapsed >= GENERATION_STAGES[i].atMs) { activeIndex = i; break; }
    }
    renderTimedStages(activeIndex);
    if (elapsed >= SLOW_HINT_MS && sub) {
      sub.textContent = '仍在处理中，复杂行程可能需要更久…';
    }
  }, 400);
}

function stopProgress() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function onGenerate() {
  const text = $('#tripText').value.trim();
  const status = $('#genStatus');
  status.className = 'gen-status';
  if (text.length < 10) { status.className = 'gen-status err'; status.textContent = '请先输入行程描述（至少 10 个字）。'; return; }

  $('#genBtn').disabled = true;
  $('#genOverlay').classList.add('open');
  startProgress();
  try {
    const data = await generateTrip(text);
    stopProgress();
    renderResponseStages(data.stages);
    const sub = $('#genOverlaySub');
    if (sub) sub.textContent = '行程已生成，正在打开…';
    await wait(DONE_PAUSE_MS);
    pushRecent(data.tripId, data.trip);
    location.href = `trip.html?trip=${encodeURIComponent(data.tripId)}`;
  } catch (e) {
    stopProgress();
    renderResponseStages(GENERATION_STAGES.map(s => ({ ...s, status: 'failed' })));
    const sub = $('#genOverlaySub');
    if (sub) sub.textContent = '生成失败，请重试或简化描述';
    await wait(800);
    status.className = 'gen-status err';
    status.textContent = e.message;
  } finally {
    stopProgress();
    $('#genBtn').disabled = false;
    $('#genOverlay').classList.remove('open');
  }
}

$('#genBtn').addEventListener('click', onGenerate);
$('#exampleBtn').addEventListener('click', () => { $('#tripText').value = EXAMPLE; });
renderRecent();
