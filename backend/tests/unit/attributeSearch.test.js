'use strict';

/**
 * tests/unit/attributeSearch.test.js
 *
 * Tests for the attribute-based semantic search NLP layer.
 *
 * Covers:
 *   - attributeExtractor: pattern detection and type classification
 *   - attributeSearchService: DB query building and response formatting
 *   - entityDetector: attribute entity type routing
 *   - messagePipeline: full pipeline attribute routing + no OpenAI used
 */

// ─── Mock DB ─────────────────────────────────────────────────────────────────
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
// ─── Mock Redis ───────────────────────────────────────────────────────────────
jest.mock('../../src/config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
}));
// ─── Mock OpenAI / AI modules — must NOT be called during attribute path ─────
const mockGetMockOpenAI = jest.fn();
const mockGetRAGOpenAI  = jest.fn();
jest.mock('../../src/temp/mockOpenAI', () => ({
  getMockOpenAIResponse: mockGetMockOpenAI,
  getRAGOpenAIResponse:  mockGetRAGOpenAI,
}));
jest.mock('../../src/services/aiDecisionEngine', () => ({
  shouldUseAI:     jest.fn().mockReturnValue({ routing: 'backend', reason: 'mocked' }),
  hasRelevantData: jest.fn().mockReturnValue(false),
}));
jest.mock('../../src/services/ragFilterService', () => ({
  filterRelevantData: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/services/businessInfoService', () => ({
  getBusinessInfoByIntent:    jest.fn().mockResolvedValue([]),
  getHorariosByDay:           jest.fn().mockResolvedValue(null),
  getCategories:              jest.fn().mockResolvedValue([]),
  getProductosByCategory:     jest.fn().mockResolvedValue([]),
  countProductosByCategory:   jest.fn().mockResolvedValue(0),
}));
jest.mock('../../src/mockai/keywordResponses', () => ({
  getKeywordResponse: jest.fn().mockReturnValue(null),
}));

const db = require('../../src/config/database');

const {
  extractAttribute,
  isAttributeQuery,
  classifyAttributeType,
  isMeasure,
} = require('../../src/services/attributeExtractor');

const {
  searchByAttribute,
  searchByAttributes,
  formatAttributeResponse,
  buildAttributeConditions,
} = require('../../src/services/attributeSearchService');

const { detectEntities } = require('../../src/services/entityDetector');

const { processMessage } = require('../../src/services/messagePipeline');

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue({ rows: [] });
});

// ─── attributeExtractor ───────────────────────────────────────────────────────

describe('attributeExtractor — extractAttribute()', () => {
  describe('detects attribute correctly', () => {
    const CASES = [
      ['tienes algo con queso',             { value: 'queso',            type: 'feature'  }],
      ['algo con bluetooth',                { value: 'bluetooth',        type: 'feature'  }],
      ['productos con wifi',                { value: 'wifi',             type: 'feature'  }],
      ['algo que tenga wifi',               { value: 'wifi',             type: 'feature'  }],
      ['algo que tengan pantalla tactil',   { value: 'pantalla tactil',  type: 'feature'  }],
      ['tornillos para madera',             { value: 'madera',           type: 'use'      }],
      ['algo para construccion',            { value: 'construccion',     type: 'use'      }],
      ['cables de 2 metros',                { value: '2 metros',         type: 'measure'  }],
      ['tornillos de 10 milimetros',        { value: '10 milimetros',    type: 'measure'  }],
      ['productos de acero inoxidable',     { value: 'acero inoxidable', type: 'material' }],
      ['algo con acero',                    { value: 'acero',            type: 'material' }],
      ['algo que tenga bluetooth y wifi',   { value: 'bluetooth y wifi', type: 'feature'  }],
    ];

    test.each(CASES)('"%s" → %j', (input, expected) => {
      const result = extractAttribute(input);
      expect(result).not.toBeNull();
      expect(result.value).toBe(expected.value);
      expect(result.type).toBe(expected.type);
    });
  });

  describe('returns null for non-attribute queries', () => {
    const NON_ATTR = [
      'tienen hamburguesa',
      'que precios tienen',
      'horario del sabado',
      'cuanto cuesta la pizza',
      'quiero una hamburguesa doble',
      'tienes cuadernos',
    ];

    test.each(NON_ATTR)('"%s" → null', (input) => {
      expect(extractAttribute(input)).toBeNull();
    });
  });
});

