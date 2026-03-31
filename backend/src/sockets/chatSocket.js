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
 */

const { Server } = require('socket.io');
const MessageService    = require('../services/messageService');
const { processMessage } = require('../services/messagePipeline');
const { CLIENT_URL }    = require('../config/env');

/** Negocio activo. TODO: enviar desde frontend para soporte multi-negocio. */
const ACTIVE_BUSINESS_ID = 1;

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
    socket.on('send_message', async ({ roomId, sender, text, sessionId }) => {
      try {
        if (!sessionId || typeof sessionId !== 'string') {
          socket.emit('error', { message: 'sessionId requerido' });
          return;
        }

        // 1. Save and emit user message
        const message = MessageService.saveMessage({ roomId, sender, text });
        io.to(roomId).emit('receive_message', message);

        // 2. Process through NLP pipeline
        const { replyText } = await processMessage({
          text,
          sessionId,
          businessId: ACTIVE_BUSINESS_ID,
        });

        // 3. Save and emit bot response
        const botMsg = MessageService.saveMessage({ roomId, sender: 'Bot', text: replyText });
        io.to(roomId).emit('receive_message', botMsg);

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

