'use strict';

/**
 * src/models/businessModel.js
 *
 * BUSINESS MODEL — PostgreSQL queries organized by intent.
 * Each method accepts a businessId and returns rows from the relevant table.
 *
 * ADD NEW INTENTS: add a new method here and register it in businessInfoService.js.
 */

const db = require('../config/database');

const BusinessModel = {
  /**
   * Intent: horarios
   * Returns all weekly schedule rows for the business.
   * @param {number} businessId
   */
  async getHorarios(businessId) {
    const result = await db.query(
      `SELECT
         day_of_week,
         open_time,
         close_time,
         is_closed
       FROM business_hours
       WHERE business_id = $1
       ORDER BY day_of_week ASC`,
      [businessId]
    );
    return result.rows;
  },

  /**
   * Intent: productos
   * Returns all available products with stock info for the business.
   * @param {number} businessId
   */
  async getProductos(businessId) {
    const result = await db.query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.price,
         p.is_available,
         c.name AS category,
         pi.stock_quantity
       FROM products p
       LEFT JOIN product_inventory pi ON p.id = pi.product_id
       LEFT JOIN categories         c  ON p.category_id = c.id
       WHERE p.business_id = $1
         AND p.is_available = TRUE
       ORDER BY p.name ASC`,
      [businessId]
    );
    return result.rows;
  },

  /**
   * Intent: precios
   * Returns product names and prices for the business.
   * @param {number} businessId
   */
  async getPrecios(businessId) {
    const result = await db.query(
      `SELECT
         name,
         price
       FROM products
       WHERE business_id = $1
         AND is_available = TRUE
       ORDER BY price ASC`,
      [businessId]
    );
    return result.rows;
  },

  /**
   * Intent: promociones
   * Returns active (non-expired) promotions for the business.
   * @param {number} businessId
   */
  async getPromociones(businessId) {
    const result = await db.query(
      `SELECT
         title,
         description,
         discount_type,
         discount_value,
         start_date,
         end_date
       FROM promotions
       WHERE business_id = $1
         AND end_date >= CURRENT_DATE
       ORDER BY end_date ASC`,
      [businessId]
    );
    return result.rows;
  },

  /**
   * Intent: ubicacion
   * Returns general business location info.
   * @param {number} businessId
   */
  async getUbicacion(businessId) {
    const result = await db.query(
      `SELECT
         name,
         description,
         city
       FROM businesses
       WHERE id = $1`,
      [businessId]
    );
    return result.rows[0] || null;
  },
};

module.exports = BusinessModel;
