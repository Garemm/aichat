'use strict';

/**
 * tests/unit/intentService.test.js
 *
 * Unit tests for:
 *   - intentDetector.detectIntent()      — score-based intent detection
 *   - intentDetector.scoreIntents()      — individual intent scoring
 *   - intentDetector.isStandaloneIntent() — standalone flag checking
 *
 * These tests are PURE (no DB, no sockets).
 * They verify that weighted keyword scoring and text normalization work
 * correctly for Spanish user input with and without accents.
 */

const { detectIntent, scoreIntents, isStandaloneIntent, MIN_CONFIDENCE } = require('../../src/services/intentDetector');

// ─── detectIntent ─────────────────────────────────────────────────────────────

describe('detectIntent()', () => {

  // ── horarios ────────────────────────────────────────────────────────────────
  describe('intent: horarios', () => {
    const HORARIOS_CASES = [
      'cuando abren?',
      'Cuando Abren',
      'cuándo abren',          // with accent
      'a que hora abren',
      'a qué hora abren',
      'a que hora cierran',
      'horario de atencion',
      'horario de atención',   // with accent
      'que dias atienden',
      'atienden los domingos',
      'atienden fines de semana',
      'hasta que hora atienden',
      'están abiertos ahora',
      'estan abiertos ahora',  // without accent
      'horarios',
      'cuales son sus horarios',
      'abren hoy',
      'abren mañana',
    ];

    test.each(HORARIOS_CASES)('"%s" → horarios', (msg) => {
      expect(detectIntent(msg).intent).toBe('horarios');
    });
  });

  // ── productos ───────────────────────────────────────────────────────────────
  describe('intent: productos', () => {
    const PRODUCTOS_CASES = [
      'que productos tienen',
      'qué productos tienen',
      'que venden',
      'hay stock',
      'tienen en existencia',
      'catalogo de productos',
      'catálogo de productos',
      'lista de productos',
      'hay disponibilidad de algo',
    ];

    test.each(PRODUCTOS_CASES)('"%s" → productos', (msg) => {
      expect(detectIntent(msg).intent).toBe('productos');
    });
  });

  // ── precios ──────────────────────────────────────────────────────────────────
  describe('intent: precios', () => {
    const PRECIOS_CASES = [
      'cuanto cuesta',
      'cuánto cuesta',
      'cuanto vale',
      'cual es el precio',
      'me puede dar el precio',
      'cuanto me cobra',
      'tarifa',
      'precio de lista',
      'precio al mayoreo',
      'en cuanto esta',
    ];

    test.each(PRECIOS_CASES)('"%s" → precios', (msg) => {
      expect(detectIntent(msg).intent).toBe('precios');
    });
  });

  // ── promociones ──────────────────────────────────────────────────────────────
  describe('intent: promociones', () => {
    const PROMO_CASES = [
      'tienen promociones',
      'hay promociones',
      'hay ofertas',
      'cupon de descuento',
      'cupón de descuento',
      'codigo de descuento',
      '2x1',
      'tienen programa de lealtad',
      'liquidacion',
      'liquidación',
    ];

    test.each(PROMO_CASES)('"%s" → promociones', (msg) => {
      expect(detectIntent(msg).intent).toBe('promociones');
    });
  });

  // ── ubicacion ────────────────────────────────────────────────────────────────
  describe('intent: ubicacion', () => {
    const UBICACION_CASES = [
      'donde estan ubicados',
      'dónde están ubicados',
      'cual es su direccion',
      'cuál es su dirección',
      'como llego',
      'cómo llego',
      'tienen tienda fisica',
      'tienen sucursales',
      'google maps',
      'mapa de ubicacion',
    ];

    test.each(UBICACION_CASES)('"%s" → ubicacion', (msg) => {
      expect(detectIntent(msg).intent).toBe('ubicacion');
    });
  });

  // ── no match ─────────────────────────────────────────────────────────────────
  describe('no intent match', () => {
    const NO_MATCH_CASES = [
      'hola',
      'hola como estas',
      '',
      null,
      'gracias',
      'que tal',
      'adios',
      'ok',
    ];

    test.each(NO_MATCH_CASES)('"%s" → null', (msg) => {
      expect(detectIntent(msg).intent).toBeNull();
    });
  });

  // ── edge cases ───────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    test('is case-insensitive', () => {
      expect(detectIntent('CUANDO ABREN?').intent).toBe('horarios');
      expect(detectIntent('CUÁNTO CUESTA').intent).toBe('precios');
    });

    test('is accent-insensitive', () => {
      expect(detectIntent('cuándo abren').intent).toBe('horarios');
      expect(detectIntent('cuando abren').intent).toBe('horarios');
    });

    test('detects intent inside longer sentence', () => {
      expect(detectIntent('hola, me podrían decir cuando abren por favor?').intent).toBe('horarios');
    });

    test('returns full result object with score and scores', () => {
      const result = detectIntent('cuanto cuesta');
      expect(result).toHaveProperty('intent', 'precios');
      expect(result).toHaveProperty('score');
      expect(result.score).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('confident', true);
    });

    test('not-confident result has intent=null', () => {
      const result = detectIntent('hola');
      expect(result.intent).toBeNull();
      expect(result.confident).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});

// ─── scoreIntents ─────────────────────────────────────────────────────────────

describe('scoreIntents()', () => {
  test('high-weight phrase scores more than single keyword', () => {
    const scores = scoreIntents('tienen descuentos');
    expect(scores.promociones).toBeGreaterThanOrEqual(3);
  });

  test('"tienen" alone does not match any intent', () => {
    const scores = scoreIntents('tienen');
    expect(Object.keys(scores).length).toBe(0);
  });

  test('returns empty object for unrecognized text', () => {
    const scores = scoreIntents('hola mundo');
    expect(scores).toEqual({});
  });

  test('can accept custom intents config', () => {
    const custom = {
      test_intent: {
        name: 'test_intent',
        standalone: true,
        keywords: [{ phrase: 'foobar', weight: 2 }],
      },
    };
    const scores = scoreIntents('foobar', custom);
    expect(scores.test_intent).toBe(2);
  });
});

// ─── isStandaloneIntent ───────────────────────────────────────────────────────

describe('isStandaloneIntent()', () => {
  test('horarios is standalone', () => {
    expect(isStandaloneIntent('horarios')).toBe(true);
  });

  test('ubicacion is standalone', () => {
    expect(isStandaloneIntent('ubicacion')).toBe(true);
  });

  test('promociones is standalone', () => {
    expect(isStandaloneIntent('promociones')).toBe(true);
  });

  test('precios is NOT standalone', () => {
    expect(isStandaloneIntent('precios')).toBe(false);
  });

  test('productos is NOT standalone', () => {
    expect(isStandaloneIntent('productos')).toBe(false);
  });

  test('unknown intent returns false', () => {
    expect(isStandaloneIntent('fake_intent')).toBe(false);
  });
});
