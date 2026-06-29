const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
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

// Upload un fichier source vers R2 sous la clé items/<item>.png.
async function uploadItem(itemName, sourceFile, libraryPath) {
  const filePath = path.join(libraryPath, sourceFile);
  const body = fs.readFileSync(filePath);
  const key = `items/${itemName}.png`;
  await client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000',
  }));
  return key;
}

// Vérifie si items/<item>.png existe déjà dans R2.
async function exists(itemName) {
  try {
    await client().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: `items/${itemName}.png` }));
    return true;
  } catch { return false; }
}

// Retourne un Map nom→sizeBytes des items présents dans R2.
async function listItemNames() {
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const c = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const map = new Map();
  let token;
  do {
    const r = await c.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, Prefix: 'items/', ContinuationToken: token }));
    (r.Contents || []).forEach((o) => {
      const name = o.Key.replace(/^items\//, '').replace(/\.png$/i, '').toLowerCase();
      if (name) map.set(name, o.Size || 0);
    });
    token = r.IsTruncated ? r.NextContinuationToken : null;
  } while (token);
  return map;
}

module.exports = { isConfigured, uploadItem, exists, listItemNames };
