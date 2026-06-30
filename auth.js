// OAuth2 Discord — login + niveau d'accès via les rôles du membre.
// Scopes : identify + guilds.members.read (pas besoin de bot).
const API = 'https://discord.com/api';

function isConfigured() {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_GUILD_ID && redirectUri());
}

function redirectUri() {
  return process.env.DISCORD_REDIRECT_URI || (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') + '/auth/discord/callback' : '');
}

function adminRoleIds() {
  return (process.env.DISCORD_ADMIN_ROLE_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function getAuthorizeUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state,
    prompt: 'none',
  });
  return `${API}/oauth2/authorize?${p}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
  });
  const r = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error('token_exchange_failed');
  return (await r.json()).access_token;
}

async function fetchUser(token) {
  const r = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('user_fetch_failed');
  return r.json();
}

// Membre du guild ciblé → { roles: [...] }. 404 = pas membre → null.
async function fetchGuildMember(token) {
  const r = await fetch(`${API}/users/@me/guilds/${process.env.DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('member_fetch_failed');
  return r.json();
}

// 'full' si rôle admin, 'readonly' si membre, null si non-membre.
function computeAccess(member) {
  if (!member) return null;
  const admins = adminRoleIds();
  const roles = member.roles || [];
  if (admins.length && roles.some((id) => admins.includes(id))) return 'full';
  return 'readonly';
}

module.exports = { isConfigured, redirectUri, getAuthorizeUrl, exchangeCode, fetchUser, fetchGuildMember, computeAccess };
