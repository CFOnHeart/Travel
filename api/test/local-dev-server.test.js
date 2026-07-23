const test = require('node:test');
const assert = require('node:assert/strict');

test('local yunnan2026 requests map to the isolated online test copy', async () => {
  process.env.LOCAL_DEV_SERVER_NO_LISTEN = '1';
  const server = await import('../../.tmp-local-dev-server.mjs');
  assert.equal(server.productionTripId, 'yunnan2026');
  assert.equal(server.testTripId, 'yunnan2026-localtest');
  assert.equal(server.cloudTripId('yunnan2026'), 'yunnan2026-localtest');
  assert.equal(server.cloudTripId('another-trip'), 'another-trip');
});

test('local writes are restricted to dedicated test trip ids', async () => {
  process.env.LOCAL_DEV_SERVER_NO_LISTEN = '1';
  const server = await import('../../.tmp-local-dev-server.mjs');
  assert.equal(server.isWritableTestTrip('yunnan2026'), true);
  assert.equal(server.isWritableTestTrip('yunnan2026-localtest'), true);
  assert.equal(server.isWritableTestTrip('localtest-generated'), true);
  assert.equal(server.isWritableTestTrip('real-customer-trip'), false);
});