// VORP MySQL — table items (lecture + mise à jour des métadonnées).
const mysql = require('mysql2/promise');

let pool = null;

function isConfigured() {
  return !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      multipleStatements: false,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

// assaini avant interpolation
function itemsTable() {
  return (process.env.DB_ITEMS_TABLE || 'items').replace(/[^a-zA-Z0-9_]/g, '') || 'items';
}

async function fetchItems() {
  const sql = 'SELECT `item`, `label`, `limit`, `can_remove`, `type`, `usable`, `desc`, `weight`, `groupId`, `degradation`, `useExpired`, `metadata` FROM `' + itemsTable() + '`';
  const [rows] = await getPool().query(sql);
  return rows;
}

// Groupes valides (table item_group) — source de vérité de la contrainte FK
// sur items.groupId.
async function fetchGroups() {
  const [rows] = await getPool().query('SELECT `id`, `description` FROM `item_group` ORDER BY `id`');
  return rows;
}

const UPDATABLE_COLS = new Set(['label', 'groupId', 'limit', 'weight', 'can_remove', 'usable', 'useExpired', 'degradation', 'desc', 'metadata']);

async function updateItem(itemName, fields) {
  const entries = Object.entries(fields).filter(([k]) => UPDATABLE_COLS.has(k));
  if (!entries.length) throw new Error('no_fields');
  const set = entries.map(([k]) => `\`${k}\` = ?`).join(', ');
  const values = [...entries.map(([, v]) => v), itemName];
  const [result] = await getPool().execute(
    `UPDATE \`${itemsTable()}\` SET ${set} WHERE \`item\` = ?`,
    values
  );
  return result.affectedRows;
}

module.exports = { isConfigured, fetchItems, fetchGroups, updateItem, getPool };
