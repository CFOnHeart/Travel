const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');

const conn = process.env.AzureWebJobsStorage;
const CONTAINER = 'proofs';

// POST /api/upload  body: { id, dataUrl: "data:image/jpeg;base64,..." } -> { url }
app.http('upload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'upload',
  handler: async (req) => {
    let b;
    try { b = await req.json(); } catch { return { status: 400, jsonBody: { error: 'invalid json' } }; }
    if (!b || !b.dataUrl) return { status: 400, jsonBody: { error: 'missing dataUrl' } };

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(b.dataUrl);
    if (!m) return { status: 400, jsonBody: { error: 'bad dataUrl' } };

    const contentType = m[1];
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return { status: 413, jsonBody: { error: 'image too large' } };

    const svc = BlobServiceClient.fromConnectionString(conn);
    const container = svc.getContainerClient(CONTAINER);
    await container.createIfNotExists({ access: 'blob' });

    const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
    const safeId = (b.id ? String(b.id) : 'img').replace(/[^a-z0-9-]/gi, '');
    const name = `${safeId}-${Date.now()}.${ext}`;
    const blob = container.getBlockBlobClient(name);
    await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });

    return { jsonBody: { url: blob.url } };
  }
});