// ─── isMeasure ────────────────────────────────────────────────────────────────

describe('attributeExtractor — isMeasure()', () => {
  test.each([
    ['2 metros',        true],
    ['10 milimetros',   true],
    ['1.5 litros',      true],
    ['500 gramos',      true],
    ['15 watts',        true],
    ['queso',           false],
    ['bluetooth',       false],
    ['madera',          false],
  ])('"%s" → %s', (input, expected) => {
    expect(isMeasure(input)).toBe(expected);
  });
});

// ─── classifyAttributeType ────────────────────────────────────────────────────

describe('attributeExtractor — classifyAttributeType()', () => {
  test('measure: 10 milimetros', () => {
    expect(classifyAttributeType('10 milimetros', 'de')).toBe('measure');
  });
  test('material: acero inoxidable', () => {
    expect(classifyAttributeType('acero inoxidable', 'de')).toBe('material');
  });
  test('use: madera with hint para', () => {
    expect(classifyAttributeType('madera', 'para')).toBe('use');
  });
  test('feature: bluetooth with hint con', () => {
    expect(classifyAttributeType('bluetooth', 'con')).toBe('feature');
  });
  test('feature: wifi default', () => {
    expect(classifyAttributeType('wifi', 'que tenga')).toBe('feature');
  });
});

// ─── isAttributeQuery ─────────────────────────────────────────────────────────

describe('attributeExtractor — isAttributeQuery()', () => {
  test.each([
    ['algo con queso',          true],
    ['productos con bluetooth', true],
    ['algo que tenga wifi',     true],
    ['productos de acero',      true],
    ['tienen hamburguesa',      false],
    ['que precios tienen',      false],
  ])('"%s" → %s', (input, expected) => {
    expect(isAttributeQuery(input)).toBe(expected);
  });
});

// ─── buildAttributeConditions ────────────────────────────────────────────────

describe('attributeSearchService — buildAttributeConditions()', () => {
  test('builds conditions for a single-variant word', () => {
    const { conditions, params, nextIndex } = buildAttributeConditions('wifi', 2);
    // wifi has no plural/singular variant → 1 condition block, 5 params
    expect(conditions).toHaveLength(1);
    expect(params).toHaveLength(5);
    expect(params.every((p) => p === '%wifi%')).toBe(true);
    expect(nextIndex).toBe(7);
  });

  test('builds conditions for a plural word (wordVariants)', () => {
    // "tornillos" → variants: ["tornillos", "tornillo"]
    const { conditions, params } = buildAttributeConditions('tornillos', 2);
    expect(conditions).toHaveLength(2);   // one per variant
    expect(params).toHaveLength(10);      // 5 params × 2 variants
  });
});

// ─── searchByAttribute ────────────────────────────────────────────────────────

describe('attributeSearchService — searchByAttribute()', () => {
  test('queries DB and returns matching rows', async () => {
    const fakeRows = [
      { id: 1, name: 'Pizza con queso', description: 'Queso mozarella', price: 15, is_available: true, stock_quantity: 10, category: 'Pizzas' },
    ];
    db.query.mockResolvedValueOnce({ rows: fakeRows });

    const rows = await searchByAttribute('queso', 1);
    expect(rows).toEqual(fakeRows);
    expect(db.query).toHaveBeenCalledTimes(1);
    // Verify businessId param
    const [sql, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(1);
    expect(sql).toMatch(/ILIKE/i);
    // Must NOT call openai
    expect(mockGetMockOpenAI).not.toHaveBeenCalled();
    expect(mockGetRAGOpenAI).not.toHaveBeenCalled();
  });

  test('returns empty array when no products match', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const rows = await searchByAttribute('queso', 1);
    expect(rows).toEqual([]);
  });
});

// ─── searchByAttributes (multi) ───────────────────────────────────────────────

