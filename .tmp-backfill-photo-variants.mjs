import { createRequire } from 'node:module';

const require = createRequire(new URL('./.tmp-photo-tools/package.json', import.meta.url));
const sharp = require('sharp');
const heicConvert = require('heic-convert');

const tripId = process.argv[2] || 'yunnan2026';
const apiBase = process.env.API_BASE || 'https://func-yntravel-ue8266.azurewebsites.net/api';

async function getJson(url, options) {
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${options?.method || 'GET'} ${url} failed: ${resp.status} ${data.error || ''}`);
  return data;
}

async function imageVariant(buffer, maxDim, quality) {
  return sharp(buffer)
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

function isHeic(buffer) {
  return buffer.subarray(4, 12).toString('ascii').startsWith('ftypheic')
    || buffer.subarray(4, 12).toString('ascii').startsWith('ftypheix')
    || buffer.subarray(4, 12).toString('ascii').startsWith('ftyphevc')
    || buffer.subarray(4, 12).toString('ascii').startsWith('ftyphevx');
}

async function normalizeSource(buffer) {
  if (!isHeic(buffer)) return buffer;
  const converted = await heicConvert({ buffer, format: 'JPEG', quality: 0.9 });
  return Buffer.from(converted);
}

async function upload(id, buffer) {
  const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  return getJson(`${apiBase}/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ id, dataUrl })
  });
}

const data = await getJson(`${apiBase}/trips/${encodeURIComponent(tripId)}`);
const trip = data.trip;
const photos = (trip.photos || []).filter(photo => photo && (photo.originalUrl || photo.url));
const results = [];

for (const photo of photos) {
  const sourceUrl = photo.originalUrl || photo.url;
  console.log(`Processing ${photo.caption || photo.id}`);
  const imageResp = await fetch(sourceUrl);
  if (!imageResp.ok) throw new Error(`download ${sourceUrl} failed: ${imageResp.status}`);
  const original = Buffer.from(await imageResp.arrayBuffer());
  const source = await normalizeSource(original);
  const thumbBuffer = await imageVariant(source, 640, 72);
  const displayBuffer = await imageVariant(source, 1600, 78);
  const thumb = await upload(`${photo.id}-thumb`, thumbBuffer);
  const display = await upload(`${photo.id}-display`, displayBuffer);
  if (!photo.originalUrl && photo.url && photo.url !== display.url) photo.originalUrl = photo.url;
  photo.thumbUrl = thumb.url;
  photo.displayUrl = display.url;
  photo.url = display.url;
  photo.updatedAt = new Date().toISOString();
  results.push({
    id: photo.id,
    caption: photo.caption,
    originalBytes: original.length,
    normalizedBytes: source.length,
    heic: isHeic(original),
    thumbBytes: thumb.bytes,
    displayBytes: display.bytes,
    thumbUrl: thumb.url,
    displayUrl: display.url
  });
}

await getJson(`${apiBase}/trips/${encodeURIComponent(tripId)}/save`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ trip })
});

console.log(JSON.stringify({
  ok: true,
  tripId,
  updated: results.length,
  originalMB: +(results.reduce((sum, item) => sum + item.originalBytes, 0) / 1024 / 1024).toFixed(2),
  thumbMB: +(results.reduce((sum, item) => sum + item.thumbBytes, 0) / 1024 / 1024).toFixed(2),
  displayMB: +(results.reduce((sum, item) => sum + item.displayBytes, 0) / 1024 / 1024).toFixed(2),
  maxThumbKB: Math.round(Math.max(...results.map(item => item.thumbBytes)) / 1024),
  maxDisplayKB: Math.round(Math.max(...results.map(item => item.displayBytes)) / 1024),
  results
}, null, 2));