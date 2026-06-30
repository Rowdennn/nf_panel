// Matching flou item/label DB <-> nom de fichier image.
// Compare plusieurs formes normalisees pour gerer les prefixes de bibliotheque
// et les variantes avec/sans separateurs: goldbar <-> resource_gold_bar.png.

const PREFIX_TOKENS = new Set([
  'resource', 'resources',
  'provision', 'provisions',
  'consumable', 'consumables',
  'alcohol',
  'bottle', 'bottles',
  'image', 'images',
  'icon', 'icons',
  'item', 'items',
]);

function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/\.png$/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-\s]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parts(s) {
  const text = normalize(s);
  const tokens = text ? text.split(' ') : [];
  const usefulTokens = tokens.filter((token) => !PREFIX_TOKENS.has(token));
  const fallbackTokens = usefulTokens.length ? usefulTokens : tokens;
  const canonicalTokens = fallbackTokens.map(canonicalToken);
  return {
    text,
    tokens,
    compact: tokens.join(''),
    usefulText: fallbackTokens.join(' '),
    usefulTokens: fallbackTokens,
    canonicalTokens,
    usefulCompact: fallbackTokens.join(''),
  };
}

function canonicalToken(token) {
  if (token === 'whisky') return 'whiskey';
  if (token.length > 3 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function distanceScore(a, b) {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

// Score 0..1 (1 = identique).
function score(label, filename) {
  const a = parts(label);
  const b = parts(filename);
  if (!a.text && !b.text) return 1;
  if (!a.text || !b.text) return 0;

  if (a.text === b.text) return 1;
  if (a.compact === b.compact) return 0.99;
  if (a.text === b.usefulText || a.compact === b.usefulCompact) return 0.98;

  // Match fort pour les fichiers prefixes: resource_gold_bar.png -> goldbar.
  if (a.compact.length >= 4 && b.usefulCompact.includes(a.compact)) return 0.95;
  if (b.usefulCompact.length >= 4 && a.compact.includes(b.usefulCompact)) return 0.92;

  if (b.text.includes(a.text) || a.text.includes(b.text)) return 0.85;

  const itemTokens = a.tokens.map(canonicalToken);
  const covered = itemTokens.filter((token) => b.canonicalTokens.includes(token)).length;
  const coverageScore = covered ? covered / itemTokens.length : 0;
  const precisionScore = covered ? covered / Math.max(b.canonicalTokens.length, 1) : 0;
  const tokenScore = covered
    ? (coverageScore * 0.78) + (precisionScore * 0.22)
    : 0;
  const allItemTokensCovered = itemTokens.length > 1 && coverageScore === 1;

  return Math.max(
    allItemTokensCovered ? 0.93 : 0,
    distanceScore(a.compact, b.usefulCompact),
    distanceScore(a.text, b.usefulText),
    tokenScore * 0.9,
  );
}

// Retourne les N meilleurs candidats pour un item donne.
function match(label, files, topN = 5) {
  return files
    .map((f) => ({ file: f, score: score(label, f) }))
    .sort((a, b) => (b.score - a.score) || (a.file.length - b.file.length) || a.file.localeCompare(b.file))
    .slice(0, topN);
}

module.exports = { normalize, match };
