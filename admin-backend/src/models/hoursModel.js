// ── Hours Model ──────────────────────────────────────────────────────────────
const db = require('../config/database');

// Normalize HH:MM:SS → HH:MM for <input type="time">
const t = (v) => (v ? String(v).slice(0, 5) : '');

const HoursModel = {
  async findByBusiness(businessId) {
    const { rows } = await db.query(
      `SELECT id, day_of_week, open_time, close_time, is_closed
       FROM business_hours
       WHERE business_id = $1
       ORDER BY day_of_week ASC`,
      [businessId]
    );
    return rows.map((r) => ({ ...r, open_time: t(r.open_time), close_time: t(r.close_time) }));
  },

  // Single upsert by (business_id, day_of_week) — idempotent
  async upsert(businessId, { day_of_week, open_time, close_time, is_closed }) {
    const { rows } = await db.query(
      `INSERT INTO business_hours (business_id, day_of_week, open_time, close_time, is_closed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (business_id, day_of_week)
       DO UPDATE SET open_time = $3, close_time = $4, is_closed = $5
       RETURNING id, day_of_week, open_time, close_time, is_closed`,
      [
        businessId,
        day_of_week,
        open_time  || null,
        close_time || null,
        is_closed  ?? false,
      ]
    );
    const r = rows[0];
    return { ...r, open_time: t(r.open_time), close_time: t(r.close_time) };
  },

  async bulkUpsert(businessId, days) {
    return Promise.all(days.map((d) => this.upsert(businessId, d)));
  },

  async remove(id, businessId) {
    const { rowCount } = await db.query(
      `DELETE FROM business_hours WHERE id = $1 AND business_id = $2`,
      [id, businessId]
    );
    return rowCount > 0;
  },
};

module.exports = HoursModel;
