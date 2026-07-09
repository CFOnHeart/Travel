/**
 * 预定清单条目的「附件」弹窗：完成人、文字说明、图片凭证。
 * 通过 open(item, st, onSave) 打开；保存时（含图片上传）回调 onSave(fields)。
 */
import { $, esc, downscale } from './utils.js';
import { uploadImage } from './api.js';
import { openLightbox } from './lightbox.js';

const mask = $('#attachModal');

let current = null;        // { item, st, onSave }
let previewSrc = null;     // 当前预览图（已存 URL 或新的 dataURL）
let previewIsNew = false;  // 是否为待上传的新图

export function isAttachmentOpen() {
  return mask.classList.contains('open');
}

export function openAttachmentModal(item, st, onSave) {
  current = { item, st, onSave };
  previewSrc = st.img || null;
  previewIsNew = false;
  $('#mTitle').textContent = item.name;
  $('#mMeta').textContent = item.meta;
  $('#mWho').value = st.who || '';
  $('#mNote').value = st.note || '';
  $('#mFile').value = '';
  renderPreview();
  mask.classList.add('open');
}

function close() { mask.classList.remove('open'); }

function renderPreview() {
  const p = $('#mPreview');
  if (!previewSrc) { p.innerHTML = ''; return; }
  p.innerHTML = `<img src="${previewSrc}" alt="预览"><br><span class="rm">✕ 移除图片</span>`;
  $('img', p).addEventListener('click', () => openLightbox(previewSrc));
  $('.rm', p).addEventListener('click', () => { previewSrc = null; previewIsNew = false; renderPreview(); });
}

async function onSaveClick() {
  const btn = $('#mSave');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    let img = current.st.img || '';
    if (previewSrc === null) img = '';                                   // 移除了图片
    else if (previewIsNew) img = await uploadImage(current.item.id, previewSrc); // 新图上传
    current.onSave({ who: $('#mWho').value, note: $('#mNote').value, img });
    close();
  } catch (e) {
    alert('保存失败：' + e.message + '\n请检查网络后重试。');
  } finally {
    btn.disabled = false; btn.textContent = '保存';
  }
}

export function initAttachmentModal() {
  $('#mDrop').addEventListener('click', () => $('#mFile').click());
  $('#mFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    downscale(f, dataUrl => { previewSrc = dataUrl; previewIsNew = true; renderPreview(); });
  });
  $('#mCancel').addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  $('#mSave').addEventListener('click', onSaveClick);
}
