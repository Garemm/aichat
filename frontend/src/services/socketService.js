/**
 * services/socketService.js — Singleton socket.io-client connection.
 *
 * WHY A SINGLETON?
 *   Ensures only one WebSocket connection exists regardless of how many
 *   components import this module. Prevents duplicate event listeners.
 *
 * FUTURE TIP (auth):
 *   When adding JWT, pass the token in the auth option:
 *     socket = io(SOCKET_URL, { auth: { token: getToken() } })
 *   The server reads it via: socket.handshake.auth.token
 */

import { io } from 'socket.io-client';

// Connect to the same origin that served the page.
// Vite's proxy (/socket.io → localhost:3000) handles both localhost
// and LAN-IP access (e.g. from a phone), so no hardcoded URL is needed.
let socket = null;

const socketService = {
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
