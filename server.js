require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('./db');
const { match } = require('./matcher');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true, dbConfigured: db.isConfigured() }));

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
    const files = libraryFiles();
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    res.json(rows.map((row, i) => {
      const mapped = mapItem(row, i);
      mapped.hasImage = fileSet.has(`${row.item}.png`.toLowerCase());
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
    const fileSet = new Set(files.map((f) => f.toLowerCase()));

    const result = rows.map((row) => {
      const exactFile = `${row.item}.png`.toLowerCase();
      const hasImage = fileSet.has(exactFile);
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

app.listen(PORT, () => {
  console.log(`NFR Panel sur http://localhost:${PORT}  (DB configurée: ${db.isConfigured()})`);
});
