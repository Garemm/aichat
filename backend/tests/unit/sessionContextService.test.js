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
// Se usa una clase fake que implementa get / setex con un Map en memoria.
// El mock se registra ANTES de que cualquier módulo importe ioredis,
// siguiendo el orden de resolución de módulos de Jest.

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
const { getContext, updateContext } = require('../../src/services/sessionContextService');

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
      lastProduct:  null,
      lastEntities: {},
      updatedAt:    null,
    });
  });

  test('lee desde la clave "session:{sessionId}"', async () => {
    const id = sid('key-format');
    store.set(`session:${id}`, JSON.stringify({ lastIntent: 'horarios', lastProduct: null, lastEntities: {}, updatedAt: '2026-01-01' }));
    await getContext(id);
    expect(mockRedisInstance.get).toHaveBeenCalledWith(`session:${id}`);
  });

  test('devuelve el contexto guardado previamente', async () => {
    const id = sid('existing');
    const ctx = { lastIntent: 'precios', lastProduct: 'pizza', lastEntities: {}, updatedAt: '2026-01-01T00:00:00.000Z' };
    store.set(`session:${id}`, JSON.stringify(ctx));
    expect(await getContext(id)).toEqual(ctx);
  });

  test('devuelve null-context si Redis devuelve JSON inválido (resiliencia)', async () => {
    const id = sid('bad-json');
    // Forzamos un error en JSON.parse al guardar texto no JSON
    store.set(`session:${id}`, 'not-a-json-string{{');
    const ctx = await getContext(id);
    // Debe devolver el objeto vacío por defecto (catch interno)
    expect(ctx).toEqual({ lastIntent: null, lastProduct: null, lastEntities: {}, updatedAt: null });
  });

  test('devuelve null-context cuando Redis lanza excepción (degradación elegante)', async () => {
    mockRedisInstance.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const ctx = await getContext(sid('redis-down'));
    expect(ctx).toEqual({ lastIntent: null, lastProduct: null, lastEntities: {}, updatedAt: null });
  });
});

// ─── updateContext() ──────────────────────────────────────────────────────────

describe('updateContext()', () => {
  test('guarda el contexto con SETEX y la clave correcta', async () => {
    const id = sid('setex');
    await updateContext(id, { lastIntent: 'horarios' });
    // updateContext llama internamente a getContext (usa GET) y luego SETEX una vez
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
    await updateContext(id, { lastIntent: 'horarios', lastProduct: null });
    // Actualización parcial: solo lastProduct
    await updateContext(id, { lastProduct: 'hamburguesa doble' });
    const ctx = await getContext(id);
    // lastIntent debe conservarse del turno anterior
    expect(ctx.lastIntent).toBe('horarios');
    expect(ctx.lastProduct).toBe('hamburguesa doble');
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
    // Pequeña espera para asegurar diferencia temporal
    await new Promise((r) => setTimeout(r, 5));
    await updateContext(id, { lastProduct: 'pozole' });
    const second = (await getContext(id)).updatedAt;
    expect(second >= first).toBe(true);
  });

  test('no lanza excepción cuando Redis falla (degradación elegante)', async () => {
    mockRedisInstance.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    // No debe arrojar
    await expect(updateContext(sid('redis-down'), { lastIntent: 'precios' })).resolves.toBeUndefined();
  });

  test('guarda correctamente lastProduct con valor null (reset)', async () => {
    const id = sid('null-product');
    await updateContext(id, { lastIntent: 'productos', lastProduct: 'pizza' });
    await updateContext(id, { lastProduct: null });
    const ctx = await getContext(id);
    expect(ctx.lastProduct).toBeNull();
  });

  test('guarda correctamente un contexto completo', async () => {
    const id = sid('full');
    await updateContext(id, {
      lastIntent:   'precios',
      lastProduct:  'hamburguesa doble',
      lastEntities: { category: 'comida' },
    });
    const ctx = await getContext(id);
    expect(ctx.lastIntent).toBe('precios');
    expect(ctx.lastProduct).toBe('hamburguesa doble');
    expect(ctx.lastEntities).toEqual({ category: 'comida' });
  });
});

// ─── Flujo conversacional completo ───────────────────────────────────────────

describe('flujo conversacional — múltiples turnos', () => {
  test('simula 3 turnos de conversación con herencia de contexto', async () => {
    const id = sid('conversation');

    // Turno 1: pregunta por un producto
    await updateContext(id, { lastIntent: null, lastProduct: 'hamburguesa doble' });
    let ctx = await getContext(id);
    expect(ctx.lastProduct).toBe('hamburguesa doble');
    expect(ctx.lastIntent).toBeNull();

    // Turno 2: pregunta de seguimiento sobre precio
    await updateContext(id, { lastIntent: 'precios' });
    ctx = await getContext(id);
    // El producto del turno 1 debe conservarse
    expect(ctx.lastProduct).toBe('hamburguesa doble');
    expect(ctx.lastIntent).toBe('precios');

    // Turno 3: cambia de tema
    await updateContext(id, { lastIntent: 'horarios', lastProduct: null });
    ctx = await getContext(id);
    expect(ctx.lastIntent).toBe('horarios');
    expect(ctx.lastProduct).toBeNull();
  });
});
