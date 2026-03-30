/**
 * src/sockets/chatSocket.js
 *
 * SOCKET.IO — Chat Event Handlers
 *
 * Intentionally decoupled from app.js:
 *   - HTTP layer (Express) and WS layer (Socket.io) stay independent
 *   - Both call the same MessageService → no duplicated logic
 *
 * FUTURE FEATURES TO ADD HERE:
 *   - Rooms list / room management events
 *   - Presence (online users per room)
 *   - Read receipts
 *   - AI streaming: pipe OpenAI stream chunks → socket.emit('ai_chunk', chunk)
 *   - Auth check on connection: use `socket.handshake.auth.token` once JWT is added
 */

const { Server } = require('socket.io');
const MessageService = require('../services/messageService');
const { getMockOpenAIResponse } = require('../temp/mockOpenAI');
const { getKeywordResponse } = require('../mockai/keywordResponses');
const { detectIntent } = require('../services/intentService');
const { getBusinessInfoByIntent } = require('../services/businessInfoService');
const { formatIntentResponse } = require('../services/intentResponseFormatter');
const { extractAndRespond } = require('../services/nlpEntityExtractor');
const { CLIENT_URL } = require('../config/env');

/** Business whose data is queried when an intent is detected. */
const ACTIVE_BUSINESS_ID = 1;

let io;

/**
 * Initializes Socket.io and attaches it to the HTTP server.
 * Call this from server.js before httpServer.listen().
 * @param {import('http').Server} httpServer
 */
const initSocket = (httpServer) => {
  // CLIENT_URL is already an array (parsed in env.js)
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

      // Send message history only to the user who just joined
      const history = MessageService.getRoomMessages(roomId);
      socket.emit('message_history', history);
    });

    // ── Send a message ───────────────────────────────────────────────────────
    socket.on('send_message', async ({ roomId, sender, text }) => {
      try {
        console.log('[SOCKET.IO] Mensaje recibido:', { roomId, sender, text });

        // Save & broadcast the user message immediately
        const message = MessageService.saveMessage({ roomId, sender, text });
        io.to(roomId).emit('receive_message', message);

        // ── Stage 1: NLP entity extraction (specific product lookup) ─────────
        // Handles: "tienen hamburguesa?", "cuanto cuesta la pizza?", etc.
        // Returns a formatted string when a product entity is detected,
        // or null when the message is not a specific product query.
        const nlpReply = await extractAndRespond(text, ACTIVE_BUSINESS_ID);
        if (nlpReply) {
          const botMsg = MessageService.saveMessage({ roomId, sender: 'Bot', text: nlpReply });
          io.to(roomId).emit('receive_message', botMsg);
          return;
        }

        // ── Stage 2: Keyword intent detection (broad topic queries) ──────────
        // Handles: "a que hora abren?", "que productos tienen?", "hay ofertas?"
        // Returns a topic key (horarios/precios/etc.) or null.
        const intent = detectIntent(text);
        if (intent) {
          console.log(`[Intent] Detectado: "${intent}" | Mensaje: "${text}"`);
          try {
            const data = await getBusinessInfoByIntent(intent, ACTIVE_BUSINESS_ID);
            console.log(`[Intent] Resultado DB (negocio=${ACTIVE_BUSINESS_ID}, intent=${intent}):`, data);
            const replyText = formatIntentResponse(intent, data);
            const botMsg = MessageService.saveMessage({ roomId, sender: 'Bot', text: replyText });
            io.to(roomId).emit('receive_message', botMsg);
          } catch (dbErr) {
            console.error('[Intent] Error al consultar la base de datos:', dbErr.message);
            const fallback = getMockOpenAIResponse(text);
            const botMsg = MessageService.saveMessage({ roomId, sender: 'Bot', text: fallback });
            io.to(roomId).emit('receive_message', botMsg);
          }
          return;
        }

        // ── Stage 3: Keyword responses / mock AI (pure fallback) ─────────────
        console.log(`[Intent] Sin coincidencia para: "${text}"`);
        setTimeout(() => {
          let aiText = getKeywordResponse(text);
          if (!aiText) aiText = getMockOpenAIResponse(text);
          const aiMsg = MessageService.saveMessage({ roomId, sender: 'OpenAI', text: aiText });
          io.to(roomId).emit('receive_message', aiMsg);
        }, 1200);
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
