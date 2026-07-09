/**
 * 通用工具：DOM 选择、HTML 转义、格式化、图片压缩。
 */
import { IMAGE_MAX_DIM, IMAGE_QUALITY } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 转义 HTML，防止注入。 */
export function esc(s) {
  return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 两位补零。 */
export const pad = n => (n < 10 ? '0' : '') + n;

/** 金额格式化：去掉多余的 .00。 */
export const fmtMoney = n => (Number(n) || 0).toFixed(2).replace(/\.00$/, '');

/** ISO → “M/D HH:mm”。 */
export function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 时间轴刻度：“M/D<br>HH:mm”。 */
export function fmtTick(t) {
  const d = new Date(t);
  if (isNaN(d)) return '';
  return `${d.getMonth() + 1}/${d.getDate()}<br>${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date → datetime-local 输入框的值。 */
export function toInputValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 用 canvas 压缩图片，回调返回 base64 dataURL。 */
export function downscale(file, cb, maxDim = IMAGE_MAX_DIM, quality = IMAGE_QUALITY) {
  const img = new Image();
  const reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(c.toDataURL('image/jpeg', quality));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
