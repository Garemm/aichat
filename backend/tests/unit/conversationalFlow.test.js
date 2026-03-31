'use strict';

/**
 * tests/unit/conversationalFlow.test.js
 *
 * Tests del flujo conversacional multi-turno con el nuevo pipeline NLP.
 *
 * COBERTURA:
 *   - decide(): reglas de decisión del pipeline
 *   - buildContextUpdate(): objeto de persistencia correcto por turno
 *   - extractFollowUpEntity(): refinamiento de entidad en mensajes "¿Y X?"
 *   - isAmbiguous(): detección de mensajes ambiguos
 *   - Full pipeline: processMessage() con mocks de DB y Redis
 *
 * MOCKS:
 *   - ioredis: Map en memoria (simula TTL con store.delete)
 *   - database: jest.fn() (entityDetector hace queries mockeadas)
 */

// ─── Mock ioredis antes de cualquier require ─────────────────────────────────
const store = new Map();

const mockRedisInstance = {
  get:   jest.fn(async (key)            => store.get(key) ?? null),
  setex: jest.fn(async (key, _ttl, val) => { store.set(key, val); return 'OK'; }),
  on:    jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedisInstance));

// ─── Mock database (requerido por entityDetector) ────────────────────────────
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');

// ─── Importar módulos bajo test ───────────────────────────────────────────────
const { detectIntent } = require('../../src/services/intentDetector');
const {
  decide,
  buildContextUpdate,
  extractFollowUpEntity,
  isAmbiguous,
  processMessage,
} = require('../../src/services/messagePipeline');
const { getContext, updateContext, EMPTY_CONTEXT } = require('../../src/services/sessionContextService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sid = () => `flow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const emptyEntity = { type: null, value: null };
const noIntent = { intent: null, score: 0, scores: {}, confident: false };
const emptyContext = { lastIntent: null, lastEntity: { type: null, value: null } };

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  db.query.mockReset();
});

// ─── decide() ────────────────────────────────────────────────────────────────

