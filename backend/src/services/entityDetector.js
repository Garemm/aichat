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
  // Intent-domain words — these are intent names, not valid product entities.
  // Without blocking them, "que horarios tienen?" would extract "horarios" as
  // a false product entity and override the correct intent routing.
  'horario', 'horarios',
  'precios',          // singular 'precio' already covered below
  'ubicacion', 'ubicaciones',
  // Verb forms — Compromise NLP can extract conjugated verb stems as nouns
  // (e.g. "tienen" from "que promociones tienen"). Block all common forms.
  'tiene', 'tienen', 'tienes', 'tener',
  'hay', 'haber',
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
  'tiene', 'tienen', 'tienes', 'hay', 'busco', 'quiero', 'existe', 'existen',
  'disponible', 'disponibles', 'stock',
  'conseguir', 'comprar', 'pedir', 'ordenar', 'solicitar',
  'informacion', 'info', 'detalle', 'detalles',
  'vende', 'vendes', 'venden',
  'ofrece', 'ofrecen', 'necesito',
  // Price-query trigger words
  'precio', 'precios', 'cuesta', 'cuanto', 'vale', 'cobran', 'costo',
  // Description-query trigger words
  'contiene', 'incluye', 'trae', 'caracteristicas', 'especificaciones', 'descripcion',
]);

function hasProductTrigger(normalizedText) {
  return normalizedText.split(/\s+/).some((w) => PRODUCT_TRIGGER_WORDS.has(w));
}

// ─── Extraction regex patterns (industry-agnostic Spanish) ────────────────────

