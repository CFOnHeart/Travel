const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/expense-split-trip.json');
const { __test } = require('../src/functions/trips.js');

const clone = value => JSON.parse(JSON.stringify(value));

async function model() {
  return import('../../app/js/expense-model.js');
}

test('equal split distributes cent remainder without losing money', async () => {
  const { splitExpense } = await model();
  const people = fixture.people;
  const allocations = splitExpense({ amount: 100, participantIds: people.map(person => person.id) }, people);
  assert.deepEqual(allocations.map(item => item.amount), [33.34, 33.33, 33.33]);
  assert.equal(allocations.reduce((sum, item) => sum + item.amount, 0), 100);
});

test('timeline positions keep nearby expense cards from overlapping', async () => {
  const { spreadTimelinePositions } = await model();
  assert.deepEqual(spreadTimelinePositions([10, 10, 25, 300], 92), [10, 102, 194, 300]);
});

test('ledger separates actual payment from personal expense and supports legacy records', async () => {
  const { expenseLedger } = await model();
  const ledger = expenseLedger(fixture.people, fixture.expenses);
  assert.equal(ledger.total, 480);
  assert.equal(ledger.stats['person-a'].paid, 80);
  assert.equal(ledger.stats['person-a'].owed, 130);
  assert.equal(ledger.stats['person-b'].paid, 300);
  assert.equal(ledger.stats['person-b'].owed, 100);
  assert.equal(ledger.stats['person-c'].paid, 100);
  assert.equal(ledger.stats['person-c'].owed, 250);
});

test('settlement produces balanced transfers from debtors to creditors', async () => {
  const { settlementTransfers } = await model();
  const transfers = settlementTransfers(fixture.people, fixture.expenses);
  assert.deepEqual(transfers, [
    { fromId: 'person-a', toId: 'person-b', amount: 50 },
    { fromId: 'person-c', toId: 'person-b', amount: 150 }
  ]);
});

test('legacy expense without participants is borne only by its payer', async () => {
  const { normalizeExpense } = await model();
  const legacy = normalizeExpense({ personId: 'person-c', amount: 100 }, fixture.people);
  assert.deepEqual(legacy.participantIds, ['person-c']);
  assert.deepEqual(legacy.allocations, [{ personId: 'person-c', amount: 100 }]);
});

test('expense tool creates an equal split for selected participants in memory only', () => {
  const trip = clone({ people: fixture.people, expenses: [] });
  __test.executeToolCall(trip, {
    action: 'expense.item',
    args: {
      operation: 'add', personName: 'B', amount: 100, note: '午餐',
      participantNames: ['A', 'B', 'C'], splitMode: 'equal', time: '2026-07-21T04:00:00.000Z'
    }
  });
  assert.equal(trip.expenses.length, 1);
  assert.equal(trip.expenses[0].payerId, 'person-b');
  assert.deepEqual(trip.expenses[0].allocations.map(item => item.amount), [33.34, 33.33, 33.33]);
});

test('expense tool preserves validated custom allocations in memory only', () => {
  const trip = clone({ people: fixture.people, expenses: [] });
  __test.executeToolCall(trip, {
    action: 'expense.item',
    args: {
      operation: 'add', personName: 'A', amount: 80, note: '打车',
      participantNames: ['A', 'C'], splitMode: 'custom',
      allocations: [{ personName: 'A', amount: 30 }, { personName: 'C', amount: 50 }],
      time: '2026-07-21T05:00:00.000Z'
    }
  });
  assert.deepEqual(trip.expenses[0].participantIds, ['person-a', 'person-c']);
  assert.deepEqual(trip.expenses[0].allocations, [
    { personId: 'person-a', amount: 30 },
    { personId: 'person-c', amount: 50 }
  ]);
});

test('expense tool rejects custom allocations whose sum differs from total', () => {
  const trip = clone({ people: fixture.people, expenses: [] });
  assert.throws(() => __test.executeToolCall(trip, {
    action: 'expense.item',
    args: {
      operation: 'add', personName: 'A', amount: 80,
      participantNames: ['A', 'C'], splitMode: 'custom',
      allocations: [{ personName: 'A', amount: 30 }, { personName: 'C', amount: 40 }]
    }
  }), /合计必须等于/);
  assert.equal(trip.expenses.length, 0);
});

test('assistant context distinguishes actual payment from actual borne expense', () => {
  const summary = __test.buildTripContextSummary({
    meta: { title: '分摊测试' }, sections: [], checklist: [], packing: [],
    people: fixture.people, expenses: fixture.expenses
  });
  assert.match(summary, /实际付款：[^\n]*A ¥80/);
  assert.match(summary, /实际付款：[^\n]*B ¥300/);
  assert.match(summary, /实际付款：[^\n]*C ¥100/);
  assert.match(summary, /实际承担：[^\n]*A ¥130/);
  assert.match(summary, /实际承担：[^\n]*B ¥100/);
  assert.match(summary, /实际承担：[^\n]*C ¥250/);
});
