const test = require('node:test');
const assert = require('node:assert/strict');

test('local server targets dedicated local infrastructure without trip id mapping', async () => {
  process.env.LOCAL_DEV_SERVER_NO_LISTEN = '1';
  const server = await import('../../.tmp-local-dev-server.mjs');
  assert.equal(server.productionTripId, 'yunnan2026');
  assert.equal(server.localConfig.environment, 'local');
  assert.match(server.localConfig.resourceGroup, /-local$/);
  assert.equal(server.localConfig.apiBase, 'http://localhost:7071/api');
  assert.equal(server.localConfig.functionApp, null);
});

test('local writes can use normal ids because storage is physically isolated', async () => {
  process.env.LOCAL_DEV_SERVER_NO_LISTEN = '1';
  const server = await import('../../.tmp-local-dev-server.mjs');
  assert.equal(server.isWritableLocalTrip('yunnan2026'), true);
  assert.equal(server.isWritableLocalTrip('another-trip'), true);
  assert.equal(server.isWritableLocalTrip(''), false);
});

test('local and production configurations use different Azure resources', async () => {
  process.env.LOCAL_DEV_SERVER_NO_LISTEN = '1';
  const server = await import('../../.tmp-local-dev-server.mjs');
  const prod = require('../../config/environments/prod.json');
  assert.notEqual(server.localConfig.resourceGroup, prod.resourceGroup);
  assert.notEqual(server.localConfig.storageAccount, prod.storageAccount);
  assert.notEqual(server.localConfig.apiBase, prod.apiBase);
});

test('env-style local secret files are parsed without exposing values', async () => {
  process.env.LOCAL_DEV_SERVER_NO_LISTEN = '1';
  const server = await import('../../.tmp-local-dev-server.mjs');
  assert.deepEqual(server.parseEnvFile('# ignored\nAPI_KEY=abc=123\nAPI_MODEL=gpt-test\n'), {
    API_KEY: 'abc=123',
    API_MODEL: 'gpt-test'
  });
});

test('local saves keep AI classifications in the separate analysis table', async () => {
  process.env.LOCAL_DEV_SERVER_NO_LISTEN = '1';
  const server = await import('../../.tmp-local-dev-server.mjs');
  const stored = server.tripForStorage({
    meta: { title: 'test' },
    expenses: [{ id: 'e1', amount: 10, category: '餐饮', categoryConfidence: 0.9 }],
    expenseAnalysis: { analyzedExpenseCount: 1 }
  });
  assert.deepEqual(stored.expenses, [{ id: 'e1', amount: 10 }]);
  assert.equal('expenseAnalysis' in stored, false);
  const encoded = server.encodeTripData({ text: '行'.repeat(33000) });
  assert.equal(encoded.dataEncoding, 'gzip-base64');
  assert.ok(encoded.data.length < 32000);
});