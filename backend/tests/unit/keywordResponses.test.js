'use strict';

/**
 * tests/unit/keywordResponses.test.js
 *
 * Unit tests for src/mockai/keywordResponses.js
 *
 * Tests cover:
 *   - Known keywords that should match
 *   - Case-insensitive matching
 *   - Keyword embedded inside a longer sentence
 *   - Messages that produce no match
 *   - Null / undefined / empty input guards
 */

const { getKeywordResponse } = require('../../src/mockai/keywordResponses');

// ─── Positive matches ─────────────────────────────────────────────────────────

describe('getKeywordResponse() — known keywords', () => {
  test('"hola" returns greeting response', () => {
    expect(getKeywordResponse('hola')).toBe('hola para ti tambien');
  });

  test('"como te llamas" returns name response', () => {
    expect(getKeywordResponse('como te llamas')).toBe('me llamo LLM inicial');
  });

  test('"¿como te llamas?" (with punctuation) returns name response', () => {
    expect(getKeywordResponse('¿como te llamas?')).toBe('me llamo LLM inicial');
  });

  test('"cómo te llamas" (with accent) returns name response', () => {
    expect(getKeywordResponse('cómo te llamas')).toBe('me llamo LLM inicial');
  });
});

// ─── Case-insensitivity ────────────────────────────────────────────────────────

describe('getKeywordResponse() — case-insensitive matching', () => {
  test('"HOLA" matches', () => {
    expect(getKeywordResponse('HOLA')).toBe('hola para ti tambien');
  });

  test('"Hola Mundo" matches', () => {
    expect(getKeywordResponse('Hola Mundo')).toBe('hola para ti tambien');
  });

  test('"Como Te Llamas" matches', () => {
    expect(getKeywordResponse('Como Te Llamas')).toBe('me llamo LLM inicial');
  });
});

// ─── Keyword embedded in sentence ────────────────────────────────────────────

describe('getKeywordResponse() — keyword inside a longer message', () => {
  test('sentence containing "hola" returns greeting response', () => {
    expect(getKeywordResponse('oye hola que tal estas')).toBe('hola para ti tambien');
  });
});

// ─── No match ─────────────────────────────────────────────────────────────────

describe('getKeywordResponse() — no match → null', () => {
  const NO_MATCH = [
    'que hora es',
    'cuanto cuesta',
    'tienen tacos',
    'adios',
    '   ',
    'xyzzy',
  ];

  test.each(NO_MATCH)('"%s" → null', (msg) => {
    expect(getKeywordResponse(msg)).toBeNull();
  });
});

// ─── Edge cases / guard clauses ───────────────────────────────────────────────

describe('getKeywordResponse() — edge cases', () => {
  test('null input returns null', () => {
    expect(getKeywordResponse(null)).toBeNull();
  });

  test('undefined input returns null', () => {
    expect(getKeywordResponse(undefined)).toBeNull();
  });

  test('empty string returns null', () => {
    expect(getKeywordResponse('')).toBeNull();
  });
});
