// ── Business Model ──────────────────────────────────────────────────────────
const db = require('../config/database');

const BusinessModel = {
  async findById(id) {
    const { rows } = await db.query(
      `SELECT id, name, category, description, city, created_at
       FROM businesses WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async update(id, { name, category, description, city }) {
    const { rows } = await db.query(
      `UPDATE businesses
       SET name = $1, category = $2, description = $3, city = $4
       WHERE id = $5
       RETURNING id, name, category, description, city`,
      [name, category, description, city, id]
    );
    return rows[0] || null;
  },
};

module.exports = BusinessModel;
