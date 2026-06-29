// Matching flou label DB <-> nom de fichier image.
// Normalise les deux côtés puis calcule une distance de Levenshtein.

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
    .replace(/[_\-\s]+/g, ' ')
    .replace(/\.png$/i, '')
    .trim();
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

// Score 0..1 (1 = identique).
function score(label, filename) {
  const a = normalize(label);
  const b = normalize(filename);
  if (a === b) return 1;
  // bonus si l'un contient l'autre
  if (b.includes(a) || a.includes(b)) return 0.85;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// Retourne les N meilleurs candidats pour un item donné.
function match(label, files, topN = 5) {
  return files
    .map((f) => ({ file: f, score: score(label, f) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

module.exports = { normalize, match };
