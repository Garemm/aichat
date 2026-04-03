// ── Admin Model ───────────────────────────────────────────────────────────────
// TODO: Replace plain-text password comparison with bcrypt when upgrading auth.
const db = require('../config/database');

const AdminModel = {
  /**
   * Validates credentials against the admins table.
   * Returns { id, username, business_id } on match, null otherwise.
   */
  async findByCredentials(username, password) {
    const { rows } = await db.query(
      `SELECT id, username, business_id
       FROM admins
       WHERE username = $1 AND password = $2`,
      [username, password]
    );
    return rows[0] || null;
  },
};

module.exports = AdminModel;
