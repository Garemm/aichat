'use strict';

/**
 * tests/unit/conversationalFlow.test.js
 *
 * Tests de integración para el flujo conversacional multi-turno con contexto Redis.
 *
 * COBERTURA:
 *   - resolveEffectiveContext(): prioridad producto > intent > contexto previo
 *   - buildContextUpdate(): objeto de persistencia correcto por turno
 *   - extractFollowUpProduct(): refinamiento de producto en mensajes "¿Y X?"
 *   - Escenario de 3 mensajes: horarios → pizza → pizza mexicana
 *   - Pregunta de seguimiento de precio con lastProduct heredado
 *   - TTL: contexto expirado se comporta como sesión nueva
 *
 * MOCKS:
 *   - ioredis: Map en memoria (simula TTL con store.delete)
 *   - database: jest.fn() (nlpEntityExtractor no hace queries en estas pruebas)
 */

// ─── Mock ioredis antes de cualquier require ─────────────────────────────────
const store = new Map();

const mockRedisInstance = {
  get:   jest.fn(async (key)            => store.get(key) ?? null),
  setex: jest.fn(async (key, _ttl, val) => { store.set(key, val); return 'OK'; }),
  on:    jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedisInstance));

// ─── Mock database (requerido por nlpEntityExtractor) ────────────────────────
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

