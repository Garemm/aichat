// ── Category Model ──────────────────────────────────────────────────────────
const db = require('../config/database');

const CategoryModel = {
  async findByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT id, name, parent_id FROM categories
       WHERE business_id = $1
       ORDER BY name ASC`,
      [businessId]
    );
    return rows;
  },
};

module.exports = CategoryModel;
