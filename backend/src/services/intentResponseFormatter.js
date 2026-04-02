'use strict';

/**
 * src/services/intentResponseFormatter.js
 *
 * Converts raw DB rows into a human-readable Spanish text response.
 * One formatter per intent. Add a new entry to FORMATTERS when adding a new intent.
 */

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatTime(t) {
  // t comes as 'HH:MM:SS' from pg
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/**
 * Renders a titled bullet list.
 * @param {string}   title  Header line (emoji + label)
 * @param {string[]} items  Each element becomes one "• item" line
 * @returns {string}
 */
function formatList(title, items) {
  return `${title}\n\n${items.map((i) => `• ${i}`).join('\n')}`;
}

const FORMATTERS = {
  horarios(rows) {
    if (!rows || rows.length === 0) return 'No encontré información de horarios.';
    const items = rows.map((r) => {
      const day = DAYS[r.day_of_week] ?? `Día ${r.day_of_week}`;
      if (r.is_closed) return `${day}: Cerrado 🔒`;
      return `${day}: ${formatTime(r.open_time)} – ${formatTime(r.close_time)}`;
    });
    return formatList('🕐 Horarios de atención:', items);
  },

  productos(rows) {
    if (!rows || rows.length === 0) return 'No encontré productos disponibles.';
    const byCat = new Map();
    for (const r of rows) {
      const key = r.category || 'General';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(r);
    }
    const sections = [];
    for (const [cat, items] of byCat) {
      const header = byCat.size > 1 ? `📁 ${cat}\n` : '';
      const lines = items.map((r) => {
        const stock = r.stock_quantity != null ? ` · stock: ${r.stock_quantity}` : '';
        const avail = r.is_available !== false ? '✅' : '❌';
        return `• ${avail} ${r.name} — $${Number(r.price).toFixed(2)}${stock}`;
      });
      sections.push(header + lines.join('\n'));
    }
    return `📦 Productos disponibles:\n\n${sections.join('\n\n')}`;
  },

  precios(rows) {
    if (!rows || rows.length === 0) return 'No encontré información de precios.';
    const items = rows.map((r) => `${r.name}: $${Number(r.price).toFixed(2)}`);
    return formatList('💲 Lista de precios:', items);
  },

  promociones(rows) {
    if (!rows || rows.length === 0) return 'No hay promociones activas en este momento.';
    const items = rows.map((r) => {
      const value =
        r.discount_type === 'percentage'
          ? `${r.discount_value}% de descuento`
          : `$${Number(r.discount_value).toFixed(2)} de descuento`;
      const desc = r.description ? `\n  ${r.description}` : '';
      return `${r.title} — ${value} (hasta ${r.end_date})${desc}`;
    });
    return formatList('🎉 Promociones activas:', items);
  },

  ubicacion(row) {
    if (!row) return 'No encontré información de ubicación.';
    return `📍 Ubicación:\n• Negocio: ${row.name}\n• Ciudad: ${row.city}\n• ${row.description}`;
  },

  servicios(rows) {
    if (!rows || rows.length === 0) return 'No hay servicios registrados.';
    const items = rows.map((s) => {
      const price = s.price != null ? ` — $${Number(s.price).toFixed(2)}` : '';
      return `${s.name}${price}`;
    });
    return (
      formatList('🛎️ Servicios disponibles:', items) +
      '\n\n¿Te gustaría saber más sobre alguno de estos servicios?'
    );
  },
};

/**
 * Formats DB data for a given intent into a readable string.
 * @param {string} intent
 * @param {any} data  Rows array or single object from BusinessModel
 * @returns {string}
 */
function formatIntentResponse(intent, data) {
  const formatter = FORMATTERS[intent];
  if (!formatter) return `Información sobre "${intent}" no disponible.`;
  return formatter(data);
}

/**
 * Formats the schedule for a single day into a natural Spanish sentence.
 * @param {string} normalizedDayKey  e.g. "lunes"
 * @param {object|null} row          DB row from business_hours (or null)
 * @returns {string}
 */
function formatHorarioDay(normalizedDayKey, row) {
  // Display name map to keep accents correct
  const DISPLAY = {
    domingo: 'Domingo', lunes: 'Lunes', martes: 'Martes',
    miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
  };
  const display = DISPLAY[normalizedDayKey] ?? (normalizedDayKey.charAt(0).toUpperCase() + normalizedDayKey.slice(1));

  if (!row) return `No encontré información de horarios para el ${display}.`;
  if (row.is_closed) return `El ${display} estamos cerrados. 🔒`;
  return `El ${display} abrimos de ${formatTime(row.open_time)} a ${formatTime(row.close_time)}. 🕐`;
}

/**
 * Formats a product description response, putting the description first.
 * Unlike formatProductResponse which leads with price/availability.
 *
 * @param {string} entityValue  Queried entity name (raw user input)
 * @param {Array}  rows         Product rows from queryProducts
 * @returns {string}
 */
function formatDescripcionResponse(entityValue, rows) {
  if (!rows || rows.length === 0) {
    return `No encontré información sobre "*${entityValue}*". ¿Quieres ver el catálogo completo?`;
  }
  const p = rows[0];
  const name = p.name ?? entityValue;
  if (!p.description) {
    return `*${name}*: sin descripción detallada disponible.`;
  }
  return `*${name}*: ${p.description}`;
}

/**
 * Formats a product's key/value attributes as a natural-sounding section.
 * Returns an empty string if there are no attributes for the given product.
 *
 * @param {Record<number, {key:string,value:string}[]>} attrsMap  Grouped by product_id
 * @param {number} productId
 * @returns {string}
 */
function formatProductAttributes(attrsMap, productId) {
  const attrs = attrsMap[productId];
  if (!attrs || attrs.length === 0) return '';
  const lines = attrs.map((a) => `• ${a.key}: ${a.value}`).join('\n');
  return `\n\n✨ Características:\n${lines}`;
}

/**
 * Formats a single service with full detail (name, description, price).
 *
 * @param {{name:string, description:string|null, price:number|null}} service
 * @returns {string}
 */
function formatServiceDetail(service) {
  const price = service.price != null
    ? `\n  💲 Precio: $${Number(service.price).toFixed(2)}`
    : '';
  const desc = service.description
    ? `\n  📝 ${service.description}`
    : '';
  return `🛎️ *${service.name}*${price}${desc}`;
}

module.exports = {
  formatIntentResponse,
  formatHorarioDay,
  formatList,
  formatDescripcionResponse,
  formatProductAttributes,
  formatServiceDetail,
};
