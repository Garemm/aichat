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
 *   Value: JSON → { lastIntent, lastProduct, lastEntities, updatedAt }
 *   TTL:   SESSION_TTL_SECONDS (210 s = 3.5 min), renovado con cada actualización
 *
 * POR QUÉ REDIS Y NO BASE DE DATOS:
 *   • Expiración automática sin jobs de limpieza (TTL nativo)
 *   • Lecturas/escrituras en < 1 ms (crítico para el pipeline sincrónico del chat)
 *   • El historial NO se persiste — el contexto es efímero por diseño
 *   • Si Redis no está disponible, el chat degrada elegantemente sin contexto
 *
 * USO TÍPICO EN chatSocket.js:
 *   const ctx = await getContext(sessionId);
 *   // ... lógica con ctx.lastProduct o ctx.lastIntent ...
 *   await updateContext(sessionId, { lastIntent: 'precios', lastProduct: 'hamburguesa' });
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

/**
 * Recupera el contexto de una sesión desde Redis.
 *
 * Si la clave no existe (sesión nueva o TTL expirado) devuelve un objeto
 * con todos los campos en null — el pipeline lo trata como sesión sin historial.
 *
 * @param {string} sessionId  UUID generado en el frontend (sessionStorage)
 * @returns {Promise<{
 *   lastIntent:   string|null,
 *   lastProduct:  string|null,
 *   lastEntities: Record<string, any>,
 *   updatedAt:    string|null
 * }>}
 */
async function getContext(sessionId) {
  try {
    const raw = await redis.get(sessionKey(sessionId));
    if (!raw) {
      return { lastIntent: null, lastProduct: null, lastEntities: {}, updatedAt: null };
    }
    return JSON.parse(raw);
  } catch (err) {
    // Redis no disponible: chat continúa sin contexto — no rompe el flujo
    console.warn('[Context] Error al leer contexto Redis:', err.message);
    return { lastIntent: null, lastProduct: null, lastEntities: {}, updatedAt: null };
  }
}

/**
 * Guarda o actualiza el contexto de la sesión en Redis.
 *
 * Hace MERGE sobre el contexto previo para no perder campos que no se
 * modifican en el turno actual (ej: si solo se actualiza lastIntent,
 * lastProduct del turno anterior se conserva).
 * SETEX renueva el TTL con cada interacción activa.
 *
 * @param {string} sessionId
 * @param {{
 *   lastIntent?:   string|null,
 *   lastProduct?:  string|null,
 *   lastEntities?: Record<string, any>
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
    // SETEX garantiza TTL siempre renovado con cada mensaje activo
    await redis.setex(sessionKey(sessionId), SESSION_TTL_SECONDS, JSON.stringify(updated));
  } catch (err) {
    // No propagamos el error — el chat sigue sin contexto persistido
    console.warn('[Context] Error al guardar contexto Redis:', err.message);
  }
}

module.exports = { getContext, updateContext };
