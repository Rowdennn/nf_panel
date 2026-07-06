require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const db = require('./db');
const r2 = require('./r2');
const auth = require('./auth');
const bridge = require('./bridge');

// Cache de la liste R2 — rafraîchi au démarrage et après chaque publish.
let r2Cache = new Map(); // nom → { sizeBytes, mtime }
function refreshR2Cache() {
  if (!r2.isConfigured()) return;
  r2.listItemNames().then((map) => { r2Cache = map; }).catch(() => {});
}
refreshR2Cache();

// Catégorie sémantique (couleur/label panel) dérivée de la description du groupe
// dans item_group — la table porte la contrainte FK de items.groupId.
const DESC_CAT = {
  default: 'misc', medical: 'medical', foods: 'food', tools: 'material',
  weapons: 'weapon', ammo: 'ammo', documents: 'document', animals: 'animal',
  valuables: 'valuable', horse: 'horse', herbs: 'herb',
};
// Cache des groupes valides — id → { description, cat }. Rafraîchi au démarrage.
let groupCache = new Map();
function refreshGroups() {
  if (!db.isConfigured()) return;
  db.fetchGroups().then((rows) => {
    const m = new Map();
    for (const g of rows) m.set(Number(g.id), { description: g.description, cat: DESC_CAT[g.description] || 'misc' });
    groupCache = m;
  }).catch(() => {});
}
refreshGroups();

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET manquant en production — arrêt (le secret de repli est public dans le code source).');
  process.exit(1);
}

app.set('trust proxy', 1);

// En-têtes de sécurité de base (pas de dépendance helmet pour un set aussi réduit).
const r2PublicHost = (() => {
  try { return new URL(process.env.R2_PUBLIC_BASE_URL || '').origin; } catch { return ''; }
})();
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: https://cdn.discordapp.com${r2PublicHost ? ' ' + r2PublicHost : ''}`,
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

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

function mapItem(row, i) {
  const item = row.item || '';
  const type = row.type || 'item';
  const groupId = row.groupId != null ? Number(row.groupId) : 0;
  const grp = groupCache.get(groupId);
  let cat = grp ? grp.cat : 'misc';
  if (cat === 'misc') {
    if (type === 'weapon' || /^weapon_/i.test(item)) cat = 'weapon';
    else if (/^ammo_/i.test(item)) cat = 'ammo';
  }
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
  };
}

