require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./db');

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
    weight: 0,
    can_remove: row.can_remove != null ? Number(row.can_remove) : 1,
    usable: row.usable != null ? Number(row.usable) : 0,
    useExpired: 0,
    groupId: 0,
    degradation: 0,
    desc: row.desc || '',
    metadata: '{}',
    hasImage: false, // calculé étape 2 (matching R2)
    size: 0,
    dims: '—',
  };
}

app.get('/api/items', async (_req, res) => {
  if (!db.isConfigured()) return res.status(503).json({ error: 'db_not_configured' });
  try {
    const rows = await db.fetchItems();
    res.json(rows.map(mapItem));
  } catch (e) {
    console.error('[/api/items]', e.code || e.message);
    res.status(500).json({ error: 'db_error', code: e.code || null });
  }
});

app.listen(PORT, () => {
  console.log(`NFR Panel sur http://localhost:${PORT}  (DB configurée: ${db.isConfigured()})`);
});
