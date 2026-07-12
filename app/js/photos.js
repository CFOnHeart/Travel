import { uploadImage } from './api.js';
import { esc } from './render.js';

const THREE_URL = 'https://esm.sh/three@0.160.0';
const ORBIT_CONTROLS_URL = 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
const CSS3D_RENDERER_URL = 'https://esm.sh/three@0.160.0/examples/jsm/renderers/CSS3DRenderer.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function genId() { return 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function photoList(trip) {
  trip.photos = Array.isArray(trip.photos) ? trip.photos : [];
  return trip.photos;
}

function destinations(trip) {
  const names = (trip.sections || [])
    .filter(section => section.type === 'destination')
    .map(section => section.destination || section.title)
    .filter(Boolean);
  return [...new Set(names)];
}

function scopeOptions(trip) {
  const options = [{ value: 'trip|||', label: '整个行程', scope: { type: 'trip' }, destination: '' }];
  (trip.sections || []).forEach(section => {
    if (section.type !== 'destination') return;
    const destination = section.destination || section.title || '';
    options.push({
      value: ['destination', section.id || '', '', ''].join('|'),
      label: `${section.title || destination}`,
      destination,
      scope: { type: 'destination', sectionId: section.id || '' }
    });
    (section.children || []).forEach(child => {
      if (child.type !== 'timeline') return;
      (child.items || []).forEach(item => {
        options.push({
          value: ['timelineItem', section.id || '', child.id || '', item.id || ''].join('|'),
          label: `${item.day || ''} ${item.heading || ''}`.trim() || section.title || destination,
          destination,
          scope: { type: 'timelineItem', sectionId: section.id || '', childId: child.id || '', itemId: item.id || '' }
        });
      });
    });
  });
  return options;
}

function scopeValue(scope = {}) {
  return [scope.type || 'trip', scope.sectionId || '', scope.childId || '', scope.itemId || ''].join('|');
}

function scopeFromValue(value) {
  const [type, sectionId, childId, itemId] = String(value || 'trip|||').split('|');
  return { type: type || 'trip', sectionId: sectionId || '', childId: childId || '', itemId: itemId || '' };
}

function scopeLabel(trip, photo) {
  const value = scopeValue(photo.scope);
  const found = scopeOptions(trip).find(option => option.value === value);
  return found ? found.label : (photo.destination || '整个行程');
}

function fmtDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function shuffle(list) {
  const next = [...list];
  for (let index = next.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

const WALL_SLOTS = [
  { x: 3, y: 10, w: 25, r: -9, z: 2 },
  { x: 32, y: 3, w: 23, r: 4, z: 3 },
  { x: 70, y: 8, w: 23, r: -4, z: 2 },
  { x: 9, y: 42, w: 21, r: 7, z: 4 },
  { x: 38, y: 27, w: 33, r: -3, z: 8 },
  { x: 75, y: 40, w: 19, r: 8, z: 3 },
  { x: 1, y: 72, w: 25, r: -5, z: 2 },
  { x: 31, y: 70, w: 22, r: 5, z: 5 },
  { x: 62, y: 68, w: 31, r: -7, z: 4 }
];

function wallStyle(slot, index) {
  const rotate = slot.r + Math.round((Math.random() * 5 - 2.5) * 10) / 10;
  const scale = 0.9 + Math.random() * 0.2;
  return `--x:${slot.x}%;--y:${slot.y}%;--w:${slot.w}%;--r:${rotate}deg;--s:${scale.toFixed(3)};--z:${slot.z + index};`;
}

function photoRatioClass(photo, index) {
  if (photo.orientation) return ` ${photo.orientation}`;
  return ['landscape', 'portrait', 'square'][index % 3] ? ` ${['landscape', 'portrait', 'square'][index % 3]}` : '';
}

function mountClass(index) {
  return ` pinned pin-${index % 6}`;
}

function thumbSrc(photo) {
  return photo.thumbUrl || photo.displayUrl || photo.url;
}

function displaySrc(photo) {
  return photo.displayUrl || photo.url;
}

function originalSrc(photo) {
  return photo.originalUrl || photo.url || photo.displayUrl;
}

function downloadName(photo, size) {
  const base = String(photo.caption || photo.destination || photo.id || 'travel-photo')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'travel-photo';
  return `${base}-${size}.jpg`;
}

function sphereItems(photos) {
  const selected = photos.slice(0, 12);
  return selected.map((photo, index) => `
    <button class="photo-sphere-item" type="button" data-photo-id="${esc(photo.id)}" data-sphere-index="${index}">
      <img src="${esc(thumbSrc(photo))}" alt="${esc(photo.caption || '旅行照片')}" loading="lazy" decoding="async">
    </button>`).join('');
}

export function renderPhotosPanel(trip) {
  const photos = photoList(trip).filter(photo => photo && photo.url);
  const dests = destinations(trip);
  const shuffled = shuffle(photos);
  const wallPhotos = shuffled.slice(0, 9);
  const spherePhotos = shuffled.slice(0, 12);
  const chips = ['全部', ...dests].map((name, index) => `<button class="photo-filter${index ? '' : ' active'}" type="button" data-destination="${index ? esc(name) : ''}">${esc(name)}</button>`).join('');
  const cards = wallPhotos.map((photo, index) => `
    <button class="photo-tile photo-pin ${mountClass(index)}${photoRatioClass(photo, index)}" type="button" data-photo-id="${esc(photo.id)}" style="${wallStyle(WALL_SLOTS[index], index)}">
      <img src="${esc(thumbSrc(photo))}" alt="${esc(photo.caption || '旅行照片')}" loading="lazy" decoding="async">
      <span class="photo-tile-meta"><b>${esc(photo.destination || '行程')}</b>${photo.caption ? `<small>${esc(photo.caption)}</small>` : ''}</span>
    </button>`).join('');

  return `
    <div class="photo-wall-head">
      <div>
        <div class="photo-eyebrow">Photos</div>
        <h2>照片墙</h2>
        <p>把照片放回它发生的地点、日期和行程片段里。</p>
      </div>
      <div class="photo-wall-actions">
        <button class="photo-reshuffle" type="button" data-photo-reshuffle>重新排布</button>
        <button class="photo-add-main" type="button" data-photo-add data-scope-type="trip">上传照片</button>
      </div>
    </div>
    <div class="photo-filters">${chips}</div>
    <div class="photo-exhibit">
      <div class="photo-wall-board">${cards || '<div class="photo-empty"><b>还没有照片</b><span>上传第一张照片，给这趟行程留下一点光。</span></div>'}</div>
      <aside class="photo-sphere-panel">
        <div class="photo-sphere-copy"><span>Sphere</span><b>旋转照片球</b><small>自动旋转，也可以拖动查看。</small></div>
        <div class="photo-sphere" data-photo-sphere data-rot-x="-12" data-rot-y="0">
          <div class="photo-sphere-3d" data-photo-sphere-3d></div>
          <div class="photo-sphere-orbit" data-photo-sphere-orbit>${sphereItems(spherePhotos)}</div>
        </div>
      </aside>
    </div>`;
}

export function initPhotos(ctx) {
  let editingPhoto = null;
  let modalScope = { type: 'trip' };
  let selectedDataUrl = '';
  let sphereDragged = false;
  let sphereRotX = -0.18;
  let sphereRotY = 0;
  let spherePointerDown = false;
  let sphereFrame = 0;
  let threeModulesPromise = null;
  let sphere3d = null;

  function trip() { return ctx.getTrip(); }

  function filteredPhotos() {
    const active = $('.photo-filter.active');
    const destination = active ? active.dataset.destination : '';
    return photoList(trip()).filter(photo => photo && photo.url && (!destination || photo.destination === destination));
  }

  function syncSphere() {
    const orbit = $('[data-photo-sphere-orbit]');
    const photos = shuffle(filteredPhotos()).slice(0, 18);
    if (orbit) orbit.innerHTML = sphereItems(photos.slice(0, 12));
    setupPhotoSphere3d(photos).catch(() => {
      const sphere = $('[data-photo-sphere]');
      if (sphere) sphere.classList.remove('three-ready');
      layoutSphere();
    });
  }

  async function loadThreeModules() {
    if (!threeModulesPromise) {
      threeModulesPromise = Promise.all([
        import(THREE_URL),
        import(ORBIT_CONTROLS_URL),
        import(CSS3D_RENDERER_URL)
      ]).then(([THREE, controls, css3d]) => ({ THREE, OrbitControls: controls.OrbitControls, CSS3DRenderer: css3d.CSS3DRenderer, CSS3DObject: css3d.CSS3DObject }));
    }
    return threeModulesPromise;
  }

  function clearSphere3d() {
    if (!sphere3d) return;
    sphere3d.objects.forEach(object => {
      if (object.element && object.element.parentNode) object.element.parentNode.removeChild(object.element);
      sphere3d.group.remove(object);
    });
    sphere3d.objects = [];
  }

  async function setupPhotoSphere3d(photos) {
    const host = $('[data-photo-sphere-3d]');
    const sphere = $('[data-photo-sphere]');
    if (!host || !sphere || !photos.length) return;
    const { THREE, OrbitControls, CSS3DRenderer, CSS3DObject } = await loadThreeModules();
    if (!sphere3d || sphere3d.host !== host) {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 1, 2000);
      camera.position.set(0, 0, 620);
      const group = new THREE.Group();
      scene.add(group);
      const renderer = new CSS3DRenderer();
      renderer.domElement.className = 'photo-sphere-css3d';
      host.innerHTML = '';
      host.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.85;
      const resizeObserver = new ResizeObserver(() => resizeSphere3d());
      resizeObserver.observe(sphere);
      sphere3d = { THREE, CSS3DObject, scene, camera, group, renderer, controls, host, sphere, objects: [], resizeObserver };
      animateSphere3d();
    }

    clearSphere3d();
    photos.forEach((photo, index) => {
      const point = spherePoint(index, photos.length);
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'photo-sphere-card';
      element.dataset.photoId = photo.id;
      element.innerHTML = `<img src="${esc(thumbSrc(photo))}" alt="${esc(photo.caption || '旅行照片')}" loading="lazy" decoding="async">`;
      element.addEventListener('click', event => {
        event.stopPropagation();
        const current = photoList(trip()).find(item => item.id === photo.id);
        if (current) openLightbox(current);
      });
      const object = new CSS3DObject(element);
      const rect = sphere.getBoundingClientRect();
      const radius = Math.max(125, Math.min(rect.width, rect.height) * 0.29);
      object.position.set(point.x * radius, point.y * radius, point.z * radius);
      object.lookAt(object.position.clone().multiplyScalar(2));
      sphere3d.group.add(object);
      sphere3d.objects.push(object);
    });
    resizeSphere3d();
    sphere.classList.add('three-ready');
  }

  function resizeSphere3d() {
    if (!sphere3d) return;
    const rect = sphere3d.sphere.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    sphere3d.camera.aspect = width / height;
    sphere3d.camera.updateProjectionMatrix();
    sphere3d.renderer.setSize(width, height);
  }

  function animateSphere3d() {
    if (sphere3d) {
      sphere3d.controls.update();
      sphere3d.renderer.render(sphere3d.scene, sphere3d.camera);
    }
    requestAnimationFrame(animateSphere3d);
  }

  function spherePoint(index, total) {
    if (total <= 1) return { x: 0, y: 0, z: 1 };
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (index / (total - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = index * golden;
    return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
  }

  function layoutSphere() {
    const sphere = $('[data-photo-sphere]');
    if (!sphere) return;
    const items = $$('.photo-sphere-item', sphere);
    const rect = sphere.getBoundingClientRect();
    const radius = Math.max(96, Math.min(rect.width, rect.height) * 0.33);
    const perspective = 520;
    const cosY = Math.cos(sphereRotY), sinY = Math.sin(sphereRotY);
    const cosX = Math.cos(sphereRotX), sinX = Math.sin(sphereRotX);
    items.forEach((item, index) => {
      const p = spherePoint(index, items.length);
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      const y1 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;
      const depth = (z2 + 1) / 2;
      const scale = perspective / (perspective - z2 * radius * 0.72);
      const sizeScale = 0.78 + depth * 0.46;
      const x = rect.width / 2 + x1 * radius - 46;
      const y = rect.height / 2 + y1 * radius - 34;
      item.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(scale * sizeScale).toFixed(3)})`;
      item.style.opacity = (0.34 + depth * 0.66).toFixed(3);
      item.style.zIndex = String(Math.round(depth * 100));
      item.style.filter = depth < 0.28 ? 'saturate(.72) blur(.35px)' : 'saturate(1)';
    });
  }

  function animateSphere() {
    if (!spherePointerDown) sphereRotY += 0.0042;
    layoutSphere();
    sphereFrame = requestAnimationFrame(animateSphere);
  }

  function ensureSphereAnimation() {
    if (!sphereFrame) sphereFrame = requestAnimationFrame(animateSphere);
  }

  function fillSelects(photo) {
    const destSelect = $('#photoDestination');
    const scopeSelect = $('#photoScope');
    const dests = destinations(trip());
    const options = scopeOptions(trip());
    destSelect.innerHTML = `<option value="">整个行程</option>${dests.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}`;
    scopeSelect.innerHTML = options.map(option => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join('');
    const scope = photo ? photo.scope : modalScope;
    scopeSelect.value = scopeValue(scope);
    const currentOption = options.find(option => option.value === scopeSelect.value);
    destSelect.value = (photo && photo.destination) || (currentOption && currentOption.destination) || '';
  }

  function renderPreview(url) {
    const preview = $('#photoPreview');
    preview.innerHTML = url ? `<img src="${esc(url)}" alt="预览">` : '';
  }

  function openPhotoModal(scope = { type: 'trip' }, label = '', photo = null) {
    editingPhoto = photo;
    modalScope = scope;
    selectedDataUrl = '';
    $('#photoModalTitle').textContent = photo ? '编辑照片' : '添加照片';
    $('#photoScopeText').textContent = label || (photo ? scopeLabel(trip(), photo) : '整个行程');
    $('#photoCaption').value = photo ? (photo.caption || '') : '';
    $('#photoFile').value = '';
    fillSelects(photo);
    renderPreview(photo ? displaySrc(photo) : '');
    $('#photoModal').classList.add('open');
  }

  function closePhotoModal() { $('#photoModal').classList.remove('open'); }

  function downscale(file, cb, maxDim = 1600, quality = 0.78) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        cb(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function savePhoto() {
    const list = photoList(trip());
    const scope = scopeFromValue($('#photoScope').value);
    const destination = $('#photoDestination').value;
    const caption = $('#photoCaption').value.trim().slice(0, 160);
    let photo = editingPhoto;
    if (!photo) {
      if (!selectedDataUrl) { $('#photoDrop').focus(); return; }
      photo = { id: genId(), uploadedAt: new Date().toISOString() };
      list.unshift(photo);
    }
    if (selectedDataUrl) {
      const thumbDataUrl = selectedDataUrl.thumb || selectedDataUrl.display || selectedDataUrl;
      const displayDataUrl = selectedDataUrl.display || selectedDataUrl.thumb || selectedDataUrl;
      const [thumbUrl, displayUrl] = await Promise.all([
        uploadImage(`${photo.id}-thumb`, thumbDataUrl),
        uploadImage(`${photo.id}-display`, displayDataUrl)
      ]);
      photo.thumbUrl = thumbUrl;
      photo.displayUrl = displayUrl;
      photo.url = displayUrl;
    }
    if (!photo.url) throw new Error('请先选择照片');
    photo.caption = caption;
    photo.destination = destination;
    photo.scope = scope;
    photo.updatedAt = new Date().toISOString();
    photo.span = photo.span || (list.length % 5 === 0 ? 2 : 1);
    closePhotoModal();
    ctx.render();
    await ctx.save();
  }

  function openLightbox(photo) {
    const photos = filteredPhotos();
    let index = Math.max(0, photos.findIndex(item => item.id === photo.id));
    const overlay = document.createElement('div');
    overlay.className = 'photo-lightbox open';
    overlay.innerHTML = `
      <div class="photo-lightbox-stage">
        <button class="photo-nav photo-prev" type="button" aria-label="上一张">‹</button>
        <img alt="" decoding="async">
        <div class="photo-loading" aria-live="polite"><span></span><b>照片加载中...</b></div>
        <button class="photo-nav photo-next" type="button" aria-label="下一张">›</button>
      </div>
      <aside class="photo-lightbox-info">
        <button class="photo-close" type="button">×</button>
        <span data-photo-kicker></span>
        <h3 data-photo-title></h3>
        <p data-photo-scope></p>
        <div class="photo-lightbox-count" data-photo-count></div>
        <div class="photo-downloads">
          <a class="tool-btn" data-download-display href="#">下载当前尺寸</a>
          <a class="tool-btn" data-download-original href="#">下载原图</a>
        </div>
        <button class="tool-btn" type="button" data-edit>编辑信息</button>
        <button class="tool-btn danger" type="button" data-delete>删除照片</button>
      </aside>`;
    document.body.appendChild(overlay);

    const current = () => photos[index] || photo;
    let loading = false;
    let renderToken = 0;
    let loadingTimer = 0;
    const setLoading = value => {
      loading = value;
      overlay.classList.toggle('is-loading', value);
      $$('.photo-nav', overlay).forEach(button => { button.disabled = value; });
    };
    const render = () => {
      const active = current();
      const image = overlay.querySelector('.photo-lightbox-stage img');
      const nextSrc = displaySrc(active);
      const token = ++renderToken;
      if (loadingTimer) clearTimeout(loadingTimer);
      image.closest('.photo-lightbox-stage')?.classList.remove('photo-load-failed');
      setLoading(true);
      overlay.querySelector('[data-photo-kicker]').textContent = `${active.destination || '旅行照片'} ${fmtDate(active.uploadedAt)}`;
      overlay.querySelector('[data-photo-title]').textContent = active.caption || '未命名照片';
      overlay.querySelector('[data-photo-scope]').textContent = scopeLabel(trip(), active);
      overlay.querySelector('[data-photo-count]').textContent = `${index + 1} / ${photos.length || 1}`;
      const displayLink = overlay.querySelector('[data-download-display]');
      displayLink.href = displaySrc(active);
      displayLink.download = downloadName(active, 'display');
      const originalLink = overlay.querySelector('[data-download-original]');
      originalLink.href = originalSrc(active);
      originalLink.download = downloadName(active, 'original');
      const loader = new Image();
      const finish = failed => {
        if (token !== renderToken) return;
        if (loadingTimer) clearTimeout(loadingTimer);
        image.src = nextSrc;
        image.alt = active.caption || '';
        image.closest('.photo-lightbox-stage')?.classList.toggle('photo-load-failed', !!failed);
        setLoading(false);
      };
      loader.onload = () => finish(false);
      loader.onerror = () => finish(true);
      loadingTimer = setTimeout(() => finish(true), 8000);
      loader.src = nextSrc;
    };
    const go = delta => {
      if (!photos.length || loading) return;
      index = (index + delta + photos.length) % photos.length;
      render();
    };
    const close = () => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
    };
    const onKeydown = event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if (event.key === 'Escape') close();
    };

    render();
    overlay.querySelector('.photo-lightbox-stage img').addEventListener('load', event => {
      event.currentTarget.closest('.photo-lightbox-stage')?.classList.remove('photo-load-failed');
    });
    document.addEventListener('keydown', onKeydown);
    overlay.querySelector('.photo-close').addEventListener('click', close);
    overlay.querySelector('.photo-prev').addEventListener('click', () => go(-1));
    overlay.querySelector('.photo-next').addEventListener('click', () => go(1));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-edit]').addEventListener('click', () => { const active = current(); close(); openPhotoModal(active.scope, scopeLabel(trip(), active), active); });
    overlay.querySelector('[data-delete]').addEventListener('click', async () => {
      const active = current();
      trip().photos = photoList(trip()).filter(item => item.id !== active.id);
      close();
      ctx.render();
      await ctx.save();
    });
  }

  document.addEventListener('click', event => {
    if (event.target.closest('.main-tab[data-mtab="photos"]')) {
      requestAnimationFrame(() => requestAnimationFrame(() => { syncSphere(); ensureSphereAnimation(); }));
      setTimeout(() => { syncSphere(); ensureSphereAnimation(); }, 220);
      return;
    }
    const add = event.target.closest('[data-photo-add]');
    if (add) {
      const scope = {
        type: add.dataset.scopeType || 'trip',
        sectionId: add.dataset.sectionId || add.closest('[data-section-id]')?.dataset.sectionId || '',
        childId: add.dataset.childId || '',
        itemId: add.dataset.itemId || ''
      };
      openPhotoModal(scope, add.dataset.label || '整个行程');
      return;
    }
    const tile = event.target.closest('.photo-tile');
    if (tile) {
      if (sphereDragged && tile.classList.contains('photo-sphere-item')) { sphereDragged = false; return; }
      const photo = photoList(trip()).find(item => item.id === tile.dataset.photoId);
      if (photo) openLightbox(photo);
      return;
    }
    const filter = event.target.closest('.photo-filter');
    if (filter) {
      $$('.photo-filter').forEach(btn => btn.classList.toggle('active', btn === filter));
      const dest = filter.dataset.destination;
      $$('.photo-tile').forEach(tile => {
        const photo = photoList(trip()).find(item => item.id === tile.dataset.photoId);
        tile.hidden = !!dest && photo && photo.destination !== dest;
      });
      syncSphere();
      return;
    }
    if (event.target.closest('[data-photo-reshuffle]')) {
      ctx.render();
      requestAnimationFrame(() => { syncSphere(); ensureSphereAnimation(); });
    }
  });

  document.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.currentSrc || !img.closest('.photo-wall-board, [data-photo-sphere], .photo-lightbox')) return;
    const holder = img.closest('button, .photo-lightbox-stage');
    if (holder) holder.classList.add('photo-load-failed');
  }, true);

  function beginSphereDrag(event, moveName, upName) {
    const sphere = event.target.closest('[data-photo-sphere]');
    if (sphere && sphere.classList.contains('three-ready')) return;
    if (!sphere || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    sphereDragged = false;
    spherePointerDown = true;
    sphere.classList.add('dragging');
    const startX = event.clientX;
    const startY = event.clientY;
    const baseX = sphereRotX;
    const baseY = sphereRotY;
    function move(moveEvent) {
      sphereDragged = true;
      sphereRotX = Math.max(-0.95, Math.min(0.95, baseX - (moveEvent.clientY - startY) * 0.006));
      sphereRotY = baseY + (moveEvent.clientX - startX) * 0.008;
      layoutSphere();
    }
    function up() {
      spherePointerDown = false;
      sphere.classList.remove('dragging');
      document.removeEventListener(moveName, move);
      document.removeEventListener(upName, up);
    }
    document.addEventListener(moveName, move);
    document.addEventListener(upName, up);
  }

  document.addEventListener('pointerdown', event => beginSphereDrag(event, 'pointermove', 'pointerup'), true);
  document.addEventListener('mousedown', event => beginSphereDrag(event, 'mousemove', 'mouseup'), true);
  ensureSphereAnimation();
  requestAnimationFrame(syncSphere);

  $('#photoDrop')?.addEventListener('click', () => $('#photoFile').click());
  $('#photoFile')?.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    downscale(file, thumb => {
      downscale(file, display => {
        selectedDataUrl = { thumb, display };
        renderPreview(display);
      }, 1600, 0.78);
    }, 640, 0.72);
  });
  $('#photoCancel')?.addEventListener('click', closePhotoModal);
  $('#photoModal')?.addEventListener('click', event => { if (event.target.id === 'photoModal') closePhotoModal(); });
  $('#photoSave')?.addEventListener('click', async () => {
    const btn = $('#photoSave');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '保存中...';
    try { await savePhoto(); }
    catch (error) { alert('照片保存失败：' + error.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });
}
