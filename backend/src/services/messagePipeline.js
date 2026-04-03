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
const { preprocessMessage } = require('./textPreprocessor');
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
  getProductAttributes,
  getServiceByName,
} = require('./businessInfoService');
const { formatIntentResponse, formatHorarioDay, formatList, formatDescripcionResponse, formatProductAttributes, formatServiceDetail } = require('./intentResponseFormatter');
const { getKeywordResponse } = require('../mockai/keywordResponses');
const { getMockOpenAIResponse, getRAGOpenAIResponse } = require('../temp/mockOpenAI');
const { shouldUseAI, hasRelevantData } = require('./aiDecisionEngine');
const { filterRelevantData } = require('./ragFilterService');
const { searchByAttributes, formatAttributeResponse } = require('./attributeSearchService');
const { extractAttribute } = require('./attributeExtractor');

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
 * Uses the same normalization as the main pipeline so punctuation/accents are
 * handled consistently. Matches in BOTH directions:
 *   - forward:  user text contains the category name  ("quiero ver bebidas" → "Bebidas")
 *   - reverse:  category name contains the user text   ("Bebidas Calientes" ← "bebidas")
 *
 * Sorting by descending name length ensures the most-specific category wins
 * when two categories could match (e.g. "Pizzas" vs "Pizzas Especiales").
 *
 * @param {string}   normalizedText        Already preprocessed with preprocessMessage()
 * @param {string[]} availableCategories
 * @returns {string|null}
 */
