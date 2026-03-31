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
 *   Key:   session:{sessionId}
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
 *   const ctx = await getContext(sessionId);
 *   // ... lógica con ctx.lastEntity o ctx.lastIntent ...
 *   await updateContext(sessionId, { lastIntent: 'precios', lastEntity: { type: 'product', value: 'laptop' } });
 */

const redis = require('../config/redis');

/** TTL del contexto en Redis: 3.5 minutos */
const SESSION_TTL_SECONDS = 210;

/**
 * Construye la clave de Redis con prefijo para evitar colisiones.
 * @param {string} sessionId
 * @returns {string}
 */
function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

/** Empty context returned for new sessions or when Redis is unavailable. */
const EMPTY_CONTEXT = {
  lastIntent: null,
  lastEntity: { type: null, value: null },
  updatedAt: null,
};

/**
 * Recupera el contexto de una sesión desde Redis.
 *
 * Si la clave no existe (sesión nueva o TTL expirado) devuelve un objeto
 * con todos los campos en null — el pipeline lo trata como sesión sin historial.
 *
 * @param {string} sessionId  UUID generado en el frontend (sessionStorage)
 * @returns {Promise<{
 *   lastIntent:  string|null,
 *   lastEntity:  { type: string|null, value: string|null },
 *   updatedAt:   string|null
 * }>}
 */
async function getContext(sessionId) {
  try {
    const raw = await redis.get(sessionKey(sessionId));
    if (!raw) {
      return { ...EMPTY_CONTEXT };
    }
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
  } catch (err) {
    console.warn('[Context] Error al leer contexto Redis:', err.message);
    return { ...EMPTY_CONTEXT };
  }
}

/**
 * Guarda o actualiza el contexto de la sesión en Redis.
 *
 * Hace MERGE sobre el contexto previo para no perder campos que no se
 * modifican en el turno actual.
 * SETEX renueva el TTL con cada interacción activa.
 *
 * @param {string} sessionId
 * @param {{
 *   lastIntent?:  string|null,
 *   lastEntity?:  { type: string|null, value: string|null }
 * }} data  Campos a actualizar (parcial)
 * @returns {Promise<void>}
 */
async function updateContext(sessionId, data) {
  try {
    const current = await getContext(sessionId);
    const updated = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await redis.setex(sessionKey(sessionId), SESSION_TTL_SECONDS, JSON.stringify(updated));
  } catch (err) {
    console.warn('[Context] Error al guardar contexto Redis:', err.message);
  }
}

module.exports = { getContext, updateContext, EMPTY_CONTEXT };