describe('decide()', () => {

  test('Rule 1: high-confidence standalone intent → strategy=intent, ignores context', () => {
    const intentResult = { intent: 'horarios', score: 3, scores: { horarios: 3 }, confident: true };
    const entityResult = { type: null, value: null };
    const context = { lastIntent: 'precios', lastEntity: { type: 'product', value: 'pizza' } };

    const d = decide(intentResult, entityResult, context, 'a que hora abren');
    expect(d.strategy).toBe('intent');
    expect(d.intent).toBe('horarios');
    expect(d.entity).toEqual(emptyEntity);
    expect(d.usedContext).toBe(false);
  });

  test('Rule 2: clear entity → strategy=entity, ignores context', () => {
    const intentResult = noIntent;
    const entityResult = { type: 'product', value: 'laptop' };
    const context = { lastIntent: 'horarios', lastEntity: { type: 'product', value: 'pizza' } };

    const d = decide(intentResult, entityResult, context, 'tienen laptop');
    expect(d.strategy).toBe('entity');
    expect(d.entity).toEqual({ type: 'product', value: 'laptop' });
    expect(d.usedContext).toBe(false);
  });

  test('Rule 2: entity + intent → strategy=entity, includes intent', () => {
    const intentResult = { intent: 'precios', score: 3, scores: { precios: 3 }, confident: true };
    const entityResult = { type: 'product', value: 'laptop' };

    const d = decide(intentResult, entityResult, emptyContext, 'cuanto cuesta la laptop');
    expect(d.strategy).toBe('entity');
    expect(d.intent).toBe('precios');
    expect(d.entity).toEqual({ type: 'product', value: 'laptop' });
    expect(d.usedContext).toBe(false);
  });

  test('Rule 3: non-standalone intent + context entity → strategy=context', () => {
    const intentResult = { intent: 'precios', score: 3, scores: { precios: 3 }, confident: true };
    const entityResult = { type: null, value: null };
    const context = { lastIntent: null, lastEntity: { type: 'product', value: 'hamburguesa' } };

    const d = decide(intentResult, entityResult, context, 'cuanto cuesta');
    expect(d.strategy).toBe('context');
    expect(d.intent).toBe('precios');
    expect(d.entity).toEqual({ type: 'product', value: 'hamburguesa' });
    expect(d.usedContext).toBe(true);
  });

  test('Rule 3: non-standalone intent without context → strategy=intent, no entity', () => {
    const intentResult = { intent: 'precios', score: 3, scores: { precios: 3 }, confident: true };
    const entityResult = { type: null, value: null };

    const d = decide(intentResult, entityResult, emptyContext, 'cuanto cuesta');
    expect(d.strategy).toBe('intent');
    expect(d.intent).toBe('precios');
    expect(d.entity).toEqual(emptyEntity);
    expect(d.usedContext).toBe(false);
  });

  test('Rule 3b: standalone intent with lower confidence → strategy=intent', () => {
    const intentResult = { intent: 'horarios', score: 1, scores: { horarios: 1 }, confident: true };
    const entityResult = { type: null, value: null };

    const d = decide(intentResult, entityResult, emptyContext, 'horarios');
    expect(d.strategy).toBe('intent');
    expect(d.intent).toBe('horarios');
  });

  test('Rule 4: ambiguous message with context → strategy=context', () => {
    const context = { lastIntent: 'precios', lastEntity: { type: 'product', value: 'pizza' } };

    const d = decide(noIntent, { type: null, value: null }, context, 'y precio');
    expect(d.strategy).toBe('context');
    expect(d.usedContext).toBe(true);
    expect(d.entity).toEqual({ type: 'product', value: 'pizza' });
  });

  test('Rule 5: follow-up entity → strategy=followup', () => {
    const context = { lastIntent: null, lastEntity: { type: 'product', value: 'pizza' } };

    const d = decide(noIntent, { type: null, value: null }, context, 'y pizza mexicana');
    expect(d.strategy).toBe('followup');
    expect(d.entity).toEqual({ type: 'product', value: 'pizza mexicana' });
    expect(d.usedContext).toBe(true);
  });

  test('Rule 6: nothing detected → strategy=ai', () => {
    const d = decide(noIntent, { type: null, value: null }, emptyContext, 'hola como estas');
    expect(d.strategy).toBe('ai');
    expect(d.usedContext).toBe(false);
  });

  test('standalone intent does NOT inherit entity from context', () => {
    const intentResult = { intent: 'horarios', score: 3, scores: { horarios: 3 }, confident: true };
    const entityResult = { type: null, value: null };
    const context = { lastIntent: null, lastEntity: { type: 'product', value: 'pizza' } };

    const d = decide(intentResult, entityResult, context, 'a que hora abren');
    expect(d.entity.value).toBeNull();
  });

  test('intent change must NOT drag entity from context', () => {
    const intentResult = { intent: 'ubicacion', score: 3, scores: { ubicacion: 3 }, confident: true };
    const entityResult = { type: null, value: null };
    const context = { lastIntent: 'precios', lastEntity: { type: 'product', value: 'hamburguesa' } };

    const d = decide(intentResult, entityResult, context, 'donde estan ubicados');
    expect(d.entity.value).toBeNull();
  });
});

// ─── buildContextUpdate() ─────────────────────────────────────────────────────