// ─── Importar módulos bajo test ───────────────────────────────────────────────
const { detectIntent }              = require('../../src/services/intentService');
const { normalize, extractProductEntity } = require('../../src/services/nlpEntityExtractor');
const {
  resolveEffectiveContext,
  buildContextUpdate,
  extractFollowUpProduct,
  shouldUseContext,
} = require('../../src/services/conversationalContext');
const { getContext, updateContext } = require('../../src/services/sessionContextService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ID único para cada test — evita contaminación entre tests paralelos */
const sid = () => `flow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Simula el pipeline de procesamiento de un mensaje completo:
 *   getContext → detect → follow-up check → resolve → buildUpdate → updateContext
 *
 * Espeja la misma lógica que chatSocket.js send_message handler.
 * Retorna todo el estado intermedio para assertions detalladas.
 */
async function processTurn(sessionId, text) {
  const context        = await getContext(sessionId);
  const normalized     = normalize(text);
  let   detectedProduct  = extractProductEntity(normalized);
  const detectedIntent   = detectIntent(text);

  // Follow-up de refinamiento de producto (ej: "¿Y pizza mexicana?")
  if (!detectedProduct && !detectedIntent) {
    detectedProduct = extractFollowUpProduct(normalized, context.lastProduct);
  }

  const { effectiveProduct, effectiveIntent } = resolveEffectiveContext(
    detectedProduct, detectedIntent, context
  );

  const update = buildContextUpdate(detectedProduct, detectedIntent);
  if (Object.keys(update).length > 0) {
    await updateContext(sessionId, update);
  }

  return {
    context,          // contexto ANTES de este turno
    detectedProduct,
    detectedIntent,
    effectiveProduct,
    effectiveIntent,
    contextAfter: await getContext(sessionId),  // contexto DESPUÉS de este turno
  };
}

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

// ─── resolveEffectiveContext() ────────────────────────────────────────────────

describe('resolveEffectiveContext()', () => {
  const empty = { lastIntent: null, lastProduct: null };

  test('producto detectado → effectiveProduct=detected, effectiveIntent=null', () => {
    const res = resolveEffectiveContext('pizza mexicana', null, { lastIntent: 'horarios', lastProduct: 'pizza' });
    expect(res.effectiveProduct).toBe('pizza mexicana');
    expect(res.effectiveIntent).toBeNull();
  });

  test('producto detectado NO hereda lastIntent previo de horarios', () => {
    const res = resolveEffectiveContext('hamburguesa', null, { lastIntent: 'horarios', lastProduct: null });
    expect(res.effectiveIntent).toBeNull();
    expect(res.effectiveProduct).toBe('hamburguesa');
  });

  test('intent detectado sin producto → hereda lastProduct del contexto', () => {
    const res = resolveEffectiveContext(null, 'precios', { lastIntent: null, lastProduct: 'hamburguesa doble' });
    expect(res.effectiveProduct).toBe('hamburguesa doble');
    expect(res.effectiveIntent).toBe('precios');
  });

  test('intent detectado con contexto vacío → effectiveProduct=null', () => {
    const res = resolveEffectiveContext(null, 'horarios', empty);
    expect(res.effectiveProduct).toBeNull();
    expect(res.effectiveIntent).toBe('horarios');
  });

  test('nada detectado → heredar contexto completo', () => {
    const res = resolveEffectiveContext(null, null, { lastIntent: 'horarios', lastProduct: 'pizza' });
    expect(res.effectiveProduct).toBe('pizza');
    expect(res.effectiveIntent).toBe('horarios');
  });

  test('nada detectado y contexto vacío → null/null', () => {
    const res = resolveEffectiveContext(null, null, empty);
    expect(res.effectiveProduct).toBeNull();
    expect(res.effectiveIntent).toBeNull();
  });

  test('intent standalone (horarios) con lastProduct previo → NO hereda producto', () => {
    // Bug fix: "¿a qué hora abren?" no debe arrastrar "pizza" al pipeline
    const res = resolveEffectiveContext(null, 'horarios', { lastIntent: null, lastProduct: 'pizza' });
    expect(res.effectiveProduct).toBeNull();     // NO hereda pizza
    expect(res.effectiveIntent).toBe('horarios');
  });

  test('intent standalone (ubicacion) con lastProduct previo → effectiveProduct=null', () => {
    const res = resolveEffectiveContext(null, 'ubicacion', { lastIntent: 'precios', lastProduct: 'hamburguesa' });
    expect(res.effectiveProduct).toBeNull();
    expect(res.effectiveIntent).toBe('ubicacion');
  });
});

// ─── buildContextUpdate() ─────────────────────────────────────────────────────

describe('buildContextUpdate()', () => {
  test('producto detectado → { lastProduct, lastIntent: null }', () => {
    const upd = buildContextUpdate('pizza mexicana', null);
    expect(upd.lastProduct).toBe('pizza mexicana');
    expect(upd.lastIntent).toBeNull();
  });

  test('producto + intent → produto tiene prioridad, result tiene lastIntent: null', () => {
    const upd = buildContextUpdate('hamburguesa', 'precios');
    expect(upd.lastProduct).toBe('hamburguesa');
    expect(upd.lastIntent).toBeNull();
  });

  test('intent no-standalone (precios) → { lastIntent } sin key lastProduct (preserva via merge)', () => {
    const upd = buildContextUpdate(null, 'precios');
    expect(upd.lastIntent).toBe('precios');
    expect(upd).not.toHaveProperty('lastProduct');
  });

  test('intent standalone (horarios) → { lastIntent, lastProduct: null } — reset de tema', () => {
    const upd = buildContextUpdate(null, 'horarios');
    expect(upd.lastIntent).toBe('horarios');
    expect(upd.lastProduct).toBeNull();    // explícitamente limpiado
  });

  test('intent standalone (ubicacion) → { lastIntent, lastProduct: null }', () => {
    const upd = buildContextUpdate(null, 'ubicacion');
    expect(upd.lastIntent).toBe('ubicacion');
    expect(upd.lastProduct).toBeNull();
  });

  test('nada detectado → objeto vacío', () => {
    expect(buildContextUpdate(null, null)).toEqual({});
  });
});
// ─── shouldUseContext() ───────────────────────────────────────────────────────────────────

describe('shouldUseContext()', () => {
  test('true para intent no-standalone "precios" → usar contexto', () => {
    expect(shouldUseContext('precios')).toBe(true);
  });

  test('true para intent no-standalone "productos" → usar contexto', () => {
    expect(shouldUseContext('productos')).toBe(true);
  });

  test('true para null (sin intent detectado) → fallback al contexto', () => {
    expect(shouldUseContext(null)).toBe(true);
  });

  test('false para "horarios" → standalone, ignorar contexto de producto', () => {
    expect(shouldUseContext('horarios')).toBe(false);
  });

  test('false para "ubicacion" → standalone, ignorar contexto de producto', () => {
    expect(shouldUseContext('ubicacion')).toBe(false);
  });
});
// ─── extractFollowUpProduct() ─────────────────────────────────────────────────

describe('extractFollowUpProduct()', () => {
  test('extrae "pizza mexicana" de "y pizza mexicana?" con lastProduct set', () => {
    expect(extractFollowUpProduct('y pizza mexicana?', 'pizza')).toBe('pizza mexicana');
  });

  test('extrae producto de "y hamburguesa doble" con lastProduct set', () => {
    expect(extractFollowUpProduct('y hamburguesa doble', 'hamburguesa')).toBe('hamburguesa doble');
  });

  test('devuelve null sin lastProduct (sesión vacía o expirada)', () => {
    expect(extractFollowUpProduct('y pizza mexicana?', null)).toBeNull();
  });

  test('devuelve null para "y cuanto cuesta" — palabra interrogativa', () => {
    expect(extractFollowUpProduct('y cuanto cuesta', 'hamburguesa')).toBeNull();
  });

  test('devuelve null para "y cuantos tiene" — palabra interrogativa', () => {
    expect(extractFollowUpProduct('y cuantos tiene', 'pizza')).toBeNull();
  });

  test('devuelve null para mensaje que no empieza con "y "', () => {
    expect(extractFollowUpProduct('tienen pizza mexicana', 'pizza')).toBeNull();
  });

  test('devuelve null para "y" solo (sin entidad)', () => {
    expect(extractFollowUpProduct('y', 'pizza')).toBeNull();
  });

  test('devuelve null para "y " con y como única palabra', () => {
    expect(extractFollowUpProduct('y ', 'pizza')).toBeNull();
  });
});

// ─── Escenario de 3 mensajes ──────────────────────────────────────────────────

describe('Escenario conversacional: 3 turnos', () => {
  test('Turno 1: "¿A qué hora abren?" → intent=horarios, sin producto', async () => {
    const id = sid();
    const { detectedProduct, detectedIntent, effectiveProduct, effectiveIntent, contextAfter } =
      await processTurn(id, '¿A qué hora abren?');

    expect(detectedIntent).toBe('horarios');
    expect(detectedProduct).toBeNull();
    expect(effectiveIntent).toBe('horarios');
    expect(effectiveProduct).toBeNull();
    expect(contextAfter.lastIntent).toBe('horarios');
    expect(contextAfter.lastProduct).toBeNull();
  });

  test('Turno 2: "¿Tienen pizza?" → producto=pizza, NO hereda intent horarios', async () => {
    const id = sid();
    // Contexto del turno 1
    await updateContext(id, { lastIntent: 'horarios', lastProduct: null });

    const { detectedProduct, effectiveProduct, effectiveIntent, contextAfter } =
      await processTurn(id, '¿Tienen pizza?');

    expect(detectedProduct).toBe('pizza');
    expect(effectiveProduct).toBe('pizza');
    expect(effectiveIntent).toBeNull();             // NO hereda horarios
    expect(contextAfter.lastProduct).toBe('pizza');
    expect(contextAfter.lastIntent).toBeNull();     // limpiado al detectar producto
  });

  test('Turno 3: "¿Y pizza mexicana?" → nuevo producto, NO regresa a horarios', async () => {
    const id = sid();
    // Contexto del turno 2
    await updateContext(id, { lastProduct: 'pizza', lastIntent: null });

    const { detectedProduct, effectiveProduct, effectiveIntent, contextAfter } =
      await processTurn(id, '¿Y pizza mexicana?');

    expect(detectedProduct).toBe('pizza mexicana');
    expect(effectiveProduct).toBe('pizza mexicana');
    expect(effectiveIntent).toBeNull();
    expect(effectiveIntent).not.toBe('horarios');   // nunca regresa a horarios
    expect(contextAfter.lastProduct).toBe('pizza mexicana');
  });

  test('3 turnos en secuencia — contexto evoluciona correctamente', async () => {
    const id = sid();

    // Turno 1
    const t1 = await processTurn(id, '¿A qué hora abren?');
    expect(t1.effectiveIntent).toBe('horarios');
    expect(t1.effectiveProduct).toBeNull();

    // Turno 2
    const t2 = await processTurn(id, '¿Tienen pizza?');
    expect(t2.effectiveProduct).toBe('pizza');
    expect(t2.effectiveIntent).toBeNull();

    // Turno 3: refinamiento — debe usar "pizza mexicana", NO horarios del turno 1
    const t3 = await processTurn(id, '¿Y pizza mexicana?');
    expect(t3.effectiveProduct).toBe('pizza mexicana');
    expect(t3.effectiveIntent).toBeNull();
    expect(t3.contextAfter.lastProduct).toBe('pizza mexicana');
    expect(t3.contextAfter.lastIntent).toBeNull();
  });
});

// ─── Seguimiento de precio con lastProduct heredado ───────────────────────────

describe('Preguntas de seguimiento con intención y lastProduct', () => {
  test('"¿Y cuánto cuesta?" con lastProduct=hamburguesa → hereda producto para consulta de precio', async () => {
    const id = sid();
    await updateContext(id, { lastProduct: 'hamburguesa doble', lastIntent: null });

    const { detectedProduct, detectedIntent, effectiveProduct, effectiveIntent } =
      await processTurn(id, '¿Y cuánto cuesta?');

    // "cuánto cuesta" → intent precios, no un producto
    expect(detectedIntent).toBe('precios');
    expect(detectedProduct).toBeNull();           // no es una entidad de producto
    // Efectivo: hereda lastProduct del contexto
    expect(effectiveProduct).toBe('hamburguesa doble');
    expect(effectiveIntent).toBe('precios');
  });

  test('"¿Y cuánto vale?" sin lastProduct → effectiveProduct=null', async () => {
    const id = sid();
    // Sesión sin producto previo
    const { effectiveProduct, effectiveIntent } =
      await processTurn(id, '¿Y cuánto vale?');

    expect(effectiveIntent).toBe('precios');
    expect(effectiveProduct).toBeNull();
  });

  test('mensaje completamente fuera de contexto → fallback a contexto previo', async () => {
    const id = sid();
    await updateContext(id, { lastIntent: 'horarios', lastProduct: 'pozole' });

    const { detectedProduct, detectedIntent, effectiveProduct, effectiveIntent } =
      await processTurn(id, 'gracias');  // no detect, no intent

    expect(detectedProduct).toBeNull();
    expect(detectedIntent).toBeNull();
    // Hereda todo el contexto anterior
    expect(effectiveProduct).toBe('pozole');
    expect(effectiveIntent).toBe('horarios');
  });
});

// ─── Simulación de TTL expirado ───────────────────────────────────────────────

describe('TTL: expiración del contexto de sesión', () => {
  test('tras borrar la key (TTL expirado), getContext retorna contexto vacío', async () => {
    const id = sid();
    await updateContext(id, { lastIntent: 'horarios', lastProduct: 'pizza' });

    // Simular que Redis eliminó la key al expirar el TTL
    store.delete(`session:${id}`);

    const ctx = await getContext(id);
    expect(ctx.lastIntent).toBeNull();
    expect(ctx.lastProduct).toBeNull();
    expect(ctx.updatedAt).toBeNull();
    expect(ctx).toEqual({ lastIntent: null, lastProduct: null, lastEntities: {}, updatedAt: null });
  });

  test('tras TTL expirado, extractFollowUpProduct NO hereda datos de conversación anterior', async () => {
    const id = sid();
    await updateContext(id, { lastProduct: 'hamburguesa', lastIntent: 'precios' });

    // Simular expiración
    store.delete(`session:${id}`);

    const ctx = await getContext(id); // contexto expirado = vacío
    // Sin lastProduct, el follow-up no activa
    const followUp = extractFollowUpProduct('y hamburguesa con queso', ctx.lastProduct);
    expect(followUp).toBeNull();
  });

  test('tras TTL expirado, nuevo mensaje se procesa como primera interacción', async () => {
    const id = sid();
    await updateContext(id, { lastIntent: 'horarios', lastProduct: 'pizza' });

    // Expirar
    store.delete(`session:${id}`);

    // Procesar un mensaje de seguimiento — sin contexto no debe heredar nada
    const { effectiveProduct, effectiveIntent, contextAfter } =
      await processTurn(id, '¿Y pizza mexicana?');

    // Sin lastProduct en contexto expirado, follow-up no activa
    // → nada detectado → effective null/null
    expect(effectiveProduct).toBeNull();
    expect(effectiveIntent).toBeNull();
    // Nuevo contexto guardado debe reflejar solo lo del nuevo turno (nada nuevo)
    expect(contextAfter.lastIntent).toBeNull();
    expect(contextAfter.lastProduct).toBeNull();
  });

  test('después de TTL, nueva detección de intent funciona normalmente', async () => {
    const id = sid();
    await updateContext(id, { lastIntent: 'horarios', lastProduct: 'pizza' });

    // Expirar TTL
    store.delete(`session:${id}`);

    // Mensaje con intent claro → se detecta y guarda como primera interacción
    const { detectedIntent, effectiveIntent, contextAfter } =
      await processTurn(id, '¿A qué hora abren?');

    expect(detectedIntent).toBe('horarios');
    expect(effectiveIntent).toBe('horarios');
    expect(contextAfter.lastIntent).toBe('horarios');
    // El producto de la sesión anterior NO se hereda
    expect(contextAfter.lastProduct).toBeNull();
  });
});

// ─── Bug fix: intención clara prevalece sobre contexto de producto previo ────────────────

describe('Bug fix: intención clara anula contexto de producto', () => {
  test('Caso 1: agua → pizza → horarios — NO devuelve pizza para horarios', async () => {
    const id = sid();

    // Turno 1: producto detectado normalmente
    const t1 = await processTurn(id, '¿Tienen agua?');
    expect(t1.detectedProduct).toBe('agua');
    expect(t1.contextAfter.lastProduct).toBe('agua');

    // Turno 2: cambio de producto vía follow-up
    const t2 = await processTurn(id, '¿Y pizza?');
    expect(t2.effectiveProduct).toBe('pizza');
    expect(t2.contextAfter.lastProduct).toBe('pizza');

    // Turno 3: intención standalone — debe responder de forma independiente
    const t3 = await processTurn(id, '¿A qué hora abren?');
    expect(t3.detectedIntent).toBe('horarios');
    expect(t3.effectiveProduct).toBeNull();           // NO pizza
    expect(t3.effectiveIntent).toBe('horarios');
    expect(t3.contextAfter.lastProduct).toBeNull();   // limpiado por standalone intent
    expect(t3.contextAfter.lastIntent).toBe('horarios');
  });

  test('Caso 2: pizza → ¿cuánto cuesta? — hereda pizza (precios es contextual)', async () => {
    const id = sid();

    const t1 = await processTurn(id, '¿Tienen pizza?');
    expect(t1.effectiveProduct).toBe('pizza');

    const t2 = await processTurn(id, '¿Cuánto cuesta?');
    expect(t2.detectedProduct).toBeNull();
    expect(t2.detectedIntent).toBe('precios');
    expect(t2.effectiveProduct).toBe('pizza');        // heredado del contexto
    expect(t2.effectiveIntent).toBe('precios');
  });

  test('Caso 3: horario → ¿y domingos? — mantiene contexto de horarios', async () => {
    const id = sid();

    const t1 = await processTurn(id, '¿A qué hora abren?');
    expect(t1.effectiveIntent).toBe('horarios');
    expect(t1.contextAfter.lastIntent).toBe('horarios');
    expect(t1.contextAfter.lastProduct).toBeNull();   // standalone limpió lastProduct

    // Mensaje ambiguo: no se detecta intent ni producto → hereda contexto
    const t2 = await processTurn(id, '¿y domingos?');
    expect(t2.detectedIntent).toBeNull();
    expect(t2.detectedProduct).toBeNull();
    expect(t2.effectiveIntent).toBe('horarios');      // heredado por fallback
    expect(t2.effectiveProduct).toBeNull();
  });

  test('Caso 4: TTL expirado — nueva sesión sin contaminación de contexto anterior', async () => {
    const id = sid();
    await updateContext(id, { lastProduct: 'pizza', lastIntent: 'precios' });

    store.delete(`session:${id}`);  // simular expiración del TTL

    const t = await processTurn(id, '¿A qué hora abren?');
    expect(t.context.lastProduct).toBeNull();     // contexto vacío al inicio del turno
    expect(t.context.lastIntent).toBeNull();
    expect(t.effectiveIntent).toBe('horarios');
    expect(t.effectiveProduct).toBeNull();        // NO hereda pizza de sesión expirada
    expect(t.contextAfter.lastProduct).toBeNull();
    expect(t.contextAfter.lastIntent).toBe('horarios');
  });
});
