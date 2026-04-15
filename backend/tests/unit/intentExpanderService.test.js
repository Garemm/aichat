import {
  expandIntents,
  expandKeywords,
  expandPhrase,
  toPlural,
  VERB_GROUPS,
  GENDER_TOKEN_PAIRS,
  WORD_SYNONYMS,
} from '../../src/services/intentExpanderService.js';

describe('intentExpanderService', () => {
  describe('toPlural()', () => {
    test.each([
      ['precio', 'precios'],
      ['ciudad', 'ciudades'],
      ['lapiz', 'lapices'],
      ['catalogo', 'catalogos'],
    ])('pluraliza %s -> %s', (input, expected) => {
      expect(toPlural(input)).toBe(expected);
    });

    test.each([
      [''],
      ['ok'],
      ['mes'],
      ['linux'],
      ['box'],
    ])('no pluraliza %s', (input) => {
      expect(toPlural(input)).toBeNull();
    });
  });

  describe('expandPhrase()', () => {
    test('expande verbo por persona gramatical', () => {
      const variants = expandPhrase('que tiene disponible');
      expect(variants).toContain('que tienen disponible');
      expect(variants).toContain('que tienes disponible');
    });

    test('expande articulo por genero', () => {
      const variants = expandPhrase('como es el producto');
      expect(variants).toContain('como es la producto');
    });

    test('no duplica la frase original', () => {
      const variants = expandPhrase('que tiene disponible');
      expect(variants).not.toContain('que tiene disponible');
    });
  });

  describe('expandKeywords()', () => {
    test('agrega variantes multiword y single-word sin duplicar', () => {
      const input = [
        { phrase: 'que tiene', weight: 3 },
        { phrase: 'precio', weight: 1 },
      ];

      const output = expandKeywords(input);
      const phrases = output.map((k) => k.phrase);

      expect(phrases).toContain('que tienen');
      expect(phrases).toContain('que tienes');
      expect(phrases).toContain('precios');
      expect(phrases).toContain('costo');
      expect(new Set(phrases).size).toBe(phrases.length);
    });

    test('conserva el peso original en variantes generadas', () => {
      const output = expandKeywords([{ phrase: 'precio', weight: 2 }]);
      const generated = output.filter((k) => k._generated === true);
      expect(generated.length).toBeGreaterThan(0);
      generated.forEach((k) => expect(k.weight).toBe(2));
    });
  });

  describe('expandIntents()', () => {
    test('expande todas las keywords sin mutar input original', () => {
      const source = {
        demo: {
          name: 'demo',
          standalone: true,
          keywords: [{ phrase: 'precio', weight: 1 }],
        },
      };

      const before = JSON.parse(JSON.stringify(source));
      const expanded = expandIntents(source);

      expect(expanded.demo.keywords.length).toBeGreaterThan(source.demo.keywords.length);
      expect(expanded.demo.keywords.some((k) => k.phrase === 'precios')).toBe(true);
      expect(source).toEqual(before);
    });
  });

  describe('rule tables integrity', () => {
    test('VERB_GROUPS incluye grupo de tener', () => {
      expect(VERB_GROUPS.some((g) => g.includes('tiene') && g.includes('tienen'))).toBe(true);
    });

    test('GENDER_TOKEN_PAIRS incluye articulo el/la', () => {
      expect(GENDER_TOKEN_PAIRS.some(([m, f]) => m === 'el' && f === 'la')).toBe(true);
    });

    test('WORD_SYNONYMS incluye sinonimos para precio', () => {
      expect(Array.isArray(WORD_SYNONYMS.precio)).toBe(true);
      expect(WORD_SYNONYMS.precio).toContain('costo');
    });
  });
});
