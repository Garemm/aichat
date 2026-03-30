'use strict';

/**
 * tests/unit/intentResponseFormatter.test.js
 *
 * Unit tests for src/services/intentResponseFormatter.js
 *
 * Tests cover:
 *   - All 5 formatters (horarios, productos, precios, promociones, ubicacion)
 *   - Empty / null data → graceful fallback messages
 *   - formatTime edge cases (midnight, noon, AM/PM)
 *   - Unknown intent → safe fallback string
 */

const { formatIntentResponse } = require('../../src/services/intentResponseFormatter');

// ─── Helper fixtures ──────────────────────────────────────────────────────────

const HORARIOS_ROWS = [
  { day_of_week: 1, open_time: '08:00:00', close_time: '20:00:00', is_closed: false }, // Lunes
  { day_of_week: 5, open_time: '09:00:00', close_time: '23:00:00', is_closed: false }, // Viernes
  { day_of_week: 0, open_time: null,        close_time: null,        is_closed: true  }, // Domingo
];

const PRODUCTOS_ROWS = [
  { name: 'Hamburguesa Doble', category: 'Hamburguesas', price: '150.00', stock_quantity: 30 },
  { name: 'Refresco',          category: 'Bebidas',       price: '25.00',  stock_quantity: null },
];

const PRECIOS_ROWS = [
  { name: 'Pozole Rojo',   price: '110.00' },
  { name: 'Agua Mineral',  price: '20.00'  },
];

const PROMOCIONES_ROWS = [
  {
    title: '2x1 Martes',
    discount_type: 'percentage',
    discount_value: '50',
    end_date: '2025-12-31',
    description: 'Solo en pastor',
  },
  {
    title: 'Combo Familiar',
    discount_type: 'fixed',
    discount_value: '30.00',
    end_date: '2025-11-30',
    description: null,
  },
];

const UBICACION_ROW = {
  name: 'Restaurante Don Pepe',
  city: 'Ciudad de México',
  description: 'Av. Insurgentes Sur 1234, Col. Del Valle',
};

// ─── horarios formatter ───────────────────────────────────────────────────────

describe('formatIntentResponse("horarios", ...)', () => {
  test('includes the header emoji and label', () => {
    const result = formatIntentResponse('horarios', HORARIOS_ROWS);
    expect(result).toContain('🕐');
    expect(result).toContain('Horarios');
  });

  test('shows "Cerrado" for closed days', () => {
    const result = formatIntentResponse('horarios', HORARIOS_ROWS);
    expect(result).toContain('Domingo: Cerrado');
  });

  test('formats an AM open time correctly', () => {
    const result = formatIntentResponse('horarios', HORARIOS_ROWS);
    expect(result).toContain('8:00 am');
  });

  test('formats a PM close time correctly', () => {
    const result = formatIntentResponse('horarios', HORARIOS_ROWS);
    expect(result).toContain('8:00 pm'); // 20:00 → 8:00 pm
  });

  test('uses 12 for midnight (00:00)', () => {
    const row = [{ day_of_week: 6, open_time: '00:00:00', close_time: '03:00:00', is_closed: false }];
    const result = formatIntentResponse('horarios', row);
    expect(result).toContain('12:00 am');
  });

  test('uses 12 for noon (12:00)', () => {
    const row = [{ day_of_week: 3, open_time: '12:00:00', close_time: '14:00:00', is_closed: false }];
    const result = formatIntentResponse('horarios', row);
    expect(result).toContain('12:00 pm');
  });

  test('returns fallback for empty rows', () => {
    expect(formatIntentResponse('horarios', [])).toMatch(/no encontré|No encontré/i);
  });

  test('returns fallback for null input', () => {
    expect(formatIntentResponse('horarios', null)).toMatch(/no encontré|No encontré/i);
  });
});

// ─── productos formatter ──────────────────────────────────────────────────────

