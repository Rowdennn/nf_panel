// VORP MySQL — lecture seule (table items).
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
  const sql = 'SELECT `item`, `label`, `limit`, `can_remove`, `type`, `usable`, `desc` FROM `' + itemsTable() + '`';
  const [rows] = await getPool().query(sql);
  return rows;
}

module.exports = { isConfigured, fetchItems, getPool };
