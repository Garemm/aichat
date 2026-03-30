'use strict';

/**
 * src/services/businessInfoService.js
 *
 * BUSINESS INFO SERVICE — Maps a detected intent to the correct DB query
 * and returns the results.
 *
 * ADD NEW INTENTS: add a new entry to QUERY_MAP pointing to the BusinessModel
 * method that handles it.
 */

const BusinessModel = require('../models/businessModel');

/**
 * Maps each intent key to the BusinessModel method that handles it.
 * @type {Record<string, (businessId: number) => Promise<any>>}
 */
const QUERY_MAP = {
  horarios:    (businessId) => BusinessModel.getHorarios(businessId),
  productos:   (businessId) => BusinessModel.getProductos(businessId),
  precios:     (businessId) => BusinessModel.getPrecios(businessId),
  promociones: (businessId) => BusinessModel.getPromociones(businessId),
  ubicacion:   (businessId) => BusinessModel.getUbicacion(businessId),
};

/**
 * Fetches the relevant business information from the DB based on a detected intent.
 * @param {string} intentName   Intent key (must exist in QUERY_MAP).
 * @param {number} businessId   The business to query.
 * @returns {Promise<any>}      Rows or object from the database.
 */
async function getBusinessInfoByIntent(intentName, businessId) {
  const queryFn = QUERY_MAP[intentName];
  if (!queryFn) {
    throw new Error(`[BusinessInfoService] No query mapped for intent: "${intentName}"`);
  }
  return queryFn(businessId);
}

module.exports = { getBusinessInfoByIntent };
