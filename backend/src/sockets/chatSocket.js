/**
 * src/sockets/chatSocket.js
 *
 * SOCKET.IO — Chat Event Handlers.
 *
 * Delegates all NLP processing to messagePipeline.js.
 * This file only handles:
 *   - Socket.io connection/disconnection
 *   - Room join/leave
 *   - Message persistence and emission
 *   - Typing indicators
 *   - Idle-timeout reengagement message
 */

const { Server } = require('socket.io');
const MessageService    = require('../services/messageService');
const { processMessage } = require('../services/messagePipeline');
const { CLIENT_URL }    = require('../config/env');
const { getContext, updateContext, SESSION_TTL_SECONDS } = require('../services/sessionContextService');
const { getCategories } = require('../services/businessInfoService');
const { formatList }    = require('../services/intentResponseFormatter');

/** Milliseconds of inactivity before sending the re-engagement message.
 *  Matches SESSION_TTL_SECONDS so the message fires exactly when Redis context expires. */
const IDLE_TIMEOUT_MS = SESSION_TTL_SECONDS * 1000;

// ─── Idle timer tracking ──────────────────────────────────────────────────────
// sessionTimers: sessionId → { roomId, businessId, timerId }
// socketSessions: socket.id → sessionId   (needed to clear timer on disconnect)
const sessionTimers  = new Map();
const socketSessions = new Map();

/**
 * Clears any running idle timer for the session and schedules a new one.
 * On expiry: fetches categories, emits re-engagement message, sets context.
 *
 * @param {string} sessionId
 * @param {string} roomId
 * @param {number} businessId
 */
function resetIdleTimer(sessionId, roomId, businessId) {
  // Cancel existing timer
  const existing = sessionTimers.get(sessionId);
  if (existing) clearTimeout(existing.timerId);

  const timerId = setTimeout(async () => {
    sessionTimers.delete(sessionId);
    try {
      const categories = await getCategories(businessId);
      if (!categories || categories.length === 0) return;

      const catList    = formatList('📂 Categorías disponibles:', categories);
      const replyText  =
        `Hola, noté que te tomaste una pausa ☕\n¿Tienes alguna otra duda?\n\n` +
        `Te envío nuestro catálogo de categorías:\n\n${catList}`;

      // Set category_selection context so the next message routes correctly
      await updateContext(businessId, sessionId, {
        lastIntent:          'category_selection',
        availableCategories: categories,
      });

      const botMsg = MessageService.saveMessage({ roomId, sender: 'Bot', text: replyText });
      if (io) io.to(roomId).emit('receive_message', botMsg);
    } catch (err) {
      console.warn('[Idle] Error al enviar mensaje de pausa:', err.message);
    }
  }, IDLE_TIMEOUT_MS);

  sessionTimers.set(sessionId, { roomId, businessId, timerId });
}

let io;

/**
 * Inicializa Socket.io y lo adjunta al servidor HTTP.
 * Llamar desde server.js antes de httpServer.listen().
 * @param {import('http').Server} httpServer
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: CLIENT_URL,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected:    ${socket.id}`);

    // ── Join a room ──────────────────────────────────────────────────────────
    socket.on('join_room', (roomId) => {
      socket.join(roomId);
      console.log(`[Socket] ${socket.id} joined room: ${roomId}`);

      const history = MessageService.getRoomMessages(roomId);
      socket.emit('message_history', history);
    });

    // ── Send a message ───────────────────────────────────────────────────────
    socket.on('send_message', async ({ roomId, sender, text, sessionId, businessId }) => {
      try {
        if (!sessionId || typeof sessionId !== 'string') {
          socket.emit('error', { message: 'sessionId requerido' });
          return;
        }

        if (!businessId || typeof businessId !== 'number') {
          socket.emit('error', { message: 'businessId requerido' });
          return;
        }

        // Track which sessionId this socket is using (needed for disconnect cleanup)
        socketSessions.set(socket.id, sessionId);

        // 1. Save and emit user message
        const message = MessageService.saveMessage({ roomId, sender, text });
        io.to(roomId).emit('receive_message', message);

        // 2. Process through NLP pipeline
        const { replyText } = await processMessage({
          text,
          sessionId,
          businessId,
        });

        // 3. Save and emit bot response
        const botMsg = MessageService.saveMessage({ roomId, sender: 'Bot', text: replyText });
        io.to(roomId).emit('receive_message', botMsg);

        // 4. Reset idle timer — clock starts from the last bot reply
        resetIdleTimer(sessionId, roomId, businessId);

      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ── Typing indicators ────────────────────────────────────────────────────
    socket.on('typing', ({ roomId, sender }) => {
      socket.to(roomId).emit('user_typing', { sender });
    });

    socket.on('stop_typing', ({ roomId, sender }) => {
      socket.to(roomId).emit('user_stop_typing', { sender });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      // Clear idle timer so we don't send a message to an empty room
      const sessionId = socketSessions.get(socket.id);
      if (sessionId) {
        const entry = sessionTimers.get(sessionId);
        if (entry) {
          clearTimeout(entry.timerId);
          sessionTimers.delete(sessionId);
        }
        socketSessions.delete(socket.id);
      }
    });
  });

  return io;
};

/**
 * Returns the initialized io instance.
 * Use this to emit events from services (e.g. after an AI response is ready).
 */
const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized. Call initSocket() first.');
  return io;
};

module.exports = { initSocket, getIO };

