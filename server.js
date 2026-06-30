require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const db = require('./db');
const { match } = require('./matcher');
const r2 = require('./r2');
const auth = require('./auth');

// Cache de la liste R2 — rafraîchi au démarrage et après chaque publish.
let r2Cache = new Map(); // nom → { sizeBytes, mtime }
function refreshR2Cache() {
  if (!r2.isConfigured()) return;
  r2.listItemNames().then((map) => { r2Cache = map; }).catch(() => {});
}
refreshR2Cache();

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET manquant en production — arrêt (le secret de repli est public dans le code source).');
  process.exit(1);
}

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieSession({
  name: 'nfr_session',
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours
}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true, dbConfigured: db.isConfigured() }));

app.get('/api/config', (_req, res) => res.json({
  cdnBase: process.env.R2_PUBLIC_BASE_URL || '',
}));

// --- Auth Discord -----------------------------------------------------------
app.get('/auth/discord/login', (req, res) => {
  if (!auth.isConfigured()) return res.status(503).send('Auth Discord non configurée.');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  res.redirect(auth.getAuthorizeUrl(state));
});

app.get('/auth/discord/callback', async (req, res) => {
  if (!auth.isConfigured()) return res.status(503).send('Auth Discord non configurée.');
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send('Requête invalide (state).');
  }
  req.session.oauthState = null;
  try {
    const token = await auth.exchangeCode(code);
    const [user, member] = await Promise.all([auth.fetchUser(token), auth.fetchGuildMember(token)]);
    const access = auth.computeAccess(member);
    if (!access) return res.status(403).send('Vous n\'êtes pas membre du Discord requis.');
    req.session.user = { id: user.id, username: user.username, avatar: user.avatar };
    req.session.access = access;
    res.redirect('/');
  } catch (e) {
    console.error('[auth/callback]', e.message);
    res.status(500).send('Échec de la connexion Discord.');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'unauthenticated' });
  res.json({ user: req.session.user, access: req.session.access });
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'unauthenticated' });
  next();
}
function requireWrite(req, res, next) {
  if (req.session.access !== 'full') return res.status(403).json({ error: 'forbidden' });
  next();
}
app.use('/api', requireAuth);

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
    updatedAt: 0, // cache-buster pour l'URL CDN
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
      const r2Entry = r2Cache.get(key);
      mapped.hasImage = !!r2Entry;
      mapped.size = r2Entry ? Math.round(r2Entry.sizeBytes / 1024) : 0;
      mapped.updatedAt = r2Entry ? r2Entry.mtime : 0;
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

function libraryFilePath(file) {
  const dir = process.env.LIBRARY_PATH;
  if (!dir || !fs.existsSync(dir)) return null;
  const name = path.basename(String(file || ''));
  if (!/\.png$/i.test(name)) return null;
  const fullPath = path.resolve(dir, name);
  const root = path.resolve(dir);
  if (!fullPath.startsWith(root + path.sep)) return null;
  return fs.existsSync(fullPath) ? fullPath : null;
}

app.get('/api/library', (_req, res) => {
  const files = libraryFiles();
  res.json({ count: files.length, files });
});

app.get('/api/library-image/:file', (req, res) => {
  const filePath = libraryFilePath(req.params.file);
  if (!filePath) return res.status(404).json({ error: 'image_not_found' });
  res.sendFile(filePath);
});

// Upload d'une image externe vers la bibliothèque (LIBRARY_PATH). Le fichier
// enregistré devient ensuite utilisable comme n'importe quel fichier de la
// bibliothèque (publication via /api/publish au moment de l'enregistrement).
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = process.env.LIBRARY_PATH;
      if (!dir || !fs.existsSync(dir)) return cb(new Error('library_path_not_configured'));
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safeBase = path.basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 60) || 'upload';
      cb(null, `${safeBase}_${Date.now()}.png`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'image/png') return cb(new Error('invalid_file_type'));
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo
});

app.post('/api/upload', requireWrite, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const code = err.message === 'invalid_file_type' ? 'invalid_file_type'
        : err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large'
        : 'upload_error';
      return res.status(400).json({ error: code });
    }
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    res.json({ file: req.file.filename });
  });
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
app.post('/api/publish', requireWrite, async (req, res) => {
  if (!r2.isConfigured()) return res.status(503).json({ error: 'r2_not_configured' });
  const list = req.body.items;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'items_required' });

  const libraryPath = process.env.LIBRARY_PATH;
  const results = [];

  for (const { item, file } of list) {
    if (!item || !file) { results.push({ item, ok: false, error: 'missing_fields' }); continue; }
    try {
      const { key, sizeBytes } = await r2.uploadItem(item, file, libraryPath);
      r2Cache.set(item.toLowerCase(), { sizeBytes, mtime: Date.now() });
      results.push({ item, ok: true, key });
    } catch (e) {
      console.error('[/api/publish]', item, e.message);
      results.push({ item, ok: false, error: e.message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  res.status(failed.length && failed.length === results.length ? 500 : 200).json({ results, failed: failed.length });
});

const listenHost = isProd ? '127.0.0.1' : undefined;
app.listen(PORT, listenHost, () => {
  console.log(`NFR Panel sur http://localhost:${PORT}  (DB: ${db.isConfigured()}, Discord: ${auth.isConfigured()})`);
});
