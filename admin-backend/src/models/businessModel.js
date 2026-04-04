// ── Business Model ──────────────────────────────────────────────────────────
const db = require('../config/database');

const BusinessModel = {
  async findById(id) {
    const { rows } = await db.query(
      `SELECT id, name, category, description, city, email, phone, webpage_link, created_at
       FROM businesses WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async update(id, { name, category, description, city, email, phone, webpage_link }) {
    const { rows } = await db.query(
      `UPDATE businesses
       SET name = $1, category = $2, description = $3, city = $4,
           email = $5, phone = $6, webpage_link = $7
       WHERE id = $8
       RETURNING id, name, category, description, city, email, phone, webpage_link`,
      [name, category, description, city, email, phone, webpage_link, id]
    );
    return rows[0] || null;
  },
};

module.exports = BusinessModel;