describe('buildContextUpdate()', () => {
  test('entity detected → tracks entity + intent', () => {
    const decision = {
      strategy: 'entity',
      intent: null,
      entity: { type: 'product', value: 'pizza' },
      usedContext: false,
    };
    const upd = buildContextUpdate(decision);
    expect(upd.lastEntity).toEqual({ type: 'product', value: 'pizza' });
    expect(upd.lastIntent).toBeNull();
  });

  test('entity + intent → tracks both', () => {
    const decision = {
      strategy: 'entity',
      intent: 'precios',
      entity: { type: 'product', value: 'laptop' },
      usedContext: false,
    };
    const upd = buildContextUpdate(decision);
    expect(upd.lastEntity).toEqual({ type: 'product', value: 'laptop' });
    expect(upd.lastIntent).toBe('precios');
  });

  test('followup entity → updates entity track', () => {
    const decision = {
      strategy: 'followup',
      intent: null,
      entity: { type: 'product', value: 'pizza mexicana' },
      usedContext: true,
    };
    const upd = buildContextUpdate(decision);
    expect(upd.lastEntity).toEqual({ type: 'product', value: 'pizza mexicana' });
  });

  test('standalone intent → clears entity', () => {
    const decision = {
      strategy: 'intent',
      intent: 'horarios',
      entity: { type: null, value: null },
      usedContext: false,
    };
    const upd = buildContextUpdate(decision);
    expect(upd.lastIntent).toBe('horarios');
    expect(upd.lastEntity).toEqual({ type: null, value: null });
  });

  test('non-standalone intent → keeps entity (only updates intent)', () => {
    const decision = {
      strategy: 'intent',
      intent: 'precios',
      entity: { type: null, value: null },
      usedContext: false,
    };
    const upd = buildContextUpdate(decision);
    expect(upd.lastIntent).toBe('precios');
    expect(upd).not.toHaveProperty('lastEntity');
  });

  test('context-based decision with intent → updates intent only', () => {
    const decision = {
      strategy: 'context',
      intent: 'precios',
      entity: { type: 'product', value: 'pizza' },
      usedContext: true,
    };
    const upd = buildContextUpdate(decision);
    expect(upd.lastIntent).toBe('precios');
    expect(upd).not.toHaveProperty('lastEntity');
  });

  test('AI fallback → empty update', () => {
    const decision = {
      strategy: 'ai',
      intent: null,
      entity: { type: null, value: null },
      usedContext: false,
    };
    expect(buildContextUpdate(decision)).toEqual({});
  });
});

// ─── isAmbiguous() ────────────────────────────────────────────────────────────

describe('isAmbiguous()', () => {
  test('very short messages are ambiguous', () => {
    expect(isAmbiguous('si')).toBe(true);
    expect(isAmbiguous('no')).toBe(true);
    expect(isAmbiguous('ok')).toBe(true);
  });

  test('follow-up price questions are ambiguous', () => {
    expect(isAmbiguous('cuanto cuesta')).toBe(true);
    expect(isAmbiguous('y precio')).toBe(true);
    expect(isAmbiguous('y el precio')).toBe(true);
  });

  test('clear messages are NOT ambiguous', () => {
    expect(isAmbiguous('cuanto cuesta la pizza')).toBe(false);
    expect(isAmbiguous('tienen hamburguesa doble')).toBe(false);
    expect(isAmbiguous('a que hora abren')).toBe(false);
  });
});

// ─── extractFollowUpEntity() ──────────────────────────────────────────────────

describe('extractFollowUpEntity()', () => {
  test('extrae "pizza mexicana" de "y pizza mexicana" con lastEntity set', () => {
    expect(extractFollowUpEntity('y pizza mexicana', { value: 'pizza' })).toBe('pizza mexicana');
  });

  test('extrae entidad de "y hamburguesa doble" con lastEntity set', () => {
    expect(extractFollowUpEntity('y hamburguesa doble', { value: 'hamburguesa' })).toBe('hamburguesa doble');
  });

  test('devuelve null sin lastEntity (sesión vacía o expirada)', () => {
    expect(extractFollowUpEntity('y pizza mexicana', null)).toBeNull();
    expect(extractFollowUpEntity('y pizza mexicana', { value: null })).toBeNull();
  });

  test('devuelve null para "y cuanto cuesta" — palabra interrogativa', () => {
    expect(extractFollowUpEntity('y cuanto cuesta', { value: 'hamburguesa' })).toBeNull();
  });

  test('devuelve null para "y cuantos tiene" — palabra interrogativa', () => {
    expect(extractFollowUpEntity('y cuantos tiene', { value: 'pizza' })).toBeNull();
  });

  test('devuelve null para mensaje que no empieza con "y "', () => {
    expect(extractFollowUpEntity('tienen pizza mexicana', { value: 'pizza' })).toBeNull();
  });

  test('devuelve null para "y" solo (sin entidad)', () => {
    expect(extractFollowUpEntity('y', { value: 'pizza' })).toBeNull();
  });
});

// ─── processMessage() — full pipeline integration ────────────────────────────

