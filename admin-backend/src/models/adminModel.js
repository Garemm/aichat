// ── Admin Model ──────────────────────────────────────────────────────────────
const db = require('../config/database');

const AdminModel = {
  /**
   * Looks up an admin by username returning the hashed password field.
   * Used by authService for bcrypt comparison.
   */
  async findByUsernameForAuth(username) {
    const { rows } = await db.query(
      `SELECT id, username, password, business_id
       FROM admins
       WHERE username = $1`,
      [username]
    );
    return rows[0] || null;
  },

  /**
   * Looks up an admin by username (for uniqueness check during registration).
   */
  async findByUsername(username) {
    const { rows } = await db.query(
      `SELECT id FROM admins WHERE username = $1`,
      [username]
    );
    return rows[0] || null;
  },

  async findByBusinessId(business_id) {
    const { rows } = await db.query(
      `SELECT id, username, password, business_id
       FROM admins
       WHERE business_id = $1
       LIMIT 1`,
      [business_id]
    );
    return rows[0] || null;
  },

  /**
   * Inserts a new admin row with a hashed password.
   * Returns the created { id, username, business_id }.
   */
  async create({ username, password, business_id }) {
    const { rows } = await db.query(
      `INSERT INTO admins (username, password, business_id)
       VALUES ($1, $2, $3)
       RETURNING id, username, business_id`,
      [username, password, business_id]
    );
    return rows[0];
  },

  // ── Password reset tokens ─────────────────────────────────────────────────

  async createResetToken({ admin_id, token_hash, expires_at }) {
    await db.query(
      `INSERT INTO password_resets (admin_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [admin_id, token_hash, expires_at]
    );
  },

  async findValidResetToken(token_hash) {
    const { rows } = await db.query(
      `SELECT id, admin_id
       FROM password_resets
       WHERE token_hash = $1
         AND expires_at > now()
         AND used = false`,
      [token_hash]
    );
    return rows[0] || null;
  },

  async markResetTokenUsed(id) {
    await db.query(
      `UPDATE password_resets SET used = true WHERE id = $1`,
      [id]
    );
  },

  async updatePassword(admin_id, hashed_password) {
    await db.query(
      `UPDATE admins SET password = $1 WHERE id = $2`,
      [hashed_password, admin_id]
    );
  },
};

module.exports = AdminModel;
