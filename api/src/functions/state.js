const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const conn = process.env.AzureWebJobsStorage;
const TABLE = 'checklist';
const PK = 'yn';

function client() {
  return TableClient.fromConnectionString(conn, TABLE);
}
async function ensureTable(c) {
  try { await c.createTable(); } catch (e) { /* already exists */ }
}

// GET /api/state  -> { items: { [id]: { done, who, note, img } } }
app.http('getState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'state',
  handler: async () => {
    const c = client();
    await ensureTable(c);
    const items = {};
    for await (const e of c.listEntities()) {
      items[e.rowKey] = {
        done: !!e.done,
        who: e.who || '',
        note: e.note || '',
        img: e.img || ''
      };
    }
    return { jsonBody: { items } };
  }
});

// POST /api/state  body: { id, done, who, note, img }
app.http('putState', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'state',
  handler: async (req) => {
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    if (!b || !b.id) return { status: 400, jsonBody: { error: 'missing id' } };
    const c = client();
    await ensureTable(c);
    await c.upsertEntity({
      partitionKey: PK,
      rowKey: String(b.id),
      done: !!b.done,
      who: (b.who || '').toString().slice(0, 200),
      note: (b.note || '').toString().slice(0, 2000),
      img: (b.img || '').toString().slice(0, 500)
    }, 'Replace');
    return { jsonBody: { ok: true } };
  }
});
