const { getPool } = require("../config/db");

async function getUserRole(userId) {
  const { rows } = await getPool().query(`SELECT role FROM users WHERE id = $1`, [userId]);
  return rows[0]?.role || null;
}

module.exports = { getUserRole };