const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

function isConfigured() {
  return !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

function client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

const SAFE_ITEM_NAME = /^[a-zA-Z0-9_-]+$/;

// Résout sourceFile sous libraryPath en bloquant toute tentative de traversal
// (../, chemins absolus). Lève si le fichier sort du dossier autorisé.
function safeLibraryPath(libraryPath, sourceFile) {
  const root = path.resolve(libraryPath);
  const name = path.basename(String(sourceFile || ''));
  if (!name || !/\.png$/i.test(name)) throw new Error('invalid_source_file');
  const fullPath = path.resolve(root, name);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) throw new Error('invalid_source_file');
  return fullPath;
}

// Upload un fichier source vers R2 sous la clé items/<item>.png.
async function uploadItem(itemName, sourceFile, libraryPath) {
  if (!SAFE_ITEM_NAME.test(String(itemName || ''))) throw new Error('invalid_item_name');
  const filePath = safeLibraryPath(libraryPath, sourceFile);
  const body = fs.readFileSync(filePath);
  const key = `items/${itemName}.png`;
  await client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000',
  }));
  return { key, sizeBytes: body.length };
}

// Retourne un Map nom→{sizeBytes, mtime} des items présents dans R2.
// mtime sert de cache-buster (?v=mtime) pour forcer le rechargement après remplacement.
async function listItemNames() {
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const c = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const map = new Map();
  let token;
  do {
    const r = await c.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, Prefix: 'items/', ContinuationToken: token }));
    (r.Contents || []).forEach((o) => {
      const name = o.Key.replace(/^items\//, '').replace(/\.png$/i, '').toLowerCase();
      if (name) map.set(name, { sizeBytes: o.Size || 0, mtime: o.LastModified ? new Date(o.LastModified).getTime() : Date.now() });
    });
    token = r.IsTruncated ? r.NextContinuationToken : null;
  } while (token);
  return map;
}

module.exports = { isConfigured, uploadItem, listItemNames };
