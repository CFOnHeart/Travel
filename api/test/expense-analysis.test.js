const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../src/functions/trips.js');

const expenses = [
  { id: 'meal', amount: 100, note: '晚餐', payerId: 'a', participantIds: ['a', 'b'] },
  { id: 'taxi', amount: 60, note: '打车', payerId: 'b', participantIds: ['a', 'b'] },
  { id: 'hotel', amount: 240, note: '酒店', payerId: 'a', participantIds: ['a', 'b'] }
];

test('LLM expense classification is constrained and fills missing rows as other', async () => {
  const result = await __test.classifyExpensesWithLLM(expenses, async () => ({
    classifications: [
      { id: 'meal', category: '餐饮', confidence: 0.96 },
      { id: 'taxi', category: '不存在的类别', confidence: 2 },
      { id: 'unknown', category: '交通', confidence: 1 }
    ]
  }));
  assert.deepEqual(result, [
    { id: 'meal', category: '餐饮', confidence: 0.96 },
    { id: 'taxi', category: '其他', confidence: 0 },
    { id: 'hotel', category: '其他', confidence: 0 }
  ]);
});

test('expense analysis helpers calculate category and person proportions', async () => {
  const { expenseCategorySummary, personCategorySummaries, personSpendingSummary } = await import('../../app/js/expense-model.js');
  const categorized = expenses.map((expense, index) => ({ ...expense, category: ['餐饮', '交通', '住宿'][index] }));
  assert.deepEqual(expenseCategorySummary(categorized, __test.EXPENSE_CATEGORIES), [
    { category: '餐饮', amount: 100, percentage: 25 },
    { category: '交通', amount: 60, percentage: 15 },
    { category: '住宿', amount: 240, percentage: 60 }
  ]);
  assert.deepEqual(personSpendingSummary([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], categorized), [
    { personId: 'a', name: 'A', paid: 340, owed: 200, paidPercentage: 85, owedPercentage: 50 },
    { personId: 'b', name: 'B', paid: 60, owed: 200, paidPercentage: 15, owedPercentage: 50 }
  ]);
  assert.deepEqual(personCategorySummaries([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], categorized, __test.EXPENSE_CATEGORIES), [
    { personId: 'a', name: 'A', total: 200, categories: [
      { category: '餐饮', amount: 50, percentage: 25 },
      { category: '交通', amount: 30, percentage: 15 },
      { category: '住宿', amount: 120, percentage: 60 }
    ] },
    { personId: 'b', name: 'B', total: 200, categories: [
      { category: '餐饮', amount: 50, percentage: 25 },
      { category: '交通', amount: 30, percentage: 15 },
      { category: '住宿', amount: 120, percentage: 60 }
    ] }
  ]);
});

test('production trip storage strips analysis fields and compresses oversized trips', () => {
  const stored = __test.tripForStorage({
    expenses: [{ id: 'meal', amount: 100, category: '餐饮', categoryConfidence: 0.96 }],
    expenseAnalysis: { analyzedExpenseCount: 1 }
  });
  assert.deepEqual(stored.expenses, [{ id: 'meal', amount: 100 }]);
  assert.equal('expenseAnalysis' in stored, false);

  const encoded = __test.encodeTripData({ ...stored, text: '行'.repeat(33000) });
  assert.equal(encoded.dataEncoding, 'gzip-base64');
  assert.equal(__test.decodeTripData(encoded).text.length, 33000);
  assert.deepEqual(__test.decodeTripData({ data: JSON.stringify(stored) }), stored);
});