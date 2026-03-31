/**
 * src/sockets/chatSocket.js
 *
 * SOCKET.IO — Chat Event Handlers con pipeline de contexto conversacional.
 *
 * ARQUITECTURA DE SESIÓN:
 *   El frontend genera un sessionId (UUID v4 via crypto.randomUUID) y lo
 *   almacena en sessionStorage. Se envía en el payload de cada 'send_message'.
 *   NO hay autenticación — el sessionId identifica la sesión, no al usuario.
 *
 * PIPELINE DE PROCESAMIENTO (por orden de prioridad):
 *   1. Recuperar contexto de Redis (lastProduct, lastIntent) para la sesión
 *   2. Extraer entidad de producto del mensaje actual (regex + NLP)
 *   3. Detectar intención del mensaje actual (keyword matching)
 *   4. Resolver producto/intención efectivos con fallback al contexto previo
 *      → "¿y cuánto cuesta?" sin producto = usar context.lastProduct
 *   5. handleWithRules() si hay producto o intención → BD + formateador
 *      handleWithAI()    si no hay información suficiente → mockOpenAI
 *   6. Actualizar contexto en Redis (TTL renovado)
 *   7. Emitir respuesta al room
 */

const { Server } = require('socket.io');
const MessageService    = require('../services/messageService');
const { getMockOpenAIResponse }    = require('../temp/mockOpenAI');
const { getKeywordResponse }       = require('../mockai/keywordResponses');
const { detectIntent }             = require('../services/intentService');
const { getBusinessInfoByIntent }  = require('../services/businessInfoService');
const { formatIntentResponse }     = require('../services/intentResponseFormatter');
const {
  normalize,
  extractProductEntity,
  queryProductByEntity,
  formatProductResponse,
} = require('../services/nlpEntityExtractor');
const { getContext, updateContext } = require('../services/sessionContextService');
const {
  resolveEffectiveContext,
  buildContextUpdate,
  extractFollowUpProduct,
} = require('../services/conversationalContext');
const { CLIENT_URL } = require('../config/env');

/** Negocio activo consultado cuando se detecta una intención o producto. */
const ACTIVE_BUSINESS_ID = 1;

let io;

// ─── Handlers de lógica (separados del event handler para legibilidad) ────────

/**
 * handleWithRules — Resuelve el mensaje usando lógica determinista + base de datos.
 *
 * LÓGICA DE DECISIÓN:
 *   1. Si hay producto (detectado en el mensaje actual O heredado del contexto):
 *      → Búsqueda dinámica con ILIKE en la tabla products
 *   2. Si hay intención sin producto:
 *      → Consulta de información del negocio por intención (horarios, precios…)
 *   3. Si ambos fallan (error DB) → delegar a AI
 *
 * @param {{ text: string, intent: string|null, product: string|null, businessId: number }} params
 * @returns {Promise<string>}
 */
async function handleWithRules({ text, intent, product, businessId }) {
  // Caso 1: producto específico → búsqueda dinámica en DB (ILIKE)
  if (product) {
    try {
      const rows = await queryProductByEntity(product, businessId);
      return formatProductResponse(product, rows);
    } catch (err) {
      console.error('[Rules] Error en búsqueda de producto:', err.message);
      // Si la DB falla, continúa al handler de intención
    }
  }

  // Caso 2: intención detectada sin producto → info del negocio por tema
  if (intent) {
    try {
      const data = await getBusinessInfoByIntent(intent, businessId);
      return formatIntentResponse(intent, data);
    } catch (err) {
      console.error('[Rules] Error al consultar intención:', err.message);
    }
  }

  // Caso 3: todo falló → deferir a AI sin contexto específico
  return getMockOpenAIResponse(text, null);
}

/**
 * handleWithAI — Fallback cuando no hay suficiente información para reglas.
 *
 * Primero intenta keywordResponses (saludos, frases simples conocidas).
 * Si no hay coincidencia, llama al mock de OpenAI pasando el contexto de sesión
 * para que la respuesta sea coherente con la conversación previa.
 *
 * @param {string} text
 * @param {{ lastProduct: string|null, lastIntent: string|null }} context
 * @returns {Promise<string>}
 */