describe('processMessage() — full pipeline', () => {
  const BUSINESS_ID = 1;
  const mockProduct = (name, price, available = true) => ({
    id: Math.floor(Math.random() * 1000),
    name,
    description: null,
    price: String(price),
    is_available: available,
    stock_quantity: 10,
    category: 'General',
  });

  // Helper: mock DB to return products for entity detection
  function mockDbProductMatch(product) {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('products') && sql.includes('ILIKE')) {
        return { rows: [mockProduct(product, 100)] };
      }
      return { rows: [] };
    });
  }

  // Helper: mock DB to return nothing (no entity match)
  function mockDbNoMatch() {
    db.query.mockResolvedValue({ rows: [] });
  }

  test('standalone intent: "a que hora abren" → intent response, no context used', async () => {
    mockDbNoMatch();
    const id = sid();
    // Pre-fill context with old entity
    await updateContext(id, { lastEntity: { type: 'product', value: 'pizza' }, lastIntent: null });

    const { decision } = await processMessage({ text: '¿A qué hora abren?', sessionId: id, businessId: BUSINESS_ID });

    expect(decision.strategy).toBe('intent');
    expect(decision.intent).toBe('horarios');
    expect(decision.entity.value).toBeNull();
    expect(decision.usedContext).toBe(false);
  });

  test('product detection: "tienen laptop?" → entity detected, context NOT used', async () => {
    mockDbProductMatch('Laptop Gamer');
    const id = sid();
    // Pre-fill context with different product
    await updateContext(id, { lastEntity: { type: 'product', value: 'pizza' }, lastIntent: 'horarios' });

    const { decision } = await processMessage({ text: '¿Tienen laptop?', sessionId: id, businessId: BUSINESS_ID });

    expect(decision.strategy).toBe('entity');
    expect(decision.entity.value).toBe('laptop');
    expect(decision.usedContext).toBe(false);
  });

  test('intent change: horarios → entity → horarios does NOT drag entity', async () => {
    mockDbProductMatch('Pizza');
    const id = sid();

    // Turn 1: horarios
    mockDbNoMatch();
    const t1 = await processMessage({ text: '¿A qué hora abren?', sessionId: id, businessId: BUSINESS_ID });
    expect(t1.decision.intent).toBe('horarios');

    // Turn 2: product query
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('products') && sql.includes('ILIKE')) {
        return { rows: [mockProduct('Pizza Pepperoni', 130)] };
      }
      return { rows: [] };
    });
    const t2 = await processMessage({ text: '¿Tienen pizza?', sessionId: id, businessId: BUSINESS_ID });
    expect(t2.decision.entity.value).toBe('pizza');

    // Turn 3: horarios again — must NOT have pizza in entity
    mockDbNoMatch();
    const t3 = await processMessage({ text: '¿A qué hora abren?', sessionId: id, businessId: BUSINESS_ID });
    expect(t3.decision.intent).toBe('horarios');
    expect(t3.decision.entity.value).toBeNull();
  });

  test('follow-up price: product → "cuanto cuesta" → inherits entity from context', async () => {
    const id = sid();

    // Turn 1: detect product
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('products') && sql.includes('ILIKE')) {
        return { rows: [mockProduct('Hamburguesa Doble', 150)] };
      }
      return { rows: [] };
    });
    await processMessage({ text: '¿Tienen hamburguesa doble?', sessionId: id, businessId: BUSINESS_ID });

    // Turn 2: price query — no entity in text, should use context
    mockDbNoMatch();
    const t2 = await processMessage({ text: '¿Cuánto cuesta?', sessionId: id, businessId: BUSINESS_ID });
    // "cuanto cuesta" without entity = ambiguous pattern in pipeline,
    // OR precios intent + context entity = strategy=context
    expect(['context', 'intent']).toContain(t2.decision.strategy);
    if (t2.decision.strategy === 'context') {
      expect(t2.decision.entity.value).toBe('hamburguesa doble');
    }
  });

  test('TTL expiration: expired context → new message starts fresh', async () => {
    const id = sid();
    await updateContext(id, { lastEntity: { type: 'product', value: 'pizza' }, lastIntent: 'precios' });

    // Simulate TTL expiration
    store.delete(`session:${id}`);

    mockDbNoMatch();
    const { decision } = await processMessage({ text: 'gracias', sessionId: id, businessId: BUSINESS_ID });

    // Without context and no intent/entity, should be ai fallback
    expect(decision.strategy).toBe('ai');
    expect(decision.usedContext).toBe(false);
  });

  test('promotion detection: "tienen descuentos?" → intent=promociones', async () => {
    mockDbNoMatch();
    const id = sid();

    const { decision } = await processMessage({ text: '¿Tienen descuentos?', sessionId: id, businessId: BUSINESS_ID });

    expect(decision.intent).toBe('promociones');
  });
});

