const { getPool } = require("../config/db");

async function getUserRole(userId) {
  const { rows } = await getPool().query(`SELECT role FROM users WHERE id = $1`, [userId]);
  return rows[0]?.role || null;
}

async function getUserBasicInfo(userId) {
  const { rows } = await getPool().query(
    `SELECT id, name, email FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function getStripeConnectAccount(userId) {
  const { rows } = await getPool().query(
    `SELECT stripe_connect_account_id, stripe_connect_charges_enabled
     FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function saveStripeConnectAccountId(userId, accountId) {
  await getPool().query(
    `UPDATE users SET stripe_connect_account_id = $1 WHERE id = $2`,
    [accountId, userId]
  );
}

async function setChargesEnabledByAccountId(accountId, chargesEnabled) {
  await getPool().query(
    `UPDATE users
     SET stripe_connect_charges_enabled = $1,
         stripe_connect_onboarded_at = CASE WHEN $1 = TRUE THEN NOW() ELSE stripe_connect_onboarded_at END
     WHERE stripe_connect_account_id = $2`,
    [chargesEnabled, accountId]
  );
}

module.exports = {
  getUserRole,
  getUserBasicInfo,
  getStripeConnectAccount,
  saveStripeConnectAccountId,
  setChargesEnabledByAccountId,
};