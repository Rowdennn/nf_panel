// Pont HTTP vers la ressource nf_admin (serveur RedM) — recharge le cache
// ServerItems de vorp_inventory et bump la version des images pour un item
// après un changement fait directement en DB/R2 par ce panel, sans
// redémarrage serveur. Indépendant du RCON (intercepté/géré par txAdmin sur
// ce serveur). Voir SetHttpHandler dans nf_admin/server/main.lua.
function isConfigured() {
  return !!(process.env.BRIDGE_HOST && process.env.BRIDGE_PORT && process.env.BRIDGE_SECRET);
}

async function callBridge(path, itemName) {
  if (!isConfigured()) throw new Error('bridge_not_configured');
  const url = `http://${process.env.BRIDGE_HOST}:${process.env.BRIDGE_PORT}/nf_admin${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.BRIDGE_SECRET, item: itemName }),
    signal: AbortSignal.timeout(5000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.error || `http_${r.status}`);
  return true;
}

function reloadItem(itemName) {
  return callBridge('/reload-item', itemName);
}

function bumpImageVersion(itemName) {
  return callBridge('/bump-image-version', itemName);
}

module.exports = { isConfigured, reloadItem, bumpImageVersion };