// Groupes valides (item_group) pour le sélecteur de catégorie du modal.
app.get('/api/groups', (_req, res) => {
  const groups = [...groupCache.entries()].map(([id, g]) => ({ id, description: g.description, cat: g.cat }));
  res.json(groups);
});

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
// Mémoire (pas disque) : on valide le contenu réel avant d'écrire quoi que ce
// soit sur LIBRARY_PATH — le mimetype multipart est déclaré par le client et
// donc trivialement falsifiable, il ne sert qu'à un rejet rapide.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const upload = multer({
  storage: multer.memoryStorage(),
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
    if (!PNG_SIGNATURE.equals(req.file.buffer.subarray(0, 8))) {
      return res.status(400).json({ error: 'invalid_file_type' });
    }
    const dir = process.env.LIBRARY_PATH;
    if (!dir || !fs.existsSync(dir)) return res.status(503).json({ error: 'library_path_not_configured' });
    const safeBase = path.basename(req.file.originalname, path.extname(req.file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60) || 'upload';
    const filename = `${safeBase}_${Date.now()}.png`;
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    res.json({ file: filename });
  });
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
      // Best-effort : pousse la nouvelle image aux joueurs déjà connectés
      // (voir bridge.js) sans bloquer la réponse en cas d'échec.
      if (bridge.isConfigured()) {
        bridge.bumpImageVersion(item).catch((e) => console.error('[bridge bumpImageVersion]', item, e.message));
      }
    } catch (e) {
      console.error('[/api/publish]', item, e.message);
      results.push({ item, ok: false, error: e.message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  res.status(failed.length && failed.length === results.length ? 500 : 200).json({ results, failed: failed.length });
});

// Champs partagés par la création et la mise à jour d'un item — validation identique.
const ITEM_FIELDS = ['label', 'groupId', 'limit', 'weight', 'can_remove', 'usable', 'useExpired', 'degradation', 'desc', 'metadata'];
function readItemFields(body) {
  const fields = {};
  for (const k of ITEM_FIELDS) { if (k in body) fields[k] = body[k]; }

  // Entiers : repli sur 0 si non parsable (null, [], chaîne non numérique…).
  for (const k of ['groupId', 'limit', 'can_remove', 'usable', 'useExpired', 'degradation']) {
    if (k in fields) { const n = parseInt(fields[k], 10); fields[k] = Number.isFinite(n) ? n : 0; }
  }
  if ('weight' in fields) { const w = parseFloat(fields.weight); fields.weight = Number.isFinite(w) ? w : 0; }

  return fields;
}
// Retourne un code d'erreur si un champ est invalide, sinon null.
function validateItemFields(fields) {
  // groupId doit exister dans item_group (sinon échec de contrainte FK en base).
  if ('groupId' in fields && groupCache.size && !groupCache.has(fields.groupId)) {
    return { error: 'invalid_group' };
  }
  // Champs texte : type + longueur bornée (évite erreurs DB et stockage abusif).
  const MAX = { label: 100, desc: 1000, metadata: 4000 };
  for (const k of ['label', 'desc', 'metadata']) {
    if (k in fields) {
      if (typeof fields[k] !== 'string') return { error: 'invalid_field', field: k };
      if (fields[k].length > MAX[k]) return { error: 'field_too_long', field: k };
    }
  }
  // metadata doit rester du JSON valide (consommé par json.decode côté VORP).
  if ('metadata' in fields) {
    try { JSON.parse(fields.metadata); }
    catch { return { error: 'invalid_metadata' }; }
  }
  return null;
}

// Crée un nouvel item.
app.post('/api/items/:item', requireWrite, async (req, res) => {
  if (!db.isConfigured()) return res.status(503).json({ error: 'db_not_configured' });
  const itemName = req.params.item;
  if (!itemName || !/^[a-zA-Z0-9_-]+$/.test(itemName) || itemName.length > 50) {
    return res.status(400).json({ error: 'invalid_item_name' });
  }

  const fields = readItemFields(req.body);
  if (!fields.label) return res.status(400).json({ error: 'invalid_field', field: 'label' });

  const err = validateItemFields(fields);
  if (err) return res.status(400).json(err);

  try {
    await db.createItem(itemName, fields);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'item_exists' });
    console.error('[POST /api/items]', itemName, e.message);
    return res.status(500).json({ error: 'db_error', code: e.code || null });
  }

  // Recharge le cache ServerItems du serveur de jeu (vorp_inventory) sans
  // redémarrage — best-effort : l'item reste créé en DB même si le serveur
  // de jeu est down ou le pont mal configuré.
  let liveReload = false;
  if (bridge.isConfigured()) {
    try {
      await bridge.reloadItem(itemName);
      liveReload = true;
    } catch (e) {
      console.error('[bridge reloadItem]', itemName, e.message);
    }
  }

  res.status(201).json({ ok: true, item: itemName, liveReload });
});

// Met à jour les métadonnées d'un item existant (ne touche pas à l'identifiant ni au type).
app.patch('/api/items/:item', requireWrite, async (req, res) => {
  if (!db.isConfigured()) return res.status(503).json({ error: 'db_not_configured' });
  const itemName = req.params.item;
  if (!/^[a-zA-Z0-9_-]+$/.test(itemName)) return res.status(400).json({ error: 'invalid_item_name' });

  const fields = readItemFields(req.body);
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'no_fields' });

  const err = validateItemFields(fields);
  if (err) return res.status(400).json(err);

  try {
    const affected = await db.updateItem(itemName, fields);
    if (!affected) return res.status(404).json({ error: 'item_not_found' });
  } catch (e) {
    console.error('[PATCH /api/items]', itemName, e.message);
    return res.status(500).json({ error: 'db_error', code: e.code || null });
  }

  // Recharge le cache ServerItems du serveur de jeu — best-effort, comme
  // pour la création (voir POST /api/items/:item juste au-dessus).
  let liveReload = false;
  if (bridge.isConfigured()) {
    try {
      await bridge.reloadItem(itemName);
      liveReload = true;
    } catch (e) {
      console.error('[bridge reloadItem]', itemName, e.message);
    }
  }

  res.json({ ok: true, liveReload });
});

const listenHost = isProd ? '127.0.0.1' : undefined;
app.listen(PORT, listenHost, () => {
  console.log(`NFR Panel sur http://localhost:${PORT}  (DB: ${db.isConfigured()}, Discord: ${auth.isConfigured()})`);
});
