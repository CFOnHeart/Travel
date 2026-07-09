const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const conn = process.env.AzureWebJobsStorage;
const TABLE = 'expenses';
const PK = 'yn';
const PEOPLE = ['Wenwen', 'Kun', 'Yiming', 'Jun'];

function client() { return TableClient.fromConnectionString(conn, TABLE); }
async function ensureTable(c) { try { await c.createTable(); } catch (e) { /* exists */ } }

// GET /api/expenses -> { items: [ { id, person, amount, note, time } ] }
app.http('getExpenses', {
  methods: ['GET'], authLevel: 'anonymous', route: 'expenses',
  handler: async () => {
    const c = client(); await ensureTable(c);
    const items = [];
    for await (const e of c.listEntities()) {
      items.push({
        id: e.rowKey,
        person: e.person || '',
        amount: Number(e.amount) || 0,
        note: e.note || '',
        time: e.time || ''
      });
    }
    return { jsonBody: { items } };
  }
});

// POST /api/expenses  body: { id?, person, amount, note, time } -> { id }
app.http('addExpense', {
  methods: ['POST'], authLevel: 'anonymous', route: 'expenses',
  handler: async (req) => {
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    if (!b || !PEOPLE.includes(b.person)) return { status: 400, jsonBody: { error: 'bad person' } };
    const amount = Number(b.amount);
    if (!isFinite(amount)) return { status: 400, jsonBody: { error: 'bad amount' } };
    const id = b.id ? String(b.id) : (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    const c = client(); await ensureTable(c);
    await c.upsertEntity({
      partitionKey: PK,
      rowKey: id,
      person: b.person,
      amount: amount,
      note: (b.note || '').toString().slice(0, 300),
      time: (b.time || new Date().toISOString()).toString().slice(0, 40)
    }, 'Replace');
    return { jsonBody: { id } };
  }
});

// DELETE /api/expenses/{id}  (POST also allowed) -> { ok: true }
app.http('deleteExpense', {
  methods: ['DELETE', 'POST'], authLevel: 'anonymous', route: 'expenses/{id}',
  handler: async (req, ctx) => {
    const id = req.params.id;
    if (!id) return { status: 400, jsonBody: { error: 'missing id' } };
    const c = client(); await ensureTable(c);
    try { await c.deleteEntity(PK, id); } catch (e) { /* already gone */ }
    return { jsonBody: { ok: true } };
  }
});