describe('attributeSearchService — searchByAttributes()', () => {
  test('single attribute delegates to searchByAttribute', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test', price: 10, is_available: true }] });
    const { rows, strategy } = await searchByAttributes([{ value: 'queso', type: 'feature' }], 1);
    expect(rows).toHaveLength(1);
    expect(strategy).toBe('AND');
  });

  test('multi-attribute AND returns results when AND matches', async () => {
    const fakeRows = [{ id: 2, name: 'Pizza queso y pollo', price: 18, is_available: true }];
    db.query
      .mockResolvedValueOnce({ rows: fakeRows })   // AND query
    ;
    const { rows, strategy } = await searchByAttributes(
      [{ value: 'queso', type: 'feature' }, { value: 'pollo', type: 'feature' }],
      1
    );
    expect(rows).toEqual(fakeRows);
    expect(strategy).toBe('AND');
  });

  test('multi-attribute falls back to OR when AND returns empty', async () => {
    const fakeRows = [{ id: 3, name: 'Pollo BBQ', price: 12, is_available: true }];
    db.query
      .mockResolvedValueOnce({ rows: [] })         // AND miss
      .mockResolvedValueOnce({ rows: fakeRows })   // OR hit
    ;
    const { rows, strategy } = await searchByAttributes(
      [{ value: 'queso', type: 'feature' }, { value: 'pollo', type: 'feature' }],
      1
    );
    expect(rows).toEqual(fakeRows);
    expect(strategy).toBe('OR');
  });
});

// ─── formatAttributeResponse ─────────────────────────────────────────────────

describe('attributeSearchService — formatAttributeResponse()', () => {
  const attrs = [{ value: 'queso', type: 'feature' }];

  test('returns not-found message when rows empty', () => {
    const msg = formatAttributeResponse(attrs, []);
    expect(msg).toMatch(/no encontr/i);
    expect(msg).toMatch(/queso/);
  });

  test('formats single product correctly', () => {
    const rows = [{ id: 1, name: 'Pizza de queso', price: 15, is_available: true, stock_quantity: 5, category: 'Pizzas', description: null }];
    const msg = formatAttributeResponse(attrs, rows, 'AND');
    expect(msg).toMatch(/Pizza de queso/);
    expect(msg).toMatch(/15/);
    expect(msg).toMatch(/queso/);
  });

  test('formats multiple products with count', () => {
    const rows = [
      { id: 1, name: 'Pizza queso', price: 15, is_available: true, stock_quantity: null, category: null },
      { id: 2, name: 'Hamburguesa queso', price: 12, is_available: true, stock_quantity: null, category: null },
    ];
    const msg = formatAttributeResponse(attrs, rows, 'AND');
    expect(msg).toMatch(/2 productos/i);
  });

  test('includes OR note when strategy is OR', () => {
    const rows = [{ id: 1, name: 'Pollo', price: 10, is_available: true, stock_quantity: null, category: null }];
    const msg = formatAttributeResponse(
      [{ value: 'queso', type: 'feature' }, { value: 'pollo', type: 'feature' }],
      rows,
      'OR'
    );
    expect(msg).toMatch(/al menos uno/i);
  });
});

// ─── entityDetector — attribute routing ──────────────────────────────────────

describe('entityDetector — detectEntities() attribute routing', () => {
  test('"tienes algo con queso" → returns attribute entity', async () => {
    const result = await detectEntities('tienes algo con queso', 1, { intent: null, score: 0 });
    expect(result.type).toBe('attribute');
    expect(result.value).toBe('queso');
    expect(result.attributeType).toBe('feature');
    // DB should NOT be queried for attribute entities
    expect(db.query).not.toHaveBeenCalled();
  });

  test('"algo que tenga wifi" → attribute: wifi', async () => {
    const result = await detectEntities('algo que tenga wifi', 1, { intent: null, score: 0 });
    expect(result.type).toBe('attribute');
    expect(result.value).toBe('wifi');
  });

  test('"tornillos para madera" → attribute: madera (use)', async () => {
    const result = await detectEntities('productos para madera', 1, { intent: null, score: 0 });
    expect(result.type).toBe('attribute');
    expect(result.value).toBe('madera');
    expect(result.attributeType).toBe('use');
  });

  test('"cables de 2 metros" → attribute: 2 metros (measure)', async () => {
    const result = await detectEntities('productos de 2 metros', 1, { intent: null, score: 0 });
    expect(result.type).toBe('attribute');
    expect(result.value).toBe('2 metros');
    expect(result.attributeType).toBe('measure');
  });

  test('"tienen hamburguesa" → NOT attribute (normal product entity)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Hamburguesa', price: 10, is_available: true }] });
    const result = await detectEntities('tienen hamburguesa', 1, { intent: null, score: 0 });
    expect(result.type).not.toBe('attribute');
  });
});

