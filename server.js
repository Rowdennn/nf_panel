require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('./db');
const { match } = require('./matcher');
const r2 = require('./r2');

// Cache de la liste R2 — rafraîchi au démarrage et après chaque publish.
let r2Cache = new Map(); // nom → sizeBytes
function refreshR2Cache() {
  if (!r2.isConfigured()) return;
  r2.listItemNames().then((map) => { r2Cache = map; }).catch(() => {});
}
refreshR2Cache();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true, dbConfigured: db.isConfigured() }));

app.get('/api/config', (_req, res) => res.json({
  cdnBase: process.env.R2_PUBLIC_BASE_URL || '',
}));

// VORP ne stocke pas cat/poids/groupId/metadata : défauts + cat devinée du nom/type.
function mapItem(row, i) {
  const item = row.item || '';
  const type = row.type || 'item';
  let cat = 'misc';
  if (type === 'weapon' || /^weapon_/i.test(item)) cat = 'weapon';
  else if (/^ammo_/i.test(item)) cat = 'ammo';
  return {
    id: i + 1,
    item,
    label: row.label || item,
    cat,
    type,
    limit: row.limit != null ? Number(row.limit) : 1,
    weight: row.weight != null ? Number(row.weight) : 0,
    can_remove: row.can_remove != null ? Number(row.can_remove) : 1,
    usable: row.usable != null ? Number(row.usable) : 0,
    useExpired: row.useExpired != null ? Number(row.useExpired) : 0,
    groupId: row.groupId != null ? Number(row.groupId) : 0,
    degradation: row.degradation != null ? Number(row.degradation) : 0,
    desc: row.desc || '',
    metadata: row.metadata || '{}',
    hasImage: false, // calculé étape 2 (matching R2)
    size: 0,
    dims: '—',
  };
}

app.get('/api/items', async (_req, res) => {
  if (!db.isConfigured()) return res.status(503).json({ error: 'db_not_configured' });
  try {
    const rows = await db.fetchItems();
    res.json(rows.map((row, i) => {
      const key = row.item.toLowerCase();
      const mapped = mapItem(row, i);
      mapped.hasImage = r2Cache.has(key);
      mapped.size = r2Cache.has(key) ? Math.round(r2Cache.get(key) / 1024) : 0;
      return mapped;
    }));
  } catch (e) {
    console.error('[/api/items]', e.code || e.message);
    res.status(500).json({ error: 'db_error', code: e.code || null });
  }
});

// Liste les fichiers PNG de la bibliothèque source.
function libraryFiles() {
  const dir = process.env.LIBRARY_PATH;
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f));
}

app.get('/api/library', (_req, res) => {
  const files = libraryFiles();
  res.json({ count: files.length, files });
});

// Matching flou : pour chaque item, propose les meilleurs candidats image.
// Retourne aussi hasImage=true si <item>.png existe exactement dans la bibliothèque.
app.get('/api/match', async (_req, res) => {
  if (!db.isConfigured()) return res.status(503).json({ error: 'db_not_configured' });
  try {
    const rows = await db.fetchItems();
    const files = libraryFiles();

    const result = rows.map((row) => {
      const hasImage = r2Cache.has(row.item.toLowerCase()); // dans /api/match
      if (hasImage) return { item: row.item, label: row.label, hasImage, candidates: [] };
      // tente le match sur le label ET sur le nom technique, garde le meilleur score
      const byLabel = match(row.label, files);
      const byItem  = match(row.item,  files);
      const merged = Object.values(
        [...byLabel, ...byItem].reduce((acc, c) => {
          if (!acc[c.file] || acc[c.file].score < c.score) acc[c.file] = c;
          return acc;
        }, {})
      ).sort((a, b) => b.score - a.score).slice(0, 5);
      return { item: row.item, label: row.label, hasImage, candidates: merged };
    });

    res.json(result);
  } catch (e) {
    console.error('[/api/match]', e.code || e.message);
    res.status(500).json({ error: 'db_error', code: e.code || null });
  }
});

// Stats du bucket R2 (prefix items/)
app.get('/api/stats', async (_req, res) => {
  if (!r2.isConfigured()) return res.json({ configured: false });
  try {
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const c = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
    let count = 0, size = 0, token;
    do {
      const r = await c.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, Prefix: 'items/', ContinuationToken: token }));
      (r.Contents || []).forEach((o) => { count++; size += o.Size || 0; });
      token = r.IsTruncated ? r.NextContinuationToken : null;
    } while (token);
    res.json({ configured: true, count, sizeBytes: size });
  } catch (e) {
    res.status(500).json({ configured: true, error: e.message });
  }
});

// Publie une liste d'items vers R2 : { items: [{ item, file }] }
// file = nom du fichier source dans LIBRARY_PATH
app.post('/api/publish', async (req, res) => {
  if (!r2.isConfigured()) return res.status(503).json({ error: 'r2_not_configured' });
  const list = req.body.items;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'items_required' });

  const libraryPath = process.env.LIBRARY_PATH;
  const results = [];

  for (const { item, file } of list) {
    if (!item || !file) { results.push({ item, ok: false, error: 'missing_fields' }); continue; }
    try {
      const key = await r2.uploadItem(item, file, libraryPath);
      results.push({ item, ok: true, key });
    } catch (e) {
      console.error('[/api/publish]', item, e.message);
      results.push({ item, ok: false, error: e.message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (results.some((r) => r.ok)) refreshR2Cache();
  res.status(failed.length && failed.length === results.length ? 500 : 200).json({ results, failed: failed.length });
});

app.listen(PORT, () => {
  console.log(`NFR Panel sur http://localhost:${PORT}  (DB configurée: ${db.isConfigured()})`);
});