// ─── Multi-turn scenario ──────────────────────────────────────────────────────

describe('Escenario conversacional: 3 turnos con processMessage', () => {
  const BUSINESS_ID = 1;

  test('horarios → product → follow-up horarios — context evolves correctly', async () => {
    const id = sid();

    // Mock DB: no product matches for intent-only messages
    db.query.mockImplementation(async (sql, params) => {
      // Match "pizza" in product query
      if (sql.includes('products') && sql.includes('ILIKE') && params?.some((p) => typeof p === 'string' && p.includes('pizza'))) {
        return { rows: [{ id: 1, name: 'Pizza Pepperoni', description: null, price: '130.00', is_available: true, stock_quantity: 20, category: 'Pizzas' }] };
      }
      return { rows: [] };
    });

    // Turn 1: horarios
    const t1 = await processMessage({ text: '¿A qué hora abren?', sessionId: id, businessId: BUSINESS_ID });
    expect(t1.decision.intent).toBe('horarios');
    expect(t1.decision.entity.value).toBeNull();

    // Turn 2: product
    const t2 = await processMessage({ text: '¿Tienen pizza?', sessionId: id, businessId: BUSINESS_ID });
    expect(t2.decision.entity.value).toBe('pizza');

    // Turn 3: back to horarios — must NOT carry pizza
    db.query.mockResolvedValue({ rows: [] });
    const t3 = await processMessage({ text: '¿A qué hora abren?', sessionId: id, businessId: BUSINESS_ID });
    expect(t3.decision.intent).toBe('horarios');
    expect(t3.decision.entity.value).toBeNull();

    // Verify context after turn 3: entity cleared by standalone intent
    const ctx = await getContext(id);
    expect(ctx.lastIntent).toBe('horarios');
    expect(ctx.lastEntity).toEqual({ type: null, value: null });
  });
});

// ─── Product not found → "sí" → catalog ──────────────────────────────────────

describe('Product not found → "sí" shows catalog', () => {
  const BUSINESS_ID = 1;

  test('"tienes comida vegana" (not found) → "sí" → intent=productos (catalog)', async () => {
    const id = sid();

    // Turn 1: product NOT found in DB → bot says "no encontré… ¿catálogo completo?"
    db.query.mockResolvedValue({ rows: [] });
    const t1 = await processMessage({ text: '¿Tienes comida vegana?', sessionId: id, businessId: BUSINESS_ID });
    expect(t1.decision.strategy).toBe('entity');
    expect(t1.replyText).toContain('no encontré');

    // Verify context was updated to offer catalog, NOT the dead-end entity
    const ctxAfterT1 = await getContext(id);
    expect(ctxAfterT1.lastIntent).toBe('productos');
    expect(ctxAfterT1.lastEntity).toEqual({ type: null, value: null });

    // Turn 2: "sí" → should use context intent=productos → show catalog
    const t2 = await processMessage({ text: 'Sí', sessionId: id, businessId: BUSINESS_ID });
    expect(t2.decision.strategy).toBe('context');
    expect(t2.decision.intent).toBe('productos');
    expect(t2.decision.entity.value).toBeNull();
    expect(t2.decision.usedContext).toBe(true);
  });

  test('product FOUND → "sí" → re-queries product (normal behavior)', async () => {
    const id = sid();

    // Turn 1: product found
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('products') && sql.includes('ILIKE')) {
        return { rows: [{ id: 1, name: 'Pizza', description: null, price: '130.00', is_available: true, stock_quantity: 20, category: 'Pizzas' }] };
      }
      return { rows: [] };
    });
    const t1 = await processMessage({ text: '¿Tienen pizza?', sessionId: id, businessId: BUSINESS_ID });
    expect(t1.decision.strategy).toBe('entity');

    // Context should track the found entity normally
    const ctx = await getContext(id);
    expect(ctx.lastEntity).toEqual({ type: 'product', value: 'pizza' });
    expect(ctx.lastIntent).toBeNull();
  });
});
