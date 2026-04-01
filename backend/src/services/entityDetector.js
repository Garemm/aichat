'use strict';

/**
 * src/services/entityDetector.js
 *
 * ENTITY DETECTOR — Multi-type entity extraction from user messages.
 *
 * Detects three entity types:
 *   - product:   a specific product name ("laptop gamer", "hamburguesa doble")
 *   - category:  a product category ("herramientas", "bebidas", "cuadernos")
 *   - promotion: a reference to a specific promotion ("2x1 en pizzas")
 *
 * DESIGN:
 *   - Does NOT hardcode product/category names — queries the DB dynamically
 *   - Uses regex patterns to extract candidate entities from Spanish phrases
 *   - The patterns are industry-agnostic (work for restaurant, hardware, stationery, etc.)
 *   - Falls back to Compromise NLP noun-phrase extraction as last resort
 *
 * PIPELINE POSITION:
 *   Runs AFTER intentDetector. The intent result helps disambiguate:
 *   - "tienen descuentos?" → intent=promociones, entity=null (no specific promo)
 *   - "tienen laptop?"     → intent=null (no strong phrase), entity=product:"laptop"
 */

const nlp = require('compromise');
const db  = require('../config/database');
const { normalize, toSingular, wordVariants } = require('./normalize');

// ─── Stopwords ────────────────────────────────────────────────────────────────

const ENTITY_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'en', 'por', 'para', 'con', 'sin',
  'disponible', 'disponibles', 'ese', 'esa', 'esos', 'esas',
  'algun', 'alguna', 'tambien', 'mas', 'otro', 'otra',
  'ese', 'aqui', 'ahi', 'alli', 'eso', 'esto',
]);

/**
 * Generic / meta words that are NEVER valid entity names.
 * If the entire extracted entity is one of these → reject.
 */
const ENTITY_BLOCKLIST = new Set([
  'producto', 'productos', 'articulo', 'articulos',
  'item', 'items', 'cosa', 'cosas', 'mercancia',
  'catalogo', 'lista', 'menu',
  'servicio', 'servicios', 'oferta', 'ofertas',
  'algo', 'todo', 'nada', 'mucho', 'poco',
  'promocion', 'promociones', 'descuento', 'descuentos',
  // Question words — never entity names
  'cuanto', 'cuanta', 'cuantos', 'cuantas',
  'cuando', 'donde', 'como', 'cual', 'cuales', 'quien',
  'que', 'precio', 'costo', 'tarifa',
]);

function isBlocklisted(entity) {
  if (ENTITY_BLOCKLIST.has(entity)) return true;
  return entity.split(/\s+/).some((w) => ENTITY_BLOCKLIST.has(w));
}

function stripLeadingStopwords(entity) {
  const words = entity.trim().split(/\s+/);
  let start = 0;
  while (start < words.length - 1 && ENTITY_STOPWORDS.has(words[start])) {
    start++;
  }
  return words.slice(start).join(' ').trim();
}

// ─── Trigger words for NLP fallback ───────────────────────────────────────────

const PRODUCT_TRIGGER_WORDS = new Set([
  'tienen', 'tienes', 'hay', 'busco', 'quiero', 'existe', 'existen',
  'disponible', 'disponibles', 'stock',
  'conseguir', 'comprar', 'pedir', 'ordenar', 'solicitar',
  'informacion', 'info', 'detalle', 'detalles',
  'vende', 'vendes', 'venden',
  'ofrece', 'ofrecen', 'necesito',
  // Price-query trigger words
  'precio', 'precios', 'cuesta', 'cuanto', 'vale', 'cobran', 'costo',
]);

function hasProductTrigger(normalizedText) {
  return normalizedText.split(/\s+/).some((w) => PRODUCT_TRIGGER_WORDS.has(w));
}

// ─── Extraction regex patterns (industry-agnostic Spanish) ────────────────────

