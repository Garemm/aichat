'use strict';

/**
 * src/services/messagePipeline.js
 *
 * DECISION PIPELINE — Orchestrates intent detection, entity extraction,
 * context resolution, and response generation.
 *
 * PIPELINE ORDER:
 *   1. normalize(message)
 *   2. intent  = detectIntent(message)
 *   3. entity  = detectEntities(message, businessId, intentResult)
 *   4. context = getContext(sessionId)
 *   5. decision = decide(intent, entity, context, message)
 *   6. execute decision → generate response
 *   7. updateContext(sessionId, ...)
 *
 * DECISION RULES (CORE):
 *   1. If intent is HIGH confidence (score ≥ 3) AND standalone → use intent alone
 *   2. If entity detected clearly → use entity (ignore context)
 *   3. If intent detected + entity from context → combine
 *   4. If message is ambiguous → use context
 *   5. Else → fallback to AI
 *
 * KEY RULE: clear entity in message → NEVER use context.
 *           clear intent in message → IGNORE previous context entity.
 */

const { normalize } = require('./normalize');
const { detectIntent, isStandaloneIntent } = require('./intentDetector');
const { detectEntities, queryProducts, formatProductResponse } = require('./entityDetector');
const { detectDay } = require('./dayDetector');
const { getContext, updateContext } = require('./sessionContextService');
const {
  getBusinessInfoByIntent,
  getHorariosByDay,
  getCategories,
  getProductosByCategory,
  countProductosByCategory,
} = require('./businessInfoService');
const { formatIntentResponse, formatHorarioDay, formatList } = require('./intentResponseFormatter');
const { getKeywordResponse } = require('../mockai/keywordResponses');
const { getMockOpenAIResponse } = require('../temp/mockOpenAI');

/** Minimum score to consider intent as "high confidence" (skip context). */
const HIGH_CONFIDENCE_THRESHOLD = 3;

/** Max products to show in one turn before asking user to narrow down. */
const PRODUCTS_HARD_LIMIT = 20;

/** Products per paginated page inside a category. */
const PAGE_SIZE = 10;

// ─── Pagination / category navigation helpers ─────────────────────────────────

/** Patterns that mean "show me next page". */
const SEE_MORE_PATTERNS = [
  /^ver mas$/,
  /^mas$/,
  /^siguiente$/,
  /^siguiente pagina$/,
  /^mas productos$/,
  /^mas resultados$/,
  /^continuar$/,
  /^mas opciones$/,
];

function isSeekingMore(normalizedText) {
  return SEE_MORE_PATTERNS.some((p) => p.test(normalizedText));
}

/**
 * Normalizes a string for loose category matching (removes accents, lowercase).
 * @param {string} s
 * @returns {string}
 */
