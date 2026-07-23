import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(path.join(root, 'api', 'package.json'));
const { TableClient } = apiRequire('@azure/data-tables');
const { BlobServiceClient } = apiRequire('@azure/storage-blob');

function parseEnvFile(text) {
  return Object.fromEntries(String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    const separator = line.indexOf('=');
    return separator < 0 ? ['', ''] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }).filter(([key]) => key));
}

const sourceConnection = process.env.PRODUCTION_STORAGE_CONNECTION_STRING;
if (!sourceConnection) throw new Error('PRODUCTION_STORAGE_CONNECTION_STRING is required.');
const localSecrets = parseEnvFile(await fs.readFile(path.join(root, '.storage_local'), 'utf8'));
const localConnection = localSecrets.AZURE_STORAGE_CONNECTION_STRING;
if (!localConnection) throw new Error('AZURE_STORAGE_CONNECTION_STRING is missing from .storage_local.');

const sourceTripId = 'yunnan2026-localtest';
const targetTripId = 'yunnan2026';
const sourceTrips = TableClient.fromConnectionString(sourceConnection, 'trips');
const targetTrips = TableClient.fromConnectionString(localConnection, 'trips');
const analysis = TableClient.fromConnectionString(localConnection, 'expenseAnalysis');
const localContainer = BlobServiceClient.fromConnectionString(localConnection).getContainerClient('proofs');
await Promise.all([targetTrips.createTable().catch(() => {}), analysis.createTable().catch(() => {}), localContainer.createIfNotExists({ access: 'blob' })]);

const sourceEntity = await sourceTrips.getEntity('trip', sourceTripId);
const trip = JSON.parse(sourceEntity.data);
const blobUrls = new Set();
function collect(value) {
  if (typeof value === 'string' && /^https:\/\/stynue8266\.blob\.core\.windows\.net\/proofs\//i.test(value)) blobUrls.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(trip);

const replacements = new Map();
for (const sourceUrl of blobUrls) {
  const source = new URL(sourceUrl);
  const blobName = decodeURIComponent(source.pathname.replace(/^\/proofs\//, ''));
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Cannot read source blob ${blobName}: HTTP ${response.status}`);
  const target = localContainer.getBlockBlobClient(blobName);
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  await target.uploadData(Buffer.from(await response.arrayBuffer()), { blobHTTPHeaders: { blobContentType: contentType } });
  replacements.set(sourceUrl, target.url);
}

function rewrite(value) {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
  return value;
}
const localTrip = rewrite(trip);
await targetTrips.upsertEntity({ partitionKey: 'trip', rowKey: targetTripId, data: JSON.stringify(localTrip), createdAt: new Date().toISOString(), migratedFrom: sourceTripId }, 'Replace');

const sidecar = JSON.parse(await fs.readFile(path.join(root, '.tmp-local-expense-analysis.json'), 'utf8').catch(() => '{}'));
const stored = sidecar[sourceTripId] || sidecar[targetTripId];
if (stored && Array.isArray(stored.classifications)) {
  for (const item of stored.classifications) await analysis.upsertEntity({ partitionKey: targetTripId, rowKey: String(item.id), category: item.category, confidence: Number(item.confidence) || 0, analyzedAt: stored.analyzedAt || new Date().toISOString() }, 'Replace');
}

const verified = await targetTrips.getEntity('trip', targetTripId);
const verifiedTrip = JSON.parse(verified.data);
console.log(JSON.stringify({ targetTripId, bytes: Buffer.byteLength(verified.data), people: verifiedTrip.people?.length || 0, expenses: verifiedTrip.expenses?.length || 0, photos: verifiedTrip.photos?.length || 0, sections: verifiedTrip.sections?.length || 0, copiedBlobs: replacements.size, analysisRows: stored?.classifications?.length || 0 }));
