'use strict';

/**
 * src/services/attributeSearchService.js
 *
 * ATTRIBUTE SEARCH SERVICE — Searches products by semantic attributes.
 *
 * Searches across:
 *   1. product.name       (ILIKE)
 *   2. product.description (ILIKE)
 *   3. product_attributes  key/value (ILIKE)
 *   4. category.name       (ILIKE)
 *
 * Uses wordVariants() from normalize.js to handle singular/plural.
 * Does NOT depend on OpenAI.
 *
 * Multi-attribute search:
 *   Pass an array of { value, type } objects to combine conditions with AND.
 *   e.g. [{ value: "queso" }, { value: "pollo" }] → products with BOTH.
 */

const db  = require('../config/database');
const { wordVariants } = require('./normalize');

/** Maximum results to return per attribute search. */
const ATTR_SEARCH_LIMIT = 20;

// ─── Single-attribute query ───────────────────────────────────────────────────

/**
 * Builds ILIKE conditions + params for one attribute value using wordVariants.
 *
 * Returns { conditions: string[], params: any[] }
 * Caller is responsible for building the full WHERE clause and merging params.
 *
 * @param {string} attrValue         Normalized attribute value
 * @param {number} paramStartIndex   1-based index of the next $N parameter
 * @returns {{ conditions: string[], params: string[], nextIndex: number }}
 */
function buildAttributeConditions(attrValue, paramStartIndex) {
  const variants = wordVariants(attrValue);
  const conditions = [];
  const params = [];
  let idx = paramStartIndex;

  for (const v of variants) {
    const like = `%${v}%`;
    conditions.push(
      `(p.name ILIKE $${idx} OR p.description ILIKE $${idx + 1} OR ` +
      `EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.product_id = p.id AND ` +
      `(pa.value ILIKE $${idx + 2} OR pa.key ILIKE $${idx + 3})) OR ` +
      `c.name ILIKE $${idx + 4})`
    );
    params.push(like, like, like, like, like);
    idx += 5;
  }

  return { conditions, params, nextIndex: idx };
}

/**
 * Searches products matching a single attribute value.
 *
 * @param {string} attrValue  Normalized attribute value (e.g. "queso", "bluetooth")
 * @param {number} businessId
 * @returns {Promise<Array>}  Product rows
 */
async function searchByAttribute(attrValue, businessId) {
  const { conditions, params } = buildAttributeConditions(attrValue, 2);
  const whereAttr = conditions.map((c) => `(${c})`).join(' OR ');

  const result = await db.query(
    `SELECT
       p.id, p.name, p.description, p.price, p.is_available,
       pi.stock_quantity, c.name AS category
     FROM products p
     LEFT JOIN product_inventory pi ON p.id = pi.product_id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.business_id = $1
       AND (${whereAttr})
     ORDER BY p.name ASC
     LIMIT ${ATTR_SEARCH_LIMIT}`,
    [businessId, ...params]
  );
  return result.rows;
}

// ─── Multi-attribute query ────────────────────────────────────────────────────

/**
 * Searches products matching ALL supplied attributes (AND logic).
 * Falls back to OR logic when no products match all conditions.
 *
 * @param {Array<{ value: string }>} attributes  Array of extracted attributes
 * @param {number}                   businessId
 * @returns {Promise<{ rows: Array, strategy: 'AND'|'OR' }>}
 */
async function searchByAttributes(attributes, businessId) {
  if (!attributes || attributes.length === 0) {
    return { rows: [], strategy: 'AND' };
  }

  if (attributes.length === 1) {
    const rows = await searchByAttribute(attributes[0].value, businessId);
    return { rows, strategy: 'AND' };
  }

  // Try AND first (more precise)
  const andRows = await _searchMultiAND(attributes, businessId);
  if (andRows.length > 0) return { rows: andRows, strategy: 'AND' };

  // Fallback: OR (at least one attribute matches)
  const orRows = await _searchMultiOR(attributes, businessId);
  return { rows: orRows, strategy: 'OR' };
}

