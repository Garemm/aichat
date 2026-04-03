/**
 * services/socketService.js — Singleton socket.io-client + gestión de sessionId.
 *
 * MANEJO DE SESIÓN ANÓNIMA:
 *   No hay autenticación. Cada pestaña del navegador genera un sessionId único
 *   (crypto.randomUUID, API nativa del navegador) que se guarda en sessionStorage.
 *   sessionStorage tiene alcance de pestaña: se limpia al cerrar la pestaña,
 *   lo que garantiza sesiones separadas por contexto de conversación.
 *
 *   El sessionId se envía en el payload de cada 'send_message' para que el
 *   backend pueda recuperar el contexto conversacional de Redis.
 *   El frontend NO almacena contexto del negocio — esa lógica vive en el backend.
 *
 * POR QUÉ sessionStorage Y NO localStorage:
 *   localStorage persiste entre pestañas y sesiones del navegador.
 *   sessionStorage garantiza sesiones independientes por pestaña,
 *   alineado con el TTL de 3.5 min en Redis.
 */

import { io } from 'socket.io-client';

let socket = null;

/**
 * UUID v4 generator that works in ALL browser contexts, including
 * non-secure origins (HTTP over LAN). crypto.randomUUID() is restricted
 * to secure contexts (HTTPS/localhost) and throws on iPhone when the app
 * is accessed via a local IP over plain HTTP. crypto.getRandomValues() has
 * no such restriction and is available everywhere.
 */
function generateUUID() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
  buf[8] = (buf[8] & 0x3f) | 0x80; // variant RFC 4122
  const h = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

const socketService = {
  /**
   * Obtiene o genera el sessionId para la pestaña actual.
   * Se crea una sola vez con crypto.randomUUID() y se guarda en sessionStorage.
   * @returns {string} UUID v4
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('chat_session_id');
    if (!sessionId) {
      sessionId = generateUUID();
      sessionStorage.setItem('chat_session_id', sessionId);
    }
    return sessionId;
  },

  /**
   * Establece (o reutiliza) la conexión WebSocket.
   * La conexión es compartida por toda la pestaña — un solo socket por pestaña.
   * @returns {import('socket.io-client').Socket}
   */
  connect() {
    if (!socket) {
      socket = io(window.location.origin, {
        autoConnect: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    }
    return socket;
  },

  disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  },

  getSocket() {
    if (!socket) return this.connect();
    return socket;
  },
};

export default socketService;

