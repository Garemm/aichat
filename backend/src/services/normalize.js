'use strict';

/**
 * src/services/normalize.js
 *
 * Normalización robusta de texto para NLP en español.
 * Módulo centralizado — todos los servicios importan desde aquí.
 *
 * Pipeline:
 *   1. lowercase
 *   2. NFD + strip diacritics (acentos)
 *   3. Strip inverted punctuation (¿ ¡)
 *   4. Strip remaining punctuation except spaces
 *   5. Collapse repeated characters (hoolaa → hola)
 *   6. Trim + collapse whitespace
 */

/**
 * Full normalization pipeline for NLP comparison.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[¿¡]/g, '')             // strip inverted punct
    .replace(/[^\w\s]/g, '')          // strip punctuation (keep letters, digits, spaces)
    .replace(/(.)\1{2,}/g, '$1$1')    // collapse 3+ repeated chars → 2 (hoolaa→hoolaa, holaaa→holaa)
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

/**
 * Tries basic singular from a Spanish plural.
 * NOT a full stemmer — handles common suffixes only.
 * @param {string} word
 * @returns {string}
 */
function toSingular(word) {
  if (word.endsWith('ces')) return word.slice(0, -3) + 'z';   // lapices → lapiz
  if (word.endsWith('iones')) return word.slice(0, -5) + 'ion'; // promociones → promocion
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2); // marcadores → marcador
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Returns an array with the word + its singular form (if different).
 * Useful for matching both "cuadernos" and "cuaderno".
 * @param {string} word
 * @returns {string[]}
 */
function wordVariants(word) {
  const singular = toSingular(word);
  return singular !== word ? [word, singular] : [word];
}

module.exports = { normalize, toSingular, wordVariants };