async function _searchMultiAND(attributes, businessId) {
  let idx = 2;
  const allParams = [businessId];
  const andClauses = [];

  for (const attr of attributes) {
    const { conditions, params, nextIndex } = buildAttributeConditions(attr.value, idx);
    const attrClause = conditions.map((c) => `(${c})`).join(' OR ');
    andClauses.push(`(${attrClause})`);
    allParams.push(...params);
    idx = nextIndex;
  }

  const result = await db.query(
    `SELECT
       p.id, p.name, p.description, p.price, p.is_available,
       pi.stock_quantity, c.name AS category
     FROM products p
     LEFT JOIN product_inventory pi ON p.id = pi.product_id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.business_id = $1
       AND ${andClauses.join(' AND ')}
     ORDER BY p.name ASC
     LIMIT ${ATTR_SEARCH_LIMIT}`,
    allParams
  );
  return result.rows;
}

async function _searchMultiOR(attributes, businessId) {
  let idx = 2;
  const allParams = [businessId];
  const orClauses = [];

  for (const attr of attributes) {
    const { conditions, params, nextIndex } = buildAttributeConditions(attr.value, idx);
    const attrClause = conditions.map((c) => `(${c})`).join(' OR ');
    orClauses.push(`(${attrClause})`);
    allParams.push(...params);
    idx = nextIndex;
  }

  const result = await db.query(
    `SELECT
       p.id, p.name, p.description, p.price, p.is_available,
       pi.stock_quantity, c.name AS category
     FROM products p
     LEFT JOIN product_inventory pi ON p.id = pi.product_id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.business_id = $1
       AND (${orClauses.join(' OR ')})
     ORDER BY p.name ASC
     LIMIT ${ATTR_SEARCH_LIMIT}`,
    allParams
  );
  return result.rows;
}

// ─── Response formatter ───────────────────────────────────────────────────────

/**
 * Formats attribute search results into a human-readable Spanish response.
 *
 * @param {Array<{ value: string }>} attributes
 * @param {Array}  rows
 * @param {'AND'|'OR'} strategy
 * @returns {string}
 */
function formatAttributeResponse(attributes, rows, strategy = 'AND') {
  const label = attributes.map((a) => `"${a.value}"`).join(' y ');

  if (!rows || rows.length === 0) {
    return (
      `Lo siento, no encontré productos relacionados con ${label}. ` +
      `¿Quieres ver el catálogo completo o buscar algo diferente?`
    );
  }

  const strategyNote =
    strategy === 'OR' && attributes.length > 1
      ? `\n_(No encontré productos con todos los criterios juntos. Te muestro los que coinciden con al menos uno.)_`
      : '';

  if (rows.length === 1) {
    const p = rows[0];
    const status = p.is_available ? '✅ Disponible' : '❌ No disponible';
    const stock  = p.stock_quantity != null ? `\n  📦 Stock: ${p.stock_quantity} uds.` : '';
    const cat    = p.category ? `\n  🏷️ Categoría: ${p.category}` : '';
    const desc   = p.description ? `\n  📝 ${p.description}` : '';
    return (
      `🔍 Encontré un producto con ${label}:\n\n` +
      `*${p.name}*\n` +
      `  💲 $${Number(p.price).toFixed(2)}\n` +
      `  ${status}` +
      stock + cat + desc +
      strategyNote
    );
  }

  const tooMany = rows.length >= ATTR_SEARCH_LIMIT;

  const lines = rows.map((p) => {
    const status = p.is_available ? '✅' : '❌';
    const stock  = p.stock_quantity != null ? ` · stock: ${p.stock_quantity}` : '';
    const cat    = p.category ? ` [${p.category}]` : '';
    return `  • ${status} *${p.name}*${cat} — $${Number(p.price).toFixed(2)}${stock}`;
  });

  const header = tooMany
    ? `🔍 Encontré muchos productos con ${label} (mostrando los primeros ${ATTR_SEARCH_LIMIT}):`
    : `🔍 Encontré *${rows.length} producto${rows.length > 1 ? 's' : ''}* con ${label}:`;

  const footer = tooMany
    ? `\n\n¿Quieres filtrar más? Por ejemplo: "productos con ${attributes[0].value} y [otro atributo]"`
    : '';

  return `${header}\n\n${lines.join('\n')}${footer}${strategyNote}`;
}

module.exports = {
  searchByAttribute,
  searchByAttributes,
  formatAttributeResponse,
  buildAttributeConditions,
  ATTR_SEARCH_LIMIT,
};