// ─── Full pipeline — attribute strategy + no OpenAI ─────────────────────────

describe('processMessage() — attribute strategy', () => {
  test('"tienes algo con queso" → strategy=attribute, no OpenAI', async () => {
    const fakeProducts = [
      { id: 1, name: 'Pizza cuatro quesos', price: 20, is_available: true, stock_quantity: 3, category: 'Pizzas' },
    ];
    db.query.mockResolvedValueOnce({ rows: fakeProducts });

    const result = await processMessage({
      text: 'tienes algo con queso',
      sessionId: 'test-session-1',
      businessId: 1,
    });

    expect(result.decision.strategy).toBe('attribute');
    expect(result.decision.intent).toBe('productos');
    expect(result.replyText).toMatch(/Pizza cuatro quesos/);
    expect(mockGetMockOpenAI).not.toHaveBeenCalled();
    expect(mockGetRAGOpenAI).not.toHaveBeenCalled();
  });

  test('"productos con bluetooth" → strategy=attribute, no OpenAI', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 5, name: 'Altavoz bluetooth', price: 50, is_available: true, stock_quantity: 8, category: 'Electrónica' },
    ]});

    const result = await processMessage({
      text: 'productos con bluetooth',
      sessionId: 'test-session-2',
      businessId: 1,
    });

    expect(result.decision.strategy).toBe('attribute');
    expect(result.replyText).toMatch(/Altavoz bluetooth/);
    expect(mockGetMockOpenAI).not.toHaveBeenCalled();
  });

  test('"tornillos para madera" → strategy=attribute', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 10, name: 'Tornillo madera 3"', price: 0.5, is_available: true, stock_quantity: 200, category: 'Tornillería' },
    ]});

    const result = await processMessage({
      text: 'tornillos para madera',
      sessionId: 'test-session-3',
      businessId: 2,
    });

    expect(result.decision.strategy).toBe('attribute');
    expect(result.replyText).toMatch(/Tornillo madera/);
    expect(mockGetMockOpenAI).not.toHaveBeenCalled();
  });

  test('"cables de 2 metros" → strategy=attribute, measure type', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 20, name: 'Cable HDMI 2m', price: 8, is_available: true, stock_quantity: 15, category: 'Cables' },
    ]});

    const result = await processMessage({
      text: 'cables de 2 metros',
      sessionId: 'test-session-4',
      businessId: 2,
    });

    expect(result.decision.strategy).toBe('attribute');
    expect(result.decision.entity.attributeType).toBe('measure');
    expect(mockGetMockOpenAI).not.toHaveBeenCalled();
  });

  test('"algo que tenga wifi" → strategy=attribute, no OpenAI', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await processMessage({
      text: 'algo que tenga wifi',
      sessionId: 'test-session-5',
      businessId: 1,
    });

    expect(result.decision.strategy).toBe('attribute');
    expect(result.replyText).toMatch(/no encontr/i);
    expect(mockGetMockOpenAI).not.toHaveBeenCalled();
    expect(mockGetRAGOpenAI).not.toHaveBeenCalled();
  });

  test('attribute search → no OpenAI flow activated', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await processMessage({
      text: 'productos con acero inoxidable',
      sessionId: 'test-session-6',
      businessId: 2,
    });

    // Must NOT fall through to AI
    expect(result.decision.strategy).not.toBe('ai');
    expect(mockGetMockOpenAI).not.toHaveBeenCalled();
    expect(mockGetRAGOpenAI).not.toHaveBeenCalled();
  });
});
