'use strict';

/**
 * analyticsController.js
 *
 * GET /analytics/top-products/:business_id
 * Returns the top 10 most-queried products for the requesting business,
 * aggregated over the current ISO week (Mon–Sun).
 *
 * Security: verifies that the authenticated admin owns the requested business_id.
 *
 * Caching: simple in-process TTL cache (5 minutes) keyed by business_id.
 * This avoids hammering PostgreSQL on every dashboard poll cycle.
 */

const db = require('../config/database');

// ── In-process cache (business_id → { data, expiresAt }) ─────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _cache = new Map();

function _getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { _cache.delete(key); return null; }
  return entry.data;
}

function _setCache(key, data) {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * GET /analytics/top-products/:business_id
 *
 * Returns top 10 products by total query_count in the current week.
 * Response shape: { data: [{ product_id, name, query_count }] }
 */
const getTopProducts = async (req, res) => {
  const adminBusinessId = req.businessId;            // set by requireAuth middleware
  const requestedId     = parseInt(req.params.business_id, 10);

  // Multi-tenant guard: admin may only see their own business data
  if (!adminBusinessId || adminBusinessId !== requestedId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  // Check cache
  const cached = _getCached(requestedId);
  if (cached) return res.json({ data: cached });

  try {
    const result = await db.query(
      `SELECT
         pql.product_id,
         p.name,
         SUM(pql.query_count) AS query_count
       FROM product_query_logs pql
       JOIN products p ON p.id = pql.product_id
       WHERE pql.business_id = $1
         AND pql.query_date >= date_trunc('week', CURRENT_DATE)
       GROUP BY pql.product_id, p.name
       ORDER BY query_count DESC
       LIMIT 10`,
      [requestedId]
    );

    const rows = result.rows.map((r) => ({
      product_id:  r.product_id,
      name:        r.name,
      query_count: parseInt(r.query_count, 10),
    }));

    _setCache(requestedId, rows);
    return res.json({ data: rows });
  } catch (err) {
    console.error('[Analytics] Error fetching top products:', err.message);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

module.exports = { getTopProducts };