function detectCategorySelection(normalizedText, availableCategories) {
  if (!availableCategories || availableCategories.length === 0) return null;

  // Sort longest category first so "Pizzas Especiales" beats "Pizzas" on exact matches
  const sorted = [...availableCategories].sort((a, b) => b.length - a.length);

  for (const cat of sorted) {
    // Use full normalize() — same pipeline as preprocessMessage — so punctuation
    // and accents are stripped identically on both sides.
    const catNorm = normalize(cat);
    if (normalizedText.includes(catNorm) || catNorm.includes(normalizedText)) {
      return cat;
    }
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
  return `Tenemos muchos productos disponibles 😊 ¿Estás buscando algo en particular?\n\n${catList}\n\nSólo díme la categoría que te interesa.`;
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
    return `${base}\n\nEscribe *"ver más"* para continuar viendo los siguientes productos.`;
  }
  return `${base}\n\n✅ ¡Eso es todo en esta categoría!`;
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
 * Extracts a product entity from follow-up messages in an active product context.
 * Handles two shapes:
 *   1. "¿Y pizza mexicana?" — starts with "y"
 *   2. Bare noun phrase — 2-5 tokens, no question or verb words
 *      e.g. "pizza mexicana", "pizza bbq al pastor"
 *
 * Only active when there's a lastEntity in context (product-track).
 *
 * @param {string} normalizedText
 * @param {{ value: string|null, type: string|null }} lastEntity
 * @returns {string|null}
 */
/**
 * If a follow-up candidate starts with a preposition ("de", "del", "con", "al"),
 * reconstruct the full entity by prepending the base word from context.
 *
 * Example: lastEntityValue="agua de limon", candidate="de jamaica" → "agua de jamaica"
 * Example: lastEntityValue="tacos al pastor", candidate="al carbon" → "tacos al carbon"
 *
 * @param {string} candidate       Raw extracted follow-up candidate
 * @param {string} contextValue    lastEntity.value from context
 * @returns {string}
 */
function enrichFollowUpCandidate(candidate, contextValue) {
  const PREP_PREFIX = /^(?:de[l]?|con|en|al|a)\s+/;
  if (!PREP_PREFIX.test(candidate) || !contextValue) return candidate;
  // Extract base of context entity (everything before the first preposition)
  const baseMatch = contextValue.match(/^(.+?)\s+(?:de[l]?|con|en|al|a)\s+/);
  if (baseMatch?.[1]) {
    return `${baseMatch[1]} ${candidate}`;
  }
  return candidate;
}

function extractFollowUpEntity(normalizedText, lastEntity) {
  if (!lastEntity?.value) return null;

  // Articles that should never be the first word of an entity name.
  const LEAD_ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas']);

  /**
   * Strips a leading article/preposition from an extracted candidate string.
   * "la pizza mexicana" → "pizza mexicana"
   * "los tacos" → "tacos"
   */
  function stripLeadingArticle(text) {
    const parts = text.trim().split(/\s+/);
    let i = 0;
    while (i < parts.length - 1 && LEAD_ARTICLES.has(parts[i])) i++;
    return parts.slice(i).join(' ');
  }

  // Shape 1a: "y pizza mexicana" / "y la pizza mexicana" — starts with "y"
  const matchY = normalizedText.match(/^y\s+(?<entity>[\w\s]+?)$/);
  if (matchY?.groups?.entity) {
    const candidate = stripLeadingArticle(matchY.groups.entity.trim());
    if (candidate.length >= 2 && !candidate.split(/\s+/).some((w) => QUESTION_WORDS.has(w))) {
      return enrichFollowUpCandidate(candidate, lastEntity.value);
    }
  }

  // Shape 1b: starts with "tambien / igual / otro / otra" (+ optional article)
  const matchTrigger = normalizedText.match(
    /^(?:tambien|igual|otro|otra|tb|tmb)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?<entity>[\w\s]+?)$/
  );
  if (matchTrigger?.groups?.entity) {
    const candidate = stripLeadingArticle(matchTrigger.groups.entity.trim());
    if (candidate.length >= 2 && !candidate.split(/\s+/).some((w) => QUESTION_WORDS.has(w))) {
      return enrichFollowUpCandidate(candidate, lastEntity.value);
    }
  }

  // Shape 2: bare noun phrase (2-5 tokens, no question/meta/verb words)
  // Catches "pizza mexicana", "la pizza mexicana" when user refines a product search.
  // Leading articles are stripped so "la pizza mexicana" → "pizza mexicana".
  const BARE_SKIP = new Set([
    ...QUESTION_WORDS,
    'hay', 'tienen', 'tienes', 'tiene', 'venden', 'vende', 'vendes',
    'busco', 'quiero', 'necesito', 'existen', 'existe', 'ofrecen', 'ofrece',
    'si', 'no', 'ok', 'ya', 'hola', 'gracias', 'buenas', 'saludos',
    // Follow-up trigger words — excluded so Shape 2 doesn't include them in the entity
    'tambien', 'igual', 'otro', 'otra', 'tb', 'tmb',
  ]);
  const tokens = normalizedText.split(/\s+/);
  // Allow leading articles in the token count — they'll be stripped after the check.
  const meaningfulTokens = tokens.filter((t) => !LEAD_ARTICLES.has(t));
  if (tokens.length >= 2 && tokens.length <= 6 && meaningfulTokens.length >= 1) {
    if (!tokens.some((w) => BARE_SKIP.has(w)) && normalizedText.length >= 3) {
      const cleaned = stripLeadingArticle(normalizedText);
      if (cleaned.length >= 2) {
        return enrichFollowUpCandidate(cleaned, lastEntity.value);
      }
    }
  }

  return null;
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

  // Rule 1.5: AI pre-screen — recommendation/comparison patterns beat entity routing.
  // "que me recomienda de postres?" detects entity "postres" but user wants
  // AI reasoning, not a raw catalog. Ask shouldUseAI with the real entity so
  // the (now-fixed) decision engine can bypass the entity guard when text
  // explicitly signals a recommendation or comparison.
  const aiPrescreen = shouldUseAI(normalizedText, intentResult, entityResult, context);
  if (aiPrescreen.routing === 'ai') {
    return {
      strategy: 'ai',
      intent: null,
      entity: { type: null, value: null },
      usedContext: false,
      reason: `AI pre-screen: ${aiPrescreen.reason}`,
    };
  }

  // Rule 1.7: Attribute entity → always route to attribute search (no AI needed)
  if (entityResult.type === 'attribute') {
    return {
      strategy: 'attribute',
      intent: 'productos',
      entity: {
        type: 'attribute',
        value: entityResult.value,
        attributeType: entityResult.attributeType,
      },
      usedContext: false,
      reason: `attribute detected: "${entityResult.value}" (${entityResult.attributeType})`,
    };
  }

  // Rule 2: Clear entity detected in message → use it directly, NO context
  if (hasEntity) {
    // If we also have an intent, combine them; otherwise infer 'productos' for product/category entities
    const effectiveIntent = hasIntent
      ? intentResult.intent
      : (entityResult.type === 'product' || entityResult.type === 'category')
        ? 'productos'
        : null;
    return {
      strategy: 'entity',
      intent: effectiveIntent,
      entity: { type: entityResult.type, value: entityResult.value },
      usedContext: false,
      reason: `entity detected: ${entityResult.type}="${entityResult.value}"`,
    };
  }

  // Rule 2.5: High-confidence general catalog query ("que productos tienes", "que vendes").
  // When the user explicitly asks for the full product list with a strong signal
  // (score >= HIGH_CONFIDENCE_THRESHOLD), this is a topic reset — never inherit
  // a stale context entity. Without this guard, Rule 3 would pull "pizza hawaiana"
  // from context and return that product's info instead of the catalog.
  if (hasIntent && intentResult.intent === 'productos' &&
      intentResult.score >= HIGH_CONFIDENCE_THRESHOLD && !hasEntity) {
    return {
      strategy: 'intent',
      intent: 'productos',
      entity: { type: null, value: null },
      usedContext: false,
      reason: `general catalog query: "productos" score=${intentResult.score}`,
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
      // If the last entity was NOT found in DB, treat as catalog intent (entity.value = null)
      // so a bare "sí" after a miss shows the catalog instead of re-querying the dead entity.
      const entityNotFound = context.lastEntityFound === false;
      const entityForAmbiguous = entityNotFound
        ? { type: null, value: null }
        : (context.lastEntity?.value
          ? { type: context.lastEntity.type, value: context.lastEntity.value }
          : { type: null, value: null });
      // When product was not found, redirect to catalog regardless of previous intent
      // (avoids re-querying unknown product or prompting for a product name again)
      const intentForAmbiguous = entityNotFound ? 'productos' : context.lastIntent;
      return {
        strategy: 'context',
        intent: intentForAmbiguous,
        entity: entityForAmbiguous,
        usedContext: true,
        reason: `ambiguous message, using context`,
      };
    }
  }

  // Rule 5: Check for follow-up entity ("¿Y pizza mexicana?", "tambien X", bare noun)
  const followUp = extractFollowUpEntity(normalizedText, context.lastEntity);
  if (followUp) {
    return {
      strategy: 'followup',
      intent: context.lastIntent ?? null,   // reuse last intent (e.g. 'productos')
      entity: { type: 'product', value: followUp },
      usedContext: true,
      reason: `follow-up entity: "${followUp}"`,
    };
  }

  // Rule 6: Anti-fallback — if there is valid context but no entity/intent could
  // be resolved from this message, prefer context over AI for short messages.
  // This handles ambiguous continuations like "y ese?" that isAmbiguous() misses.
  // Skip if:
  //   - the last entity was a miss (would re-query a known-empty product)
  //   - the last entity is a 'day' type (temporal context must not contaminate product/recommendation queries)
  if (context.lastEntity?.value && context.lastEntityFound !== false &&
      context.lastEntity?.type !== 'day' &&
      normalizedText.length >= 2 && normalizedText.length <= 40) {
    const hasNewTopic = normalizedText.split(/\s+/).some((w) =>
      ['horario', 'horarios', 'direccion', 'contacto', 'promos', 'promociones', 'descuentos'].includes(w)
    );
    if (!hasNewTopic) {
      return {
        strategy: 'context',
        intent: context.lastIntent ?? null,
        entity: { type: context.lastEntity.type, value: context.lastEntity.value },
        usedContext: true,
        reason: `anti-fallback: using context entity "${context.lastEntity.value}"`,
      };
    }
  }

  // Rule 7: Fallback to AI
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

  // Attribute search — store the searched attribute(s) in Redis
  if (decision.strategy === 'attribute') {
    return {
      lastIntent: 'productos',
      lastEntity: { type: 'attribute', value: decision.entity.value },
      lastAttributes: decision._attributes ?? [{ value: decision.entity.value, type: decision.entity.attributeType }],
      lastEntityFound: true,
      paginationCategory: null,
      paginationOffset: null,
      paginationTotal: null,
      availableCategories: null,
    };
  }

  // Entity detected → track entity, clear intent (new track)
  if (decision.entity?.value && !decision.usedContext) {
    const entityToStore = { type: decision.entity.type, value: decision.entity.value };
    if (decision.entity.type === 'day' && decision.entity.dayOfWeek !== undefined) {
      entityToStore.dayOfWeek = decision.entity.dayOfWeek;
    }
    return {
      lastIntent: decision.intent,
      lastEntity: entityToStore,
      lastEntityFound: true,   // reset to true; processMessage overrides to false on DB miss
      // New entity detected → clear any lingering pagination / category state
      paginationCategory: null,
      paginationOffset: null,
      paginationTotal: null,
      availableCategories: null,
      lastAttributes: null,
    };
  }

  // Follow-up entity → update entity track, keep intent
  if (decision.strategy === 'followup' && decision.entity?.value) {
    return {
      lastIntent: decision.intent,   // persist reused intent (may be null — that's OK)
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

  // General catalog query (productos intent, no entity) → clear stale entity so the
  // next ambiguous follow-up ("cuánto cuesta?") doesn't re-query the old product.
  if (decision.strategy === 'intent' && decision.intent === 'productos' && !decision.entity?.value) {
    return {
      lastIntent: 'productos',
      lastEntity: { type: null, value: null },
      paginationCategory: null,
      paginationOffset: null,
      paginationTotal: null,
      availableCategories: null,
      lastAttributes: null,
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
        return `¡Listo! Aunque al parecer ya no hay más productos en ${cat}. ¿Puedo ayudarte con algo más?`;
      }
      await updateContext(businessId, sessionId, { paginationOffset: offset });
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
      await updateContext(businessId, sessionId, {
        lastIntent: 'productos',
        lastEntity: { type: 'category', value: cat },
        paginationCategory: cat,
        paginationOffset: 0,
        paginationTotal: total,
        availableCategories: null,
      });
      if (rows.length === 0) {
        return `Hmm, parece que no tenemos productos en la categoría "${cat}". ¿Quieres explorar otra?`;
      }
      return formatProductPage(rows, 0, total, cat);
    } catch (err) {
      console.error('[Pipeline] Error loading category:', err.message);
    }
  }

  // ── Attribute search: "algo con X", "para madera", "que tenga wifi" ──────────
  if (decision.strategy === 'attribute') {
    try {
      const attributes = decision._attributes ?? [{ value: decision.entity.value, type: decision.entity.attributeType }];
      const { rows, strategy } = await searchByAttributes(attributes, businessId);
      return formatAttributeResponse(attributes, rows, strategy);
    } catch (err) {
      console.error('[Pipeline] Error in attribute search:', err.message);
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

  // Servicios intent: show specific service detail if entity provided, else full list
  if (decision.intent === 'servicios') {
    if (decision.entity?.value) {
      try {
        const services = await getServiceByName(businessId, decision.entity.value);
        if (services.length > 0) return formatServiceDetail(services[0]);
      } catch (err) {
        console.error('[Pipeline] Error querying service by name:', err.message);
      }
    }
    try {
      const data = await getBusinessInfoByIntent('servicios', businessId);
      return formatIntentResponse('servicios', data);
    } catch (err) {
      console.error('[Pipeline] Error querying servicios:', err.message);
    }
  }

  // Price-specific response: intent=precios + product entity (from message OR context)
  if (decision.intent === 'precios' && decision.entity?.type === 'product' && decision.entity?.value) {
    try {
      const rows = await queryProducts(decision.entity.value, businessId);
      if (rows.length === 0) {
        return `Mmm, no encontré el producto "*${decision.entity.value}*" en nuestro catálogo. ¿Te gustaría ver los productos disponibles?`;
      }
      const p = rows[0];
      let response = `El producto *${p.name}* cuesta $${Number(p.price).toFixed(2)}.`;
      try {
        const attrsMap = await getProductAttributes([p.id]);
        response += formatProductAttributes(attrsMap, p.id);
      } catch { /* attributes are optional */ }
      return response;
    } catch (err) {
      console.error('[Pipeline] Error querying product price:', err.message);
    }
  }

  // Description request: intent=descripcion → show product/service description
  if (decision.intent === 'descripcion') {
    if (!decision.entity?.value) {
      return '¡Claro! ¿Sobre qué producto o servicio te gustaría saber más?';
    }
    try {
      const rows = await queryProducts(decision.entity.value, businessId);
      let response = formatDescripcionResponse(decision.entity.value, rows);
      if (rows.length > 0) {
        try {
          const attrsMap = await getProductAttributes([rows[0].id]);
          response += formatProductAttributes(attrsMap, rows[0].id);
        } catch { /* attributes are optional */ }
      }
      return response;
    } catch (err) {
      console.error('[Pipeline] Error querying description:', err.message);
    }
  }

  // Entity-based response: query product/category
  if (decision.entity?.value && (decision.strategy === 'entity' || decision.strategy === 'context' || decision.strategy === 'followup')) {
    // Category entity (e.g. "que bebidas tienen", "que tipo de bebidas tienen") →
    // show the first page of products for that category
    if (decision.entity.type === 'category') {
      try {
        const cat   = decision.entity.value;
        const total = await countProductosByCategory(businessId, cat);
        const rows  = await getProductosByCategory(businessId, cat, PAGE_SIZE, 0);
        await updateContext(businessId, sessionId, {
          lastIntent: 'productos',
          lastEntity: { type: 'category', value: cat },
          paginationCategory: cat,
          paginationOffset: 0,
          paginationTotal: total,
          availableCategories: null,
        });
        if (rows.length === 0) {
          return `Hmm, no encontré productos en la categoría "${cat}". ¿Quieres explorar otra?`;
        }
        return formatProductPage(rows, 0, total, cat);
      } catch (err) {
        console.error('[Pipeline] Error loading category from entity:', err.message);
      }
    }

    if (decision.entity.type === 'product') {
      try {
        const rows = await queryProducts(decision.entity.value, businessId);
        let response = formatProductResponse(decision.entity.value, rows);
        if (rows.length === 1) {
          try {
            const attrsMap = await getProductAttributes([rows[0].id]);
            response += formatProductAttributes(attrsMap, rows[0].id);
          } catch { /* attributes are optional */ }
        }
        return response;
      } catch (err) {
        console.error('[Pipeline] Error querying product:', err.message);
      }
    }
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

      let intentResponse = formatIntentResponse(decision.intent, data);

      // For ubicacion: append a brief list of the business's services
      if (decision.intent === 'ubicacion') {
        try {
          const services = await getBusinessInfoByIntent('servicios', businessId);
          if (services && services.length > 0) {
            const svcList = services.map((s) => `• ${s.name}`).join('\n');
            intentResponse +=
              `\n\n🛎️ También ofrecemos los siguientes servicios:\n${svcList}` +
              '\n\n¿Te gustaría saber más sobre alguno?';
          }
        } catch { /* services are optional */ }
      }

      return intentResponse;
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

/**
 * Hybrid AI handler: runs the AI decision engine + RAG filter, then
 * either returns a backend fallback or a simulated OpenAI response.
 *
 * @param {string} originalText     Raw user message
 * @param {string} normalizedText   Preprocessed text
 * @param {number} businessId
 * @param {{ intent: string|null, score: number, scores: object }} intentResult
 * @param {{ type: string|null, value: string|null }}              entityResult
 * @param {{ lastIntent: string|null, lastEntity: object }}        context
 * @returns {Promise<{ text: string, aiUsed: boolean, ragContext: object|null }>}
 */
async function handleAIFallback(originalText, normalizedText, businessId, intentResult, entityResult, context) {
  // Step 1: keyword responses always take priority (greetings, etc.)
  const keyword = getKeywordResponse(originalText);
  if (keyword) {
    return { text: keyword, aiUsed: false, ragContext: null };
  }

  // Step 2: AI decision engine — should we even attempt AI?
  const aiDecision = shouldUseAI(normalizedText, intentResult, entityResult, context);

  if (aiDecision.routing === 'backend') {
    // Backend fallback — use the old mock response (no AI needed)
    const fallback = getMockOpenAIResponse(originalText, {
      lastProduct: context?.lastEntity?.value ?? null,
      lastIntent: context?.lastIntent ?? null,
    });
    return { text: fallback, aiUsed: false, ragContext: null };
  }

  // Step 3: RAG filter — fetch only relevant data before sending to AI
  const ragContext = await filterRelevantData(
    normalizedText, businessId, intentResult, entityResult, context
  );

  // Step 4: Guard — if no relevant data, don't waste an AI call
  if (!hasRelevantData(ragContext)) {
    const fallback = getMockOpenAIResponse(originalText, {
      lastProduct: context?.lastEntity?.value ?? null,
      lastIntent: context?.lastIntent ?? null,
    });
    return { text: fallback, aiUsed: false, ragContext };
  }

  // Step 5: Simulated OpenAI call with RAG context
  // In production: replace getRAGOpenAIResponse with actual OpenAI API call
  const aiResponse = getRAGOpenAIResponse(originalText, ragContext, {
    lastIntent: context?.lastIntent ?? null,
    lastEntity: context?.lastEntity ?? null,
  });

  return { text: aiResponse, aiUsed: true, ragContext };
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Processes a user message through the full NLP pipeline.
 *
 * @param {{ text: string, sessionId: string, businessId: number }} params
 * @returns {Promise<{ replyText: string, decision: PipelineDecision, logs: object }>}
 */
async function processMessage({ text, sessionId, businessId }) {
  // 1. Preprocess: normalize + expand abbreviations + correct typos
  const normalizedText = preprocessMessage(text);

  // 2. Detect day entity (highest priority — skips DB lookup entirely)
  const dayEntity = detectDay(normalizedText);

  // 3. Detect intent (scoring) — pass preprocessed text so typos are already corrected
  const intentResult = detectIntent(normalizedText);

  // 4. Detect entities (DB lookup — skipped when day detected)
  const entityResult = dayEntity
    ? dayEntity
    : await detectEntities(normalizedText, businessId, intentResult);

  // 5. Get context from Redis
  const context = await getContext(businessId, sessionId);

  // 5b. Attribute follow-up: combine new attribute with previous search context
  // e.g. "algo con queso" → "y con pollo" → combine [queso, pollo]
  if (
    entityResult.type === 'attribute' &&
    context.lastEntity?.type === 'attribute' &&
    Array.isArray(context.lastAttributes) &&
    context.lastAttributes.length > 0
  ) {
    const newAttr = { value: entityResult.value, type: entityResult.attributeType };
    // Avoid duplicates
    const alreadyPresent = context.lastAttributes.some(
      (a) => a.value === newAttr.value
    );
    if (!alreadyPresent) {
      const combinedAttributes = [...context.lastAttributes, newAttr];
      // Override entity result to trigger multi-attribute search
      entityResult._combinedAttributes = combinedAttributes;
    }
  }

  // 6. Make decision
  const decision = decide(intentResult, entityResult, context, normalizedText);

  // If we detected combined attributes, attach them to the decision
  if (entityResult._combinedAttributes) {
    decision._attributes = entityResult._combinedAttributes;
  }

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

  // 6. Execute decision → response (hybrid: backend-first, AI as last resort)
  let replyText;
  let aiUsed = false;
  let ragContext = null;

  if (decision.strategy === 'ai') {
    // Hybrid AI path: decision engine + RAG filter + simulated OpenAI
    const aiResult = await handleAIFallback(
      text, normalizedText, businessId, intentResult, entityResult, context
    );
    replyText = aiResult.text;
    aiUsed = aiResult.aiUsed;
    ragContext = aiResult.ragContext;
  } else {
    // Deterministic backend path
    replyText = await executeDecision(decision, text, businessId, context, sessionId);
  }

  // Enrich logs with AI routing info
  logs.aiUsed = aiUsed;
  if (ragContext) {
    logs.ragType = ragContext.type;
    logs.ragDataCount = ragContext.data?.length ?? 0;
    logs.ragSummary = ragContext.summary;
  }

  // 7. Update context
  // When a product entity was detected but NOT found in DB:
  //   • Keep lastEntity in context so "y de X" follow-ups can refine the search
  //   • Set lastEntityFound=false so a bare "sí" shows the catalog (not a re-query)
  let contextUpdate;
  if (decision._ctxOverride !== undefined) {
    contextUpdate = decision._ctxOverride;
  } else {
    contextUpdate = buildContextUpdate(decision);
    // entity strategy: _rows comes directly from detectEntities
    const entityMissedViaDirect =
      decision.strategy === 'entity' &&
      decision.entity?.type === 'product' &&
      entityResult._rows?.length === 0;
    // followup / context strategies: entity came from context/follow-up logic,
    // not from detectEntities, so _rows is undefined. Infer miss from reply text.
    // Both formatProductResponse and formatDescripcionResponse emit a variant:
    //   formatProductResponse  → "Lo siento, no encontr..."
    //   formatDescripcionResponse → "No encontré información..."
    const entityMissedViaContext =
      (decision.strategy === 'followup' || decision.strategy === 'context') &&
      decision.entity?.type === 'product' &&
      decision.entity?.value &&
      typeof replyText === 'string' &&
      replyText.toLowerCase().includes('no encontr');

    if (entityMissedViaDirect || entityMissedViaContext) {
      contextUpdate.lastEntityFound = false;
    }
  }

  if (Object.keys(contextUpdate).length > 0) {
    await updateContext(businessId, sessionId, contextUpdate);
  }

  return { replyText, decision, logs };
}

module.exports = {
  processMessage,
  decide,
  buildContextUpdate,
  executeDecision,
  handleAIFallback,
  isAmbiguous,
  extractFollowUpEntity,
  HIGH_CONFIDENCE_THRESHOLD,
};
