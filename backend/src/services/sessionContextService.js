'use strict';

/**
 * src/services/sessionContextService.js
 *
 * SESSION CONTEXT SERVICE
 *
 * PROPÓSITO:
 *   Guarda y recupera el contexto conversacional de cada sesión anónima.
 *   No hay autenticación — las sesiones se identifican únicamente por un
 *   sessionId (UUID) generado en el frontend y enviado en cada mensaje.
 *
 * ESTRUCTURA EN REDIS:
 *   Key:   session:{businessId}:{sessionId}
 *   Value: JSON → { lastIntent, lastEntity: { type, value }, updatedAt }
 *   TTL:   SESSION_TTL_SECONDS (210 s = 3.5 min), renovado con cada actualización
 *
 * POR QUÉ REDIS Y NO BASE DE DATOS:
 *   • Expiración automática sin jobs de limpieza (TTL nativo)
 *   • Lecturas/escrituras en < 1 ms (crítico para el pipeline sincrónico del chat)
 *   • El historial NO se persiste — el contexto es efímero por diseño
 *   • Si Redis no está disponible, el chat degrada elegantemente sin contexto
 *
 * USO TÍPICO EN messagePipeline.js:
 *   const ctx = await getContext(businessId, sessionId);
 *   // ... lógica con ctx.lastEntity o ctx.lastIntent ...
 *   await updateContext(businessId, sessionId, { lastIntent: 'precios', lastEntity: { type: 'product', value: 'laptop' } });
 */

const redis = require('../config/redis');

/** TTL del contexto en Redis: 3.5 minutos */
const SESSION_TTL_SECONDS = 210;

/**
 * Construye la clave de Redis con prefijo para evitar colisiones.
 * @param {number|string} businessId
 * @param {string} sessionId
 * @returns {string}
 */
function sessionKey(businessId, sessionId) {
  return `session:${businessId}:${sessionId}`;
}

/** Empty context returned for new sessions or when Redis is unavailable. */
const EMPTY_CONTEXT = {
  lastIntent: null,
  lastEntity: { type: null, value: null },
  lastAttributes: null,
  updatedAt: null,
};

// ─── In-memory fallback ──────────────────────────────────────────────────────
// Preserves session context within the process during transient Redis outages.
// Writing to memory happens BEFORE the Redis call so context is never lost even
// when Redis.setex throws.

const _memStore = new Map();

function _memGet(key) {
  const entry = _memStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    _memStore.delete(key);
    return null;
  }
  return entry.value;
}

function _memSet(key, value) {
  if (_memStore.size >= 1000) {
    // Evict the oldest entry to prevent unbounded growth
    _memStore.delete(_memStore.keys().next().value);
  }
  _memStore.set(key, { value, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
}

// ─── Context parsing / migration ─────────────────────────────────────────────

function _parseContext(raw) {
  const parsed = JSON.parse(raw);
  // Migrate old format: { lastProduct, lastEntities } → { lastEntity: { type, value } }
  if (parsed.lastProduct !== undefined && parsed.lastEntity === undefined) {
    parsed.lastEntity = parsed.lastProduct
      ? { type: 'product', value: parsed.lastProduct }
      : { type: null, value: null };
    delete parsed.lastProduct;
    delete parsed.lastEntities;
  }
  // Ensure lastEntity always has the right shape
  if (!parsed.lastEntity || typeof parsed.lastEntity !== 'object') {
    parsed.lastEntity = { type: null, value: null };
  }
  return parsed;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Recupera el contexto de una sesión desde Redis.
 * Si Redis no está disponible, utiliza el fallback en memoria del proceso.
 *
 * @param {number|string} businessId  ID del negocio activo
 * @param {string} sessionId          UUID generado en el frontend (sessionStorage)
 * @returns {Promise<object>}
 */
async function getContext(businessId, sessionId) {
  const key = sessionKey(businessId, sessionId);
  try {
    const raw = await redis.get(key);
    if (!raw) {
      // Redis returned null: key doesn't exist or TTL expired — respect that and
      // return empty. Memory fallback is NOT used here because null is a valid
      // "no session" response from Redis (not an error).
      return { ...EMPTY_CONTEXT };
    }
    const parsed = _parseContext(raw);
    // Keep memory in sync so it stays current for outage fallback
    _memSet(key, raw);
    return parsed;
  } catch (err) {
    console.warn('[Context] Error al leer contexto Redis:', err.message);
    // Redis threw (connection down / unavailable) — serve from in-memory fallback
    const memRaw = _memGet(key);
    if (memRaw) {
      try { return _parseContext(memRaw); } catch { /* corrupt entry — fall through */ }
    }
    return { ...EMPTY_CONTEXT };
  }
}

/**
 * Guarda o actualiza el contexto de la sesión.
 * Siempre escribe en memoria primero; luego intenta persistir en Redis.
 * Si Redis falla, el contexto queda disponible en el fallback en memoria.
 *
 * @param {number|string} businessId  ID del negocio activo
 * @param {string} sessionId
 * @param {object} data  Campos a actualizar (merge parcial)
 * @returns {Promise<void>}
 */
async function updateContext(businessId, sessionId, data) {
  const key = sessionKey(businessId, sessionId);
  try {
    const current = await getContext(businessId, sessionId);
    const updated = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(updated);
    // Write to memory FIRST — survives Redis failure
    _memSet(key, serialized);
    // Then persist to Redis (may throw if unavailable)
    await redis.setex(key, SESSION_TTL_SECONDS, serialized);
  } catch (err) {
    console.warn('[Context] Error al guardar contexto Redis:', err.message);
    // In-memory write already completed — context is preserved in the process
  }
}

module.exports = { getContext, updateContext, EMPTY_CONTEXT, SESSION_TTL_SECONDS };
