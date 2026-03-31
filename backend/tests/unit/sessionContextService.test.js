'use strict';

/**
 * tests/unit/sessionContextService.test.js
 *
 * Unit tests for:
 *   - sessionContextService.getContext()
 *   - sessionContextService.updateContext()
 *
 * ESTRATEGIA DE MOCK:
 *   ioredis se mockea completamente con jest.mock() para que los tests
 *   sean puramente unitarios — sin conexión real a Redis.
 *   El mock implementa el comportamiento de SETEX / GET / TTL con un
 *   Map en memoria, replicando fielmente la interfaz de ioredis.
 */

// ─── Mock de ioredis ─────────────────────────────────────────────────────────
const store = new Map();

const mockRedisInstance = {
  get:    jest.fn(async (key)             => store.get(key) ?? null),
  setex:  jest.fn(async (key, _ttl, val)  => { store.set(key, val); return 'OK'; }),
  on:     jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Importamos DESPUÉS de registrar el mock
const { getContext, updateContext, EMPTY_CONTEXT } = require('../../src/services/sessionContextService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Genera un sessionId único por test para evitar contaminación entre tests. */
const sid = (label) => `test-session-${label}-${Date.now()}`;

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

// ─── getContext() ─────────────────────────────────────────────────────────────

describe('getContext()', () => {
  test('devuelve estructura con todos los campos en null para sesión nueva', async () => {
    const ctx = await getContext(sid('new'));
    expect(ctx).toEqual({
      lastIntent:   null,
      lastEntity:   { type: null, value: null },
      updatedAt:    null,
    });
  });

  test('lee desde la clave "session:{sessionId}"', async () => {
    const id = sid('key-format');
    store.set(`session:${id}`, JSON.stringify({
      lastIntent: 'horarios',
      lastEntity: { type: null, value: null },
      updatedAt: '2026-01-01',
    }));
    await getContext(id);
    expect(mockRedisInstance.get).toHaveBeenCalledWith(`session:${id}`);
  });

  test('devuelve el contexto guardado previamente', async () => {
    const id = sid('existing');
    const ctx = {
      lastIntent: 'precios',
      lastEntity: { type: 'product', value: 'pizza' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    store.set(`session:${id}`, JSON.stringify(ctx));
    expect(await getContext(id)).toEqual(ctx);
  });

  test('devuelve null-context si Redis devuelve JSON inválido (resiliencia)', async () => {
    const id = sid('bad-json');
    store.set(`session:${id}`, 'not-a-json-string{{');
    const ctx = await getContext(id);
    expect(ctx).toEqual(EMPTY_CONTEXT);
  });

  test('devuelve null-context cuando Redis lanza excepción (degradación elegante)', async () => {
    mockRedisInstance.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const ctx = await getContext(sid('redis-down'));
    expect(ctx).toEqual(EMPTY_CONTEXT);
  });

  test('migrates old format { lastProduct } → { lastEntity: { type, value } }', async () => {
    const id = sid('migrate');
    store.set(`session:${id}`, JSON.stringify({
      lastIntent: 'precios',
      lastProduct: 'hamburguesa',
      lastEntities: {},
      updatedAt: '2026-01-01',
    }));
    const ctx = await getContext(id);
    expect(ctx.lastEntity).toEqual({ type: 'product', value: 'hamburguesa' });
    expect(ctx.lastProduct).toBeUndefined();
    expect(ctx.lastEntities).toBeUndefined();
  });

  test('migrates old format with null lastProduct', async () => {
    const id = sid('migrate-null');
    store.set(`session:${id}`, JSON.stringify({
      lastIntent: 'horarios',
      lastProduct: null,
      lastEntities: {},
      updatedAt: '2026-01-01',
    }));
    const ctx = await getContext(id);
    expect(ctx.lastEntity).toEqual({ type: null, value: null });
  });
});

// ─── updateContext() ──────────────────────────────────────────────────────────

describe('updateContext()', () => {
  test('guarda el contexto con SETEX y la clave correcta', async () => {
    const id = sid('setex');
    await updateContext(id, { lastIntent: 'horarios' });
    expect(mockRedisInstance.setex).toHaveBeenCalledTimes(1);
    const lastCall = mockRedisInstance.setex.mock.calls.find(([k]) => k === `session:${id}`);
    expect(lastCall).toBeDefined();
    expect(lastCall[0]).toBe(`session:${id}`);
    expect(lastCall[1]).toBe(210); // TTL exacto
  });

  test('el TTL es exactamente 210 segundos', async () => {
    const id = sid('ttl');
    await updateContext(id, { lastIntent: 'precios' });
    const setexCall = mockRedisInstance.setex.mock.calls.find(([k]) => k === `session:${id}`);
    expect(setexCall[1]).toBe(210);
  });

  test('hace MERGE con el contexto previo (no sobreescribe campos no enviados)', async () => {
    const id = sid('merge');
    // Contexto inicial
    await updateContext(id, { lastIntent: 'horarios', lastEntity: { type: null, value: null } });
    // Actualización parcial: solo lastEntity
    await updateContext(id, { lastEntity: { type: 'product', value: 'hamburguesa doble' } });
    const ctx = await getContext(id);
    // lastIntent debe conservarse del turno anterior
    expect(ctx.lastIntent).toBe('horarios');
    expect(ctx.lastEntity).toEqual({ type: 'product', value: 'hamburguesa doble' });
  });

  test('agrega updatedAt con formato ISO 8601', async () => {
    const id = sid('timestamp');
    await updateContext(id, { lastIntent: 'ubicacion' });
    const ctx = await getContext(id);
    expect(ctx.updatedAt).toBeDefined();
    expect(new Date(ctx.updatedAt).toISOString()).toBe(ctx.updatedAt);
  });

  test('updatedAt se renueva con cada actualización', async () => {
    const id = sid('ts-renew');
    await updateContext(id, { lastIntent: 'horarios' });
    const first = (await getContext(id)).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await updateContext(id, { lastEntity: { type: 'product', value: 'pozole' } });
    const second = (await getContext(id)).updatedAt;
    expect(second >= first).toBe(true);
  });

  test('no lanza excepción cuando Redis falla (degradación elegante)', async () => {
    mockRedisInstance.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(updateContext(sid('redis-down'), { lastIntent: 'precios' })).resolves.toBeUndefined();
  });

  test('guarda correctamente lastEntity con nulls (reset)', async () => {
    const id = sid('null-entity');
    await updateContext(id, {
      lastIntent: 'productos',
      lastEntity: { type: 'product', value: 'pizza' },
    });
    await updateContext(id, { lastEntity: { type: null, value: null } });
    const ctx = await getContext(id);
    expect(ctx.lastEntity).toEqual({ type: null, value: null });
  });

  test('guarda correctamente un contexto completo', async () => {
    const id = sid('full');
    await updateContext(id, {
      lastIntent: 'precios',
      lastEntity: { type: 'product', value: 'hamburguesa doble' },
    });
    const ctx = await getContext(id);
    expect(ctx.lastIntent).toBe('precios');
    expect(ctx.lastEntity).toEqual({ type: 'product', value: 'hamburguesa doble' });
  });
});

// ─── Flujo conversacional completo ───────────────────────────────────────────

describe('flujo conversacional — múltiples turnos', () => {
  test('simula 3 turnos de conversación con herencia de contexto', async () => {
    const id = sid('conversation');

    // Turno 1: pregunta por un producto
    await updateContext(id, { lastIntent: null, lastEntity: { type: 'product', value: 'hamburguesa doble' } });
    let ctx = await getContext(id);
    expect(ctx.lastEntity).toEqual({ type: 'product', value: 'hamburguesa doble' });
    expect(ctx.lastIntent).toBeNull();

    // Turno 2: pregunta de seguimiento sobre precio
    await updateContext(id, { lastIntent: 'precios' });
    ctx = await getContext(id);
    // La entidad del turno 1 debe conservarse
    expect(ctx.lastEntity).toEqual({ type: 'product', value: 'hamburguesa doble' });
    expect(ctx.lastIntent).toBe('precios');

    // Turno 3: cambia de tema
    await updateContext(id, { lastIntent: 'horarios', lastEntity: { type: null, value: null } });
    ctx = await getContext(id);
    expect(ctx.lastIntent).toBe('horarios');
    expect(ctx.lastEntity).toEqual({ type: null, value: null });
  });
});
