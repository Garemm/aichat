// ── Business Model ──────────────────────────────────────────────────────────
const db = require('../config/database');

const BusinessModel = {
  /**
   * Inserts a new business row.
   * Returns the created row including the auto-generated id.
   */
  async create({ name, category, description, city, email, phone, webpage_link }) {
    const { rows } = await db.query(
      `INSERT INTO businesses (name, category, description, city, email, phone, webpage_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, category`,
      [name, category, description, city, email, phone, webpage_link]
    );
    return rows[0];
  },

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

  async findByEmail(email) {
    const { rows } = await db.query(
      `SELECT id, name, email FROM businesses WHERE email = $1`,
      [email]
    );
    return rows[0] || null;
  },

  async findAdminByBusinessEmail(email) {
    const { rows } = await db.query(
      `SELECT a.id AS admin_id, a.username, b.email, b.name AS business_name
       FROM businesses b
       JOIN admins a ON a.business_id = b.id
       WHERE b.email = $1
       LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  },
};

module.exports = BusinessModel;