async function handleWithAI(text, context) {
  const keyword = getKeywordResponse(text);
  if (keyword) return keyword;
  return getMockOpenAIResponse(text, context);
}

// ─── Inicialización de Socket.io ──────────────────────────────────────────────

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
        // ── 0. Validar sessionId ─────────────────────────────────────────────
        // El sessionId es un UUID generado en el frontend (crypto.randomUUID)
        // y guardado en sessionStorage. No autentica al usuario — sólo sirve
        // como clave para el contexto conversacional en Redis.
        if (!sessionId || typeof sessionId !== 'string') {
          socket.emit('error', { message: 'sessionId requerido' });
          return;
        }

        // ── 1. Guardar y emitir el mensaje del usuario ───────────────────────
        const message = MessageService.saveMessage({ roomId, sender, text });
        io.to(roomId).emit('receive_message', message);

        console.log('[Socket] Mensaje recibido:', { roomId, sender, text, sessionId: sessionId.slice(0, 8) + '…' });

        // ── 2. Recuperar contexto de Redis para esta sesión ──────────────────
        // context = { lastIntent, lastProduct, lastEntities, updatedAt }
        // Si la sesión expiró o es nueva, todos los campos son null.
        const context = await getContext(sessionId);
        console.log(`[Context] Sesión ${sessionId.slice(0, 8)}…`, context);

        // ── 3. Detectar entidad y intención del mensaje actual ───────────────
        // extractProductEntity: extrae nombre de producto (regex + NLP Compromise)
        // detectIntent:         detecta tema amplio por palabras clave (intents.js)
        // extractFollowUpProduct: refinamiento tipo "¿Y pizza mexicana?" con contexto
        const normalized     = normalize(text);
        let detectedProduct  = extractProductEntity(normalized);
        const detectedIntent = detectIntent(text);

        // Si los métodos principales no detectaron nada, verificar si es un
        // seguimiento de producto ("¿Y X?"). Solo activa si hay lastProduct en contexto.
        if (!detectedProduct && !detectedIntent) {
          detectedProduct = extractFollowUpProduct(normalized, context.lastProduct);
          if (detectedProduct) {
            console.log(`[Pipeline] Follow-up producto detectado: "${detectedProduct}"`);
          }
        }

        console.log(`[Pipeline] detectedProduct="${detectedProduct}" detectedIntent="${detectedIntent}"`);

        // ── 4. Resolver producto e intención efectivos con contexto ──────────
        // Estrategia (conversationalContext.resolveEffectiveContext):
        //   1. Nuevo producto → producto track, no hereda lastIntent
        //   2. Nueva intención → hereda lastProduct del contexto
        //   3. Nada detectado → fallback completo al contexto previo
        const { effectiveProduct, effectiveIntent } = resolveEffectiveContext(
          detectedProduct, detectedIntent, context
        );

        console.log(`[Pipeline] effectiveProduct="${effectiveProduct}" effectiveIntent="${effectiveIntent}"`);

        // ── 5. Decidir entre reglas o AI ─────────────────────────────────────
        // Con reglas: tenemos producto o intención → respuesta determinista de la BD
        // Con AI:     no hay información suficiente → fallback a keywordResponses / mockOpenAI
        let replyText;
        if (effectiveProduct || effectiveIntent) {
          replyText = await handleWithRules({
            text,
            intent:     effectiveIntent,
            product:    effectiveProduct,
            businessId: ACTIVE_BUSINESS_ID,
          });
        } else {
          replyText = await handleWithAI(text, context);
        }

        // ── 6. Actualizar contexto en Redis ──────────────────────────────────
        // buildContextUpdate decide qué persistir según lo detectado:
        //   - Producto → guarda producto + limpia intent (cambio de track)
        //   - Intent   → guarda solo intent (lastProduct se preserva por merge)
        //   - Nada     → {} → no llama updateContext (contexto sin cambios)
        const contextUpdate = buildContextUpdate(detectedProduct, detectedIntent);
        if (Object.keys(contextUpdate).length > 0) {
          await updateContext(sessionId, contextUpdate);
        }

        // ── 7. Emitir respuesta al room ──────────────────────────────────────
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

