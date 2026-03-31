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
const { getContext, updateContext } = require('./sessionContextService');
const { getBusinessInfoByIntent } = require('./businessInfoService');
const { formatIntentResponse } = require('./intentResponseFormatter');
const { getKeywordResponse } = require('../mockai/keywordResponses');
const { getMockOpenAIResponse } = require('../temp/mockOpenAI');

/** Minimum score to consider intent as "high confidence" (skip context). */
const HIGH_CONFIDENCE_THRESHOLD = 3;

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
  // Entity detected → track entity, clear intent (new track)
  if (decision.entity?.value && !decision.usedContext) {
    return {
      lastIntent: decision.intent,
      lastEntity: { type: decision.entity.type, value: decision.entity.value },
    };
  }

  // Follow-up entity → update entity track
  if (decision.strategy === 'followup' && decision.entity?.value) {
    return {
      lastEntity: { type: decision.entity.type, value: decision.entity.value },
    };
  }

  // Standalone intent → clear entity (topic change)
  if (decision.strategy === 'intent' && isStandaloneIntent(decision.intent)) {
    return {
      lastIntent: decision.intent,
      lastEntity: { type: null, value: null },
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
async function executeDecision(decision, originalText, businessId, context) {
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
    // If we have both intent (precios) and entity (product), query the specific product
    if (decision.entity?.value && decision.intent === 'precios') {
      try {
        const rows = await queryProducts(decision.entity.value, businessId);
        return formatProductResponse(decision.entity.value, rows);
      } catch (err) {
        console.error('[Pipeline] Error querying product for price:', err.message);
      }
    }

    try {
      const data = await getBusinessInfoByIntent(decision.intent, businessId);
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

  // 2. Detect intent (scoring)
  const intentResult = detectIntent(text);

  // 3. Detect entities (DB lookup)
  const entityResult = await detectEntities(text, businessId, intentResult);

  // 4. Get context from Redis
  const context = await getContext(sessionId);

  // 5. Make decision
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
  const replyText = await executeDecision(decision, text, businessId, context);

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