const PRODUCT_QUERY_PATTERNS = [
  // "cuantas/cuantos X tienes/tienen/hay" — verb AFTER entity
  /cu[ae]n(?:to|ta)s?\s+(?:de\s+)?(?<entity>[\w\s]+?)\s+(?:tienes?|tienen|hay)(?:\?|$)/,
  /tienen\s+disponible\s+(?<entity>[\w\s]+?)(?:\?|$)/,
  /hay\s+disponibilidad\s+de\s+(?<entity>[\w\s]+?)(?:\?|$)/,
  /cu[ae]nto\s+(?:cuesta|vale|sale|cobran\s+por)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "que precio tiene la hamburguesa" / "cual es el precio de la pizza"
  /(?:que\s+|cual\s+es\s+(?:el\s+)?)?precio\s+(?:tiene[n]?|cuesta|cobran|vale|sale)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "precio hamburguesa" / "precio agua de horchata" (bare price query, starts with "precio")
  /^precio\s+(?:de\s+)?(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /precio\s+de\s+(?:el\s+|la\s+|los\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /me\s+(?:pueden\s+dar|das?|traes?)\s+(?:el\s+|la\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "puedes decirme si tienen X" / "me puedes decir si tienen X"
  /(?:me\s+)?puedes?\s+(?:decirme\s+)?(?:si\s+)?(?:tienen?|hay)\s+(?<entity>[\w\s]+?)(?:\?|$)/,
  // Availability phrases
  /esta(?:s|n)?\s+disponible[s]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /hay\s+stock\s+de\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /tiene(?:s|n)?\s+disponibilidad\s+(?:de\s+)?(?:el\s+|la\s+|los\s+|las\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "que tipo(s) de X tienen/tienes/tiene/hay" — entity inside "que tipo de … verb"
  // MUST appear before the generic "que X tienen" pattern below.
  /^que\s+tipos?\s+de\s+(?<entity>[\w]+(?:\s+[\w]+){0,3})\s+(?:tiene[sn]?|tienen|hay)\s*\??$/,
  /que\s+tipos?\s+de\s+(?<entity>[\w]+(?:\s+[\w]+){0,3})\s+(?:tiene[sn]?|tienen|hay)/,
  // "que [entity] tienen/tienes/hay?" — entity BETWEEN "que" and trailing verb.
  // Must run BEFORE the generic tiene[sn]? pattern which would otherwise grab
  // whatever follows "tienen" (e.g. "disponibles") as the entity.
  // Distinct from description patterns where verb follows IMMEDIATELY after "que".
  /^que\s+(?<entity>[\w]+(?:\s+[\w]+){0,4})\s+(?:tiene[sn]?|tienen|hay)\s*(?:[\w]+\s*)?\??$/,
  /tiene[sn]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /hay\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /existe[n]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /busco\s+(?:un\s+|una\s+|el\s+|la\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /quiero\s+(?:un\s+|una\s+|el\s+|la\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /me\s+interesa\s+(?:el\s+|la\s+|los\s+|las\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /info(?:rmacion)?\s+(?:de\s+)?(?:el\s+|la\s+|los\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /vende[ns]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /ofrece[ns]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /necesito\s+(?:un\s+|una\s+|el\s+|la\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // Reversed-order: entity before verb — "X tienes?" / "X hay?"
  /(?<entity>[\w]+(?:\s+[\w]+){0,3})\s+(?:tienes?|tienen|hay)\s*\?$/,
  // Description-intent phrases: "que contiene X", "que incluye X", "que trae X"
  // singular and plural forms, optional article el/la/los/las before entity
  /(?:que\s+)?contiene[n]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+|este\s+|esta\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /(?:que\s+)?incluye[n]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+|este\s+|esta\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /(?:que\s+)?trae[n]?\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+|este\s+|esta\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  /de\s+que\s+esta[n]?\s+hech[oa]s?\s+(?:el\s+|la\s+|los\s+|las\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "que tiene/tienen los/las X" — description of entity with article
  /que\s+tiene[n]?\s+(?:el\s+|la\s+|los\s+|las\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
  // "caracteristicas de X" / "especificaciones de X" / "descripcion de X"
  /(?:caracteristicas|especificaciones|descripcion)\s+(?:de[l]?\s+)?(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)(?:\?|$)/,
];

// ─── Entity candidate cleanup ────────────────────────────────────────────────

/**
 * Strips trailing noise words from an entity candidate.
 * These words appear at the end of extracted candidates but are not part
 * of the entity name (e.g. "cables disponibles" → "cables").
 *
 * @param {string} entity  Candidate string (normalized, stopwords stripped from start)
 * @returns {string}
 */
function cleanEntityCandidate(entity) {
  return entity
    .replace(/\s+disponibles?\s*$/, '')
    .replace(/\s+en\s+stock\s*$/, '')
    .replace(/\s+que\s+(?:tengas?|tienen|hay)\s*$/, '')
    .replace(/\s+para\s+(?:comprar|vender)\s*$/, '')
    .trim();
}

// ─── Core extraction logic ────────────────────────────────────────────────────

/**
 * Extracts a raw entity candidate from the normalized message text.
 * Uses regex patterns first, then falls back to NLP noun phrases.
 * Applies singularization to the extracted candidate so that plurals
 * like "cables" still match product records named "cable".
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
      const stripped = stripLeadingStopwords(raw);
      const cleaned = cleanEntityCandidate(stripped);
      if (cleaned.length >= 2 && !isBlocklisted(cleaned)) {
        return cleaned;
      }
    }
  }

  // Step 2: NLP fallback — only when a trigger word is present
  if (!hasProductTrigger(normalizedText)) return null;

  const doc = nlp(normalizedText);
  const nouns = doc.nouns().out('array');

  if (nouns.length > 0) {
    const best = nouns
      .map((n) => {
        const stripped = stripLeadingStopwords(normalize(n));
        return cleanEntityCandidate(stripped);
      })
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

  // ── "que tipo(s) de X tienen" — check category first, then product ──────────
  // This pattern signals the user wants a type/kind of product, so a category
  // match is preferred over an individual-product match.
  const TIPO_DE_RE = /que\s+tipos?\s+de\s+(?<entity>[\w]+(?:\s+[\w]+){0,3})\s+(?:tiene[sn]?|tienen|hay)/;
  const tipoMatch = normalizedText.match(TIPO_DE_RE);
  if (tipoMatch?.groups?.entity) {
    const tipoCand = cleanEntityCandidate(stripLeadingStopwords(tipoMatch.groups.entity.trim()));
    if (tipoCand && tipoCand.length >= 2 && !isBlocklisted(tipoCand)) {
      try {
        const categoryRows = await queryCategories(tipoCand, businessId);
        if (categoryRows.length > 0) {
          return { ...empty, category: tipoCand, type: 'category', value: tipoCand };
        }
      } catch (err) {
        console.error('[EntityDetector] Error querying categories for tipo-de:', err.message);
      }
      try {
        const productRows = await queryProducts(tipoCand, businessId);
        if (productRows.length > 0) {
          return { ...empty, product: tipoCand, type: 'product', value: tipoCand, _rows: productRows };
        }
      } catch (err) {
        console.error('[EntityDetector] Error querying products for tipo-de:', err.message);
      }
      return { ...empty, product: tipoCand, type: 'product', value: tipoCand, _rows: [] };
    }
  }

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