function normalizeForMatch(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Returns the original category name from availableCategories that best matches
 * the user's message, or null if no match found.
 *
 * @param {string}   normalizedText
 * @param {string[]} availableCategories
 * @returns {string|null}
 */
function detectCategorySelection(normalizedText, availableCategories) {
  if (!availableCategories || availableCategories.length === 0) return null;
  const textNorm = normalizeForMatch(normalizedText);
  for (const cat of availableCategories) {
    if (textNorm.includes(normalizeForMatch(cat))) return cat;
  }
  return null;
}

/**
 * Formats the "too many results" pivot response that shows available categories.
 * @param {string[]} categories
 * @returns {string}
 */
function formatCategoryPrompt(categories) {
  const catList = formatList('📂 Categorías disponibles:', categories);
  return `Tenemos muchos productos disponibles. ¿Buscas algo en específico?\n\n${catList}`;
}

/**
 * Formats a paginated product slice.
 * @param {object[]} rows      Current page rows
 * @param {number}   offset    Current offset
 * @param {number}   total     Total count in category
 * @param {string}   category  Category display name
 * @returns {string}
 */
function formatProductPage(rows, offset, total, category) {
  const end = offset + rows.length;
  const header = `📦 ${category} (${offset + 1}–${end} de ${total}):`;
  const items = rows.map((r) => {
    const stock = r.stock_quantity != null ? ` · stock: ${r.stock_quantity}` : '';
    const avail = r.is_available !== false ? '✅' : '❌';
    return `${avail} ${r.name} — $${Number(r.price).toFixed(2)}${stock}`;
  });
  const base = formatList(header, items);
  if (end < total) {
    return `${base}\n\nEscribe *"ver más"* para ver los siguientes productos.`;
  }
  return `${base}\n\n✅ Eso es todo en esta categoría.`;
}

// ─── Ambiguity detection ──────────────────────────────────────────────────────

/**
 * Patterns that indicate an ambiguous / follow-up message.
 * These messages can't stand alone — they need context.
 */
const AMBIGUOUS_PATTERNS = [
  /^si$/,
  /^no$/,
  /^ok$/,
  /^ya$/,
  /^y eso$/,
  /^y esos$/,
  /^y esas$/,
  /^hay mas$/,
  /^tiene[ns]? mas$/,
  /^cuanto cuesta$/,     // without product = ambiguous
  /^cuanto vale$/,
  /^cuanto sale$/,
  /^en cuanto esta$/,
  /^y precio$/,
  /^y el precio$/,
  /^esta disponible$/,
  /^hay stock$/,
  /^que mas tienen$/,
  /^alguna otra cosa$/,
  /^algo mas$/,
  /^me das mas info$/,
  /^mas informacion$/,
  /^y la garantia$/,
  /^y envian$/,
  /^que incluye$/,
];

/**
 * Determines if a message is ambiguous and needs context to be understood.
 *
 * @param {string} normalizedText
 * @returns {boolean}
 */
function isAmbiguous(normalizedText) {
  if (normalizedText.length <= 3) return true; // Very short messages are ambiguous
  return AMBIGUOUS_PATTERNS.some((p) => p.test(normalizedText));
}

// ─── Follow-up product extraction ─────────────────────────────────────────────

const QUESTION_WORDS = new Set([
  'cuanto', 'cuanta', 'cuantos', 'cuantas',
  'cuando', 'donde', 'como', 'cual', 'cuales', 'quien',
  'que', 'precio', 'costo',
]);

/**
 * Extracts a product entity from "¿Y pizza mexicana?" style follow-ups.
 * Only active when there's a lastEntity in context (product-track).
 *
 * @param {string} normalizedText
 * @param {{ value: string|null }} lastEntity
 * @returns {string|null}
 */
function extractFollowUpEntity(normalizedText, lastEntity) {
  if (!lastEntity?.value) return null;

  const match = normalizedText.match(/^y\s+(?<entity>[\w\s]+?)$/);
  if (!match?.groups?.entity) return null;

  const candidate = match.groups.entity.trim();
  if (candidate.length < 2) return null;

  const words = candidate.split(/\s+/);
  if (words.some((w) => QUESTION_WORDS.has(w))) return null;

  return candidate;
}

// ─── Decision engine ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} PipelineDecision
 * @property {'intent'|'entity'|'context'|'followup'|'ai'} strategy
 * @property {string|null} intent
 * @property {{ type: string|null, value: string|null }} entity
 * @property {boolean} usedContext
 * @property {string} reason
 */

/**
 * Makes the routing decision based on all available signals.
 *
 * @param {{ intent: string|null, score: number, scores: object, confident: boolean }} intentResult
 * @param {{ type: string|null, value: string|null, product: string|null, category: string|null, promotion: string|null }} entityResult
 * @param {{ lastIntent: string|null, lastEntity: { type: string|null, value: string|null } }} context
 * @param {string} normalizedText
 * @returns {PipelineDecision}
 */
function decide(intentResult, entityResult, context, normalizedText) {
  const hasIntent = intentResult.intent !== null;
  const hasEntity = entityResult.type !== null && entityResult.value !== null;
  const standalone = hasIntent && isStandaloneIntent(intentResult.intent);
  const highConfidence = intentResult.score >= HIGH_CONFIDENCE_THRESHOLD;

  // Rule -1a: User is paginating ("ver más") inside a category flow
  if (isSeekingMore(normalizedText) && context.paginationCategory) {
    return {
      strategy: 'pagination',
      intent: 'productos',
      entity: { type: null, value: null },
      usedContext: true,
      reason: 'pagination: next page requested',
    };
  }

  // Rule -1b: User is selecting a category from the prompted list
  const selectedCat = detectCategorySelection(normalizedText, context.availableCategories);
  if (selectedCat && context.lastIntent === 'category_selection') {
    return {
      strategy: 'category_select',
      intent: 'productos',
      entity: { type: 'category', value: selectedCat },
      usedContext: true,
      reason: `category selected: "${selectedCat}"`,
    };
  }

  // Rule 0: Day-of-week entity detected → always horarios, never needs context
  if (entityResult.type === 'day') {
    return {
      strategy: 'entity',
      intent: 'horarios',
      entity: { type: 'day', value: entityResult.value, dayOfWeek: entityResult.dayOfWeek },
      usedContext: false,
      reason: `day "${entityResult.value}" detected → horarios`,
    };
  }

  // Rule 1: High-confidence standalone intent → use intent alone, ignore everything
  if (hasIntent && standalone && highConfidence) {
    return {
      strategy: 'intent',
      intent: intentResult.intent,
      entity: { type: null, value: null },
      usedContext: false,
      reason: `standalone intent "${intentResult.intent}" score=${intentResult.score}`,
    };
  }

  // Rule 2: Clear entity detected in message → use it directly, NO context
  if (hasEntity) {
    // If we also have an intent, combine them
    const effectiveIntent = hasIntent ? intentResult.intent : null;
    return {
      strategy: 'entity',
      intent: effectiveIntent,
      entity: { type: entityResult.type, value: entityResult.value },
      usedContext: false,
      reason: `entity detected: ${entityResult.type}="${entityResult.value}"`,
    };
  }

  // Rule 3: Intent detected without entity → check if it needs entity from context
  if (hasIntent && !standalone) {
    // Non-standalone intent (precios, productos) might need entity from context
    if (context.lastEntity?.value) {
      return {
        strategy: 'context',
        intent: intentResult.intent,
        entity: { type: context.lastEntity.type, value: context.lastEntity.value },
        usedContext: true,
        reason: `intent "${intentResult.intent}" + context entity "${context.lastEntity.value}"`,
      };
    }
    // No context entity → use intent alone (will give general response)
    return {
      strategy: 'intent',
      intent: intentResult.intent,
      entity: { type: null, value: null },
      usedContext: false,
      reason: `intent "${intentResult.intent}" without entity`,
    };
  }

  // Rule 3b: Standalone intent with lower confidence
  if (hasIntent && standalone) {
    return {
      strategy: 'intent',
      intent: intentResult.intent,
      entity: { type: null, value: null },
      usedContext: false,
      reason: `standalone intent "${intentResult.intent}" score=${intentResult.score}`,
    };
  }

  // Rule 4: Ambiguous message → use context if available
  if (isAmbiguous(normalizedText)) {
    if (context.lastEntity?.value || context.lastIntent) {
      return {
        strategy: 'context',
        intent: context.lastIntent,
        entity: context.lastEntity?.value
          ? { type: context.lastEntity.type, value: context.lastEntity.value }
          : { type: null, value: null },
        usedContext: true,
        reason: `ambiguous message, using context`,
      };
    }
  }

  // Rule 5: Check for follow-up entity ("¿Y pizza mexicana?")
  const followUp = extractFollowUpEntity(normalizedText, context.lastEntity);
  if (followUp) {
    return {
      strategy: 'followup',
      intent: null,
      entity: { type: 'product', value: followUp },
      usedContext: true,
      reason: `follow-up entity: "${followUp}"`,
    };
  }

  // Rule 6: Fallback to AI
  return {
    strategy: 'ai',
    intent: null,
    entity: { type: null, value: null },
    usedContext: false,
    reason: 'no intent or entity detected',
  };
}

// ─── Context update builder ───────────────────────────────────────────────────

/**
 * Builds the context update object based on the pipeline decision.
 *
 * @param {PipelineDecision} decision
 * @returns {Record<string, any>}  Partial update for Redis (or {} for no-op)
 */
function buildContextUpdate(decision) {
  // Pagination advance — offset is managed inside executeDecision via direct updateContext
  if (decision.strategy === 'pagination') return {};

  // Category selected — reset pagination state; executeDecision will set it
  if (decision.strategy === 'category_select') return {};

  // Entity detected → track entity, clear intent (new track)
  if (decision.entity?.value && !decision.usedContext) {
    const entityToStore = { type: decision.entity.type, value: decision.entity.value };
    if (decision.entity.type === 'day' && decision.entity.dayOfWeek !== undefined) {
      entityToStore.dayOfWeek = decision.entity.dayOfWeek;
    }
    return {
      lastIntent: decision.intent,
      lastEntity: entityToStore,
      // New entity detected → clear any lingering pagination / category state
      paginationCategory: null,
      paginationOffset: null,
      paginationTotal: null,
      availableCategories: null,
    };
  }

  // Follow-up entity → update entity track
  if (decision.strategy === 'followup' && decision.entity?.value) {
    return {
      lastEntity: { type: decision.entity.type, value: decision.entity.value },
      paginationCategory: null,
      paginationOffset: null,
      paginationTotal: null,
      availableCategories: null,
    };
  }

  // Standalone intent → clear entity (topic change)
  if (decision.strategy === 'intent' && isStandaloneIntent(decision.intent)) {
    return {
      lastIntent: decision.intent,
      lastEntity: { type: null, value: null },
      paginationCategory: null,
      paginationOffset: null,
      paginationTotal: null,
      availableCategories: null,
    };
  }

  // Non-standalone intent → keep entity, update intent
  if (decision.strategy === 'intent' || (decision.strategy === 'context' && decision.intent)) {
    return { lastIntent: decision.intent };
  }

  return {};
}

// ─── Response execution ───────────────────────────────────────────────────────

/**
 * Executes the pipeline decision and returns the response text.
 *
 * @param {PipelineDecision} decision
 * @param {string} originalText    Raw user message
 * @param {number} businessId
 * @param {{ lastIntent: string|null, lastEntity: object|null }} context
 * @returns {Promise<string>}
 */
async function executeDecision(decision, originalText, businessId, context, sessionId) {
  // ── Pagination: next page of the current category ──────────────────────────
  if (decision.strategy === 'pagination') {
    try {
      const cat    = context.paginationCategory;
      const offset = (context.paginationOffset ?? 0) + PAGE_SIZE;
      const total  = context.paginationTotal ?? 0;
      const rows   = await getProductosByCategory(businessId, cat, PAGE_SIZE, offset);
      if (rows.length === 0) {
        return `Ya no hay más productos en ${cat}. ¿Puedo ayudarte con algo más?`;
      }
      await updateContext(sessionId, { paginationOffset: offset });
      return formatProductPage(rows, offset, total, cat);
    } catch (err) {
      console.error('[Pipeline] Error paginating products:', err.message);
    }
  }

  // ── Category selection: user picked a category ─────────────────────────────
  if (decision.strategy === 'category_select') {
    try {
      const cat   = decision.entity.value;
      const total = await countProductosByCategory(businessId, cat);
      const rows  = await getProductosByCategory(businessId, cat, PAGE_SIZE, 0);
      await updateContext(sessionId, {
        lastIntent: 'productos',
        lastEntity: { type: 'category', value: cat },
        paginationCategory: cat,
        paginationOffset: 0,
        paginationTotal: total,
        availableCategories: null,
      });
      if (rows.length === 0) {
        return `No encontré productos en la categoría "${cat}".`;
      }
      return formatProductPage(rows, 0, total, cat);
    } catch (err) {
      console.error('[Pipeline] Error loading category:', err.message);
    }
  }

  // Horarios for a specific day
  if (decision.intent === 'horarios' && decision.entity?.type === 'day') {
    try {
      const row = await getHorariosByDay(businessId, decision.entity.dayOfWeek);
      return formatHorarioDay(decision.entity.value, row);
    } catch (err) {
      console.error('[Pipeline] Error querying horarios by day:', err.message);
    }
  }

  // Price-specific response: intent=precios + product entity (from message OR context)
  if (decision.intent === 'precios' && decision.entity?.type === 'product' && decision.entity?.value) {
    try {
      const rows = await queryProducts(decision.entity.value, businessId);
      if (rows.length === 0) {
        return `Lo siento, no encontré el producto "*${decision.entity.value}*". ¿Quieres ver nuestro catálogo?`;
      }
      const p = rows[0];
      return `El producto *${p.name}* cuesta $${Number(p.price).toFixed(2)}.`;
    } catch (err) {
      console.error('[Pipeline] Error querying product price:', err.message);
    }
  }

  // Entity-based response: query product/category
  if (decision.entity?.value && (decision.strategy === 'entity' || decision.strategy === 'context' || decision.strategy === 'followup')) {
    if (decision.entity.type === 'product') {
      try {
        const rows = await queryProducts(decision.entity.value, businessId);
        return formatProductResponse(decision.entity.value, rows);
      } catch (err) {
        console.error('[Pipeline] Error querying product:', err.message);
      }
    }
    // For category entities + precios intent → query products in that category
    // For now, fall through to intent handler if there's one
  }

  // Intent-based response
  if (decision.intent) {
    try {
      const data = await getBusinessInfoByIntent(decision.intent, businessId);

      // Hard limit for productos: if too many, prompt with category list instead
      if (decision.intent === 'productos' && Array.isArray(data) && data.length > PRODUCTS_HARD_LIMIT) {
        const categories = await getCategories(businessId);
        // Signal to processMessage to override buildContextUpdate()
        decision._ctxOverride = {
          lastIntent: 'category_selection',
          availableCategories: categories,
          paginationCategory: null,
          paginationOffset: null,
          paginationTotal: null,
        };
        return formatCategoryPrompt(categories);
      }

      return formatIntentResponse(decision.intent, data);
    } catch (err) {
      console.error('[Pipeline] Error querying intent:', err.message);
    }
  }

  // AI fallback
  const keyword = getKeywordResponse(originalText);
  if (keyword) return keyword;

  return getMockOpenAIResponse(originalText, {
    lastProduct: context?.lastEntity?.value ?? null,
    lastIntent: context?.lastIntent ?? null,
  });
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Processes a user message through the full NLP pipeline.
 *
 * @param {{ text: string, sessionId: string, businessId: number }} params
 * @returns {Promise<{ replyText: string, decision: PipelineDecision, logs: object }>}
 */
async function processMessage({ text, sessionId, businessId }) {
  // 1. Normalize
  const normalizedText = normalize(text);

  // 2. Detect day entity (highest priority — skips DB lookup entirely)
  const dayEntity = detectDay(normalizedText);

  // 3. Detect intent (scoring)
  const intentResult = detectIntent(text);

  // 4. Detect entities (DB lookup — skipped when day detected)
  const entityResult = dayEntity
    ? dayEntity
    : await detectEntities(text, businessId, intentResult);

  // 5. Get context from Redis
  const context = await getContext(sessionId);

  // 6. Make decision
  const decision = decide(intentResult, entityResult, context, normalizedText);

  // Logging
  const logs = {
    normalizedText,
    intentScores: intentResult.scores,
    intentWinner: intentResult.intent,
    intentScore: intentResult.score,
    entityType: entityResult.type,
    entityValue: entityResult.value,
    context: { lastIntent: context.lastIntent, lastEntity: context.lastEntity },
    decision: decision.strategy,
    reason: decision.reason,
    usedContext: decision.usedContext,
  };

  console.log('[Pipeline]', JSON.stringify(logs, null, 2));

  // 6. Execute decision → response
  const replyText = await executeDecision(decision, text, businessId, context, sessionId);

  // 7. Update context
  // Special case: if a product entity was detected in text but NOT found in DB,
  // the bot responds "no encontré… ¿Quieres ver el catálogo completo?".
  // Store intent=productos (the offered action) and clear the dead-end entity,
  // so a follow-up "sí" shows the catalog instead of re-querying the same miss.
  let contextUpdate;
  if (decision.strategy === 'entity' &&
      decision.entity?.type === 'product' &&
      entityResult._rows?.length === 0) {
    contextUpdate = {
      lastIntent: 'productos',
      lastEntity: { type: null, value: null },
    };
  } else if (decision._ctxOverride !== undefined) {
    // executeDecision computed a specific context update (e.g. category pivot)
    contextUpdate = decision._ctxOverride;
  } else {
    contextUpdate = buildContextUpdate(decision);
  }

  if (Object.keys(contextUpdate).length > 0) {
    await updateContext(sessionId, contextUpdate);
  }

  return { replyText, decision, logs };
}

module.exports = {
  processMessage,
  decide,
  buildContextUpdate,
  executeDecision,
  isAmbiguous,
  extractFollowUpEntity,
  HIGH_CONFIDENCE_THRESHOLD,
};