describe('formatIntentResponse("productos", ...)', () => {
  test('includes the header emoji and label', () => {
    const result = formatIntentResponse('productos', PRODUCTOS_ROWS);
    expect(result).toContain('📦');
  });

  test('lists each product name and price', () => {
    const result = formatIntentResponse('productos', PRODUCTOS_ROWS);
    expect(result).toContain('Hamburguesa Doble');
    expect(result).toContain('$150.00');
    expect(result).toContain('Refresco');
    expect(result).toContain('$25.00');
  });

  test('includes category when present', () => {
    const result = formatIntentResponse('productos', PRODUCTOS_ROWS);
    expect(result).toContain('[Hamburguesas]');
    expect(result).toContain('[Bebidas]');
  });

  test('includes stock count when present', () => {
    const result = formatIntentResponse('productos', PRODUCTOS_ROWS);
    expect(result).toContain('stock: 30');
  });

  test('skips stock when stock_quantity is null', () => {
    const rows = [{ name: 'Agua', category: null, price: '20.00', stock_quantity: null }];
    const result = formatIntentResponse('productos', rows);
    expect(result).not.toContain('stock:');
  });

  test('returns fallback for empty rows', () => {
    expect(formatIntentResponse('productos', [])).toMatch(/no encontré|No encontré/i);
  });
});

// ─── precios formatter ────────────────────────────────────────────────────────

describe('formatIntentResponse("precios", ...)', () => {
  test('includes the header emoji', () => {
    const result = formatIntentResponse('precios', PRECIOS_ROWS);
    expect(result).toContain('💲');
  });

  test('lists product names and prices', () => {
    const result = formatIntentResponse('precios', PRECIOS_ROWS);
    expect(result).toContain('Pozole Rojo');
    expect(result).toContain('$110.00');
    expect(result).toContain('Agua Mineral');
    expect(result).toContain('$20.00');
  });

  test('returns fallback for empty rows', () => {
    expect(formatIntentResponse('precios', [])).toMatch(/no encontré|No encontré/i);
  });
});

// ─── promociones formatter ────────────────────────────────────────────────────

describe('formatIntentResponse("promociones", ...)', () => {
  test('includes the header emoji and label', () => {
    const result = formatIntentResponse('promociones', PROMOCIONES_ROWS);
    expect(result).toContain('🎉');
    expect(result).toContain('Promociones');
  });

  test('shows percentage discount correctly', () => {
    const result = formatIntentResponse('promociones', PROMOCIONES_ROWS);
    expect(result).toContain('50% de descuento');
  });

  test('shows fixed discount correctly', () => {
    const result = formatIntentResponse('promociones', PROMOCIONES_ROWS);
    expect(result).toContain('$30.00 de descuento');
  });

  test('includes promo title and end date', () => {
    const result = formatIntentResponse('promociones', PROMOCIONES_ROWS);
    expect(result).toContain('2x1 Martes');
    expect(result).toContain('2025-12-31');
  });

  test('includes description when present', () => {
    const result = formatIntentResponse('promociones', PROMOCIONES_ROWS);
    expect(result).toContain('Solo en pastor');
  });

  test('returns fallback for empty rows', () => {
    expect(formatIntentResponse('promociones', [])).toMatch(/no hay promociones/i);
  });
});

// ─── ubicacion formatter ──────────────────────────────────────────────────────

describe('formatIntentResponse("ubicacion", ...)', () => {
  test('includes the header emoji', () => {
    const result = formatIntentResponse('ubicacion', UBICACION_ROW);
    expect(result).toContain('📍');
  });

  test('shows business name', () => {
    const result = formatIntentResponse('ubicacion', UBICACION_ROW);
    expect(result).toContain('Restaurante Don Pepe');
  });

  test('shows city', () => {
    const result = formatIntentResponse('ubicacion', UBICACION_ROW);
    expect(result).toContain('Ciudad de México');
  });

  test('shows the address/description', () => {
    const result = formatIntentResponse('ubicacion', UBICACION_ROW);
    expect(result).toContain('Insurgentes');
  });

  test('returns fallback for null input', () => {
    expect(formatIntentResponse('ubicacion', null)).toMatch(/no encontré|No encontré/i);
  });
});

// ─── Unknown intent ───────────────────────────────────────────────────────────

describe('formatIntentResponse() — unknown intent', () => {
  test('returns safe fallback string for unrecognised intent', () => {
    const result = formatIntentResponse('unknown_intent', []);
    expect(typeof result).toBe('string');
    expect(result).toContain('unknown_intent');
  });
});