const PRODUCT_QUERY_PATTERNS = [
  /tienen\s+disponible\s+(?<entity>[\w\s]+?)(?:\?|$)/,
  /hay\s+disponibilidad\s+de\s+(?<entity>[\w\s]+?)(?:\?|$)/,
  /cu[ae]nto\s+(?:cuesta|vale|sale|cobran\s+por)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "que precio tiene la hamburguesa" / "cual es el precio de la pizza"
  /(?:que\s+|cual\s+es\s+(?:el\s+)?)?precio\s+(?:tiene[n]?|cuesta|cobran|vale|sale)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "precio hamburguesa" / "precio agua de horchata" (bare price query, starts with "precio")
  /^precio\s+(?:de\s+)?(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /precio\s+de\s+(?:el\s+|la\s+|los\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /me\s+(?:pueden\s+dar|das?|traes?)\s+(?:el\s+|la\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /tienen\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /tienes\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /hay\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /existe[n]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /busco\s+(?:un\s+|una\s+|el\s+|la\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /quiero\s+(?:un\s+|una\s+|el\s+|la\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /me\s+interesa\s+(?:el\s+|la\s+|los\s+|las\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /info(?:rmacion)?\s+(?:de\s+)?(?:el\s+|la\s+|los\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /vende[ns]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /ofrece[ns]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /necesito\s+(?:un\s+|una\s+|el\s+|la\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
];

// ─── Core extraction logic ────────────────────────────────────────────────────

/**
 * Extracts a raw entity candidate from the normalized message text.
 * Uses regex patterns first, then falls back to NLP noun phrases.
 *
 * @param {string} normalizedText
 * @returns {string|null}
 */
function extractEntityCandidate(normalizedText) {
  // Step 1: regex patterns
  for (const pattern of PRODUCT_QUERY_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match?.groups?.entity) {
      const raw = match.groups.entity.trim();
      const cleaned = stripLeadingStopwords(raw);
      if (cleaned.length >= 2 && !isBlocklisted(cleaned)) return cleaned;
    }
  }

  // Step 2: NLP fallback — only when a trigger word is present
  if (!hasProductTrigger(normalizedText)) return null;

  const doc = nlp(normalizedText);
  const nouns = doc.nouns().out('array');

  if (nouns.length > 0) {
    const best = nouns
      .map((n) => stripLeadingStopwords(normalize(n)))
      .filter((n) => n.length >= 2 && !isBlocklisted(n))
      .sort((a, b) => b.length - a.length)[0];
    if (best) return best;
  }

  return null;
}

// ─── DB lookups ───────────────────────────────────────────────────────────────

/**
 * Searches products table. Returns matching rows.
 * @param {string} entity
 * @param {number} businessId
 * @returns {Promise<Array>}
 */
async function queryProducts(entity, businessId) {
  // Build variants: "cuadernos" → search "cuadernos" OR "cuaderno"
  const variants = wordVariants(entity);
  const conditions = variants.map((_, i) => `p.name ILIKE $${i + 2}`);
  const params = [businessId, ...variants.map((v) => `%${v}%`)];

  const result = await db.query(
    `SELECT
       p.id, p.name, p.description, p.price, p.is_available,
       pi.stock_quantity, c.name AS category
     FROM products p
     LEFT JOIN product_inventory pi ON p.id = pi.product_id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.business_id = $1
       AND (${conditions.join(' OR ')})
     ORDER BY
       CASE WHEN LOWER(p.name) = LOWER($${params.length + 1}) THEN 0 ELSE 1 END,
       p.name ASC
     LIMIT 5`,
    [...params, entity]
  );
  return result.rows;
}

/**
 * Searches categories table. Returns matching category rows.
 * @param {string} entity
 * @param {number} businessId
 * @returns {Promise<Array>}
 */
async function queryCategories(entity, businessId) {
  const variants = wordVariants(entity);
  const conditions = variants.map((_, i) => `c.name ILIKE $${i + 2}`);
  const params = [businessId, ...variants.map((v) => `%${v}%`)];

  const result = await db.query(
    `SELECT DISTINCT c.id, c.name
     FROM categories c
     JOIN products p ON p.category_id = c.id
     WHERE p.business_id = $1
       AND (${conditions.join(' OR ')})
     LIMIT 5`,
    params
  );
  return result.rows;
}

/**
 * Searches promotions table by keyword in title/description.
 * @param {string} entity
 * @param {number} businessId
 * @returns {Promise<Array>}
 */
async function queryPromotions(entity, businessId) {
  const result = await db.query(
    `SELECT id, title, description, discount_type, discount_value, start_date, end_date
     FROM promotions
     WHERE business_id = $1
       AND end_date >= CURRENT_DATE
       AND (title ILIKE $2 OR description ILIKE $2)
     ORDER BY end_date ASC
     LIMIT 5`,
    [businessId, `%${entity}%`]
  );
  return result.rows;
}

// ─── Entity type classification ───────────────────────────────────────────────

/**
 * @typedef {Object} DetectedEntity
 * @property {string|null} product   - Product name or null
 * @property {string|null} category  - Category name or null
 * @property {string|null} promotion - Promotion reference or null
 * @property {'product'|'category'|'promotion'|null} type - Primary entity type
 * @property {string|null} value     - The raw value of the primary entity
 */

/**
 * Detects entities of multiple types from a user message.
 *
 * Strategy:
 *   1. Extract candidate entity from the message text
 *   2. If the detected intent is a strong standalone (horarios, ubicacion) → skip entity detection
 *   3. Query DB in priority order: product → category → promotion
 *   4. Return the first match found with its type
 *
 * @param {string} message          Raw user message
 * @param {number} businessId       Active business
 * @param {{ intent: string|null, score: number }} intentResult  From intentDetector
 * @returns {Promise<DetectedEntity>}
 */
async function detectEntities(message, businessId, intentResult = { intent: null, score: 0 }) {
  const empty = { product: null, category: null, promotion: null, type: null, value: null };

  const normalizedText = normalize(message);
  const candidate = extractEntityCandidate(normalizedText);

  if (!candidate) return empty;

  // Try product first (most common case)
  try {
    const productRows = await queryProducts(candidate, businessId);
    if (productRows.length > 0) {
      return { ...empty, product: candidate, type: 'product', value: candidate, _rows: productRows };
    }
  } catch (err) {
    console.error('[EntityDetector] Error querying products:', err.message);
  }

  // Try category
  try {
    const categoryRows = await queryCategories(candidate, businessId);
    if (categoryRows.length > 0) {
      return { ...empty, category: candidate, type: 'category', value: candidate, _categoryRows: categoryRows };
    }
  } catch (err) {
    console.error('[EntityDetector] Error querying categories:', err.message);
  }

  // Try promotion
  try {
    const promoRows = await queryPromotions(candidate, businessId);
    if (promoRows.length > 0) {
      return { ...empty, promotion: candidate, type: 'promotion', value: candidate, _promoRows: promoRows };
    }
  } catch (err) {
    console.error('[EntityDetector] Error querying promotions:', err.message);
  }

  // Candidate found in text but no DB match — still return candidate as product attempt
  return { ...empty, product: candidate, type: 'product', value: candidate, _rows: [] };
}

// ─── Response formatters ──────────────────────────────────────────────────────

/**
 * Formats product query results into readable text.
 * @param {string} entity
 * @param {Array} products
 * @returns {string}
 */
function formatProductResponse(entity, products) {
  if (!products || products.length === 0) {
    return `Lo siento, no encontré ningún producto relacionado con "*${entity}*". ¿Quieres ver el catálogo completo?`;
  }

  if (products.length === 1) {
    const p = products[0];
    const status = p.is_available ? '✅ Disponible' : '❌ No disponible';
    const stock  = p.stock_quantity != null ? `\n  📦 Stock: ${p.stock_quantity} uds.` : '';
    const cat    = p.category ? `\n  🏷️ Categoría: ${p.category}` : '';
    const desc   = p.description ? `\n  📝 ${p.description}` : '';
    return (
      `🔍 *${p.name}*\n` +
      `  💲 Precio: $${Number(p.price).toFixed(2)}\n` +
      `  ${status}` +
      stock + cat + desc
    );
  }

  const lines = products.map((p) => {
    const status = p.is_available ? '✅' : '❌';
    const stock  = p.stock_quantity != null ? ` · stock: ${p.stock_quantity}` : '';
    const cat    = p.category ? ` [${p.category}]` : '';
    return `  • ${status} *${p.name}*${cat}\n      💲 $${Number(p.price).toFixed(2)}${stock}`;
  });
  return `🔍 Encontré *${products.length} resultados* para "${entity}":\n\n${lines.join('\n\n')}`;
}

/**
 * Formats category query results — lists products in that category.
 * @param {string} categoryName
 * @param {Array} rows  Product rows from the category
 * @returns {string}
 */
function formatCategoryResponse(categoryName, rows) {
  if (!rows || rows.length === 0) {
    return `No encontré productos en la categoría "*${categoryName}*".`;
  }
  const lines = rows.map((p) => {
    const status = p.is_available ? '✅' : '❌';
    const stock  = p.stock_quantity != null ? ` · stock: ${p.stock_quantity}` : '';
    return `  • ${status} *${p.name}* — $${Number(p.price).toFixed(2)}${stock}`;
  });
  return `📂 *Categoría: ${categoryName}*\n\n${lines.join('\n')}`;
}

module.exports = {
  detectEntities,
  extractEntityCandidate,
  queryProducts,
  queryCategories,
  queryPromotions,
  formatProductResponse,
  formatCategoryResponse,
  // Exported for testing
  isBlocklisted,
  stripLeadingStopwords,
  hasProductTrigger,
  PRODUCT_QUERY_PATTERNS,
};
