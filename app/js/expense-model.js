const cents = value => Math.round((Number(value) || 0) * 100);
const money = value => Math.round(value) / 100;

export function payerIdOf(expense) {
  return expense && (expense.payerId || expense.personId) || '';
}

export function splitExpense(expense, people = []) {
  const amountCents = cents(expense && expense.amount);
  const validIds = new Set(people.map(person => person.id));
  const stored = Array.isArray(expense && expense.allocations)
    ? expense.allocations
      .filter(item => item && validIds.has(item.personId) && cents(item.amount) >= 0)
      .map(item => ({ personId: item.personId, amount: money(cents(item.amount)) }))
    : [];
  if (stored.length && stored.reduce((sum, item) => sum + cents(item.amount), 0) === amountCents) return stored;

  const selected = [...new Set(
    (Array.isArray(expense && expense.participantIds) && expense.participantIds.length
      ? expense.participantIds
      : [payerIdOf(expense)])
      .filter(id => validIds.has(id))
  )];
  const fallback = selected.length ? selected : [payerIdOf(expense)].filter(id => validIds.has(id));
  if (!fallback.length || amountCents <= 0) return [];

  const base = Math.floor(amountCents / fallback.length);
  let remainder = amountCents - base * fallback.length;
  return fallback.map(personId => ({
    personId,
    amount: money(base + (remainder-- > 0 ? 1 : 0))
  }));
}

export function normalizeExpense(expense, people = []) {
  const payerId = payerIdOf(expense);
  const allocations = splitExpense(expense, people);
  return {
    ...expense,
    payerId,
    personId: payerId,
    participantIds: allocations.map(item => item.personId),
    splitMode: expense && expense.splitMode === 'custom' ? 'custom' : 'equal',
    allocations
  };
}

export function expenseLedger(people = [], expenses = []) {
  const rows = expenses.map(expense => normalizeExpense(expense, people));
  const stats = Object.fromEntries(people.map(person => [person.id, {
    personId: person.id,
    name: person.name || '未命名', paid: 0, owed: 0, balance: 0, orders: []
  }]));

  rows.forEach(expense => {
    const payer = stats[expense.payerId];
    if (payer) payer.paid = money(cents(payer.paid) + cents(expense.amount));
    expense.allocations.forEach(allocation => {
      const person = stats[allocation.personId];
      if (!person) return;
      person.owed = money(cents(person.owed) + cents(allocation.amount));
      person.orders.push({ expense, share: allocation.amount });
    });
  });
  Object.values(stats).forEach(person => { person.balance = money(cents(person.paid) - cents(person.owed)); });
  return { total: money(rows.reduce((sum, expense) => sum + cents(expense.amount), 0)), rows, stats };
}

export function settlementTransfers(people = [], expenses = []) {
  const { stats } = expenseLedger(people, expenses);
  const creditors = Object.values(stats).filter(item => cents(item.balance) > 0)
    .map(item => ({ ...item, remaining: cents(item.balance) }));
  const debtors = Object.values(stats).filter(item => cents(item.balance) < 0)
    .map(item => ({ ...item, remaining: -cents(item.balance) }));
  const transfers = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.remaining, debtor.remaining);
    if (amount > 0) transfers.push({ fromId: debtor.personId, toId: creditor.personId, amount: money(amount) });
    creditor.remaining -= amount;
    debtor.remaining -= amount;
    if (!creditor.remaining) creditorIndex++;
    if (!debtor.remaining) debtorIndex++;
  }
  return transfers;
}

export function expenseCategorySummary(expenses = [], categories = []) {
  const allowed = new Set(categories);
  const totals = new Map(categories.map(category => [category, 0]));
  expenses.forEach(expense => {
    const category = allowed.has(expense && expense.category) ? expense.category : '其他';
    if (!totals.has(category)) totals.set(category, 0);
    totals.set(category, totals.get(category) + cents(expense && expense.amount));
  });
  const totalCents = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  return [...totals.entries()].map(([category, amount]) => ({
    category,
    amount: money(amount),
    percentage: totalCents ? Math.round(amount / totalCents * 1000) / 10 : 0
  })).filter(item => item.amount > 0);
}

export function personSpendingSummary(people = [], expenses = []) {
  const { total, stats } = expenseLedger(people, expenses);
  return people.map(person => {
    const stat = stats[person.id] || { paid: 0, owed: 0 };
    return {
      personId: person.id,
      name: person.name || '未命名',
      paid: stat.paid,
      owed: stat.owed,
      paidPercentage: total ? Math.round(stat.paid / total * 1000) / 10 : 0,
      owedPercentage: total ? Math.round(stat.owed / total * 1000) / 10 : 0
    };
  });
}

export function personCategorySummaries(people = [], expenses = [], categories = []) {
  const allowed = new Set(categories);
  const rows = expenses.map(expense => normalizeExpense(expense, people));
  return people.map(person => {
    const amounts = new Map(categories.map(category => [category, 0]));
    rows.forEach(expense => {
      const share = expense.allocations.find(item => item.personId === person.id);
      if (!share) return;
      const category = allowed.has(expense.category) ? expense.category : '其他';
      amounts.set(category, (amounts.get(category) || 0) + cents(share.amount));
    });
    const totalCents = [...amounts.values()].reduce((sum, amount) => sum + amount, 0);
    return {
      personId: person.id,
      name: person.name || '未命名',
      total: money(totalCents),
      categories: [...amounts.entries()].map(([category, amount]) => ({
        category,
        amount: money(amount),
        percentage: totalCents ? Math.round(amount / totalCents * 1000) / 10 : 0
      })).filter(item => item.amount > 0)
    };
  });
}

export function spreadTimelinePositions(positions = [], minimumGap = 92) {
  let previous = -minimumGap;
  return positions.map(position => {
    const next = Math.max(Number(position) || 0, previous + minimumGap);
    previous = next;
    return next;
  });
}