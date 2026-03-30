'use strict';

/**
 * tests/unit/intentService.test.js
 *
 * Unit tests for:
 *   - intentService.detectIntent()
 *
 * These tests are PURE (no DB, no sockets).
 * They verify that keyword → intent mapping and text normalization work
 * correctly for Spanish user input with and without accents.
 */

const { detectIntent } = require('../../src/services/intentService');

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
      expect(detectIntent(msg)).toBe('horarios');
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
      'busco un producto',
      'hay disponibilidad de',
      'donde encuentro',
      'dónde encuentro',
    ];

    test.each(PRODUCTOS_CASES)('"%s" → productos', (msg) => {
      expect(detectIntent(msg)).toBe('productos');
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
      expect(detectIntent(msg)).toBe('precios');
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
      expect(detectIntent(msg)).toBe('promociones');
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
      expect(detectIntent(msg)).toBe('ubicacion');
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
      expect(detectIntent(msg)).toBeNull();
    });
  });

  // ── edge cases ───────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    test('is case-insensitive', () => {
      expect(detectIntent('CUANDO ABREN?')).toBe('horarios');
      expect(detectIntent('CUÁNTO CUESTA')).toBe('precios');
    });

    test('is accent-insensitive', () => {
      expect(detectIntent('cuándo abren')).toBe('horarios');   // á
      expect(detectIntent('cuando abren')).toBe('horarios');   // a
    });

    test('detects intent inside longer sentence', () => {
      expect(detectIntent('hola, me podrían decir cuando abren por favor?')).toBe('horarios');
    });
  });
});
