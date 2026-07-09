/**
 * 图片全屏放大层。
 */
import { $ } from './utils.js';

const lb = $('#lightbox');

export function openLightbox(src) {
  $('#lightboxImg').src = src;
  lb.classList.add('open');
}

export function initLightbox() {
  lb.addEventListener('click', () => lb.classList.remove('open'));
}
