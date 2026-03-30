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

const FORMATTERS = {
  horarios(rows) {
    if (!rows || rows.length === 0) return 'No encontré información de horarios.';
    const lines = rows.map((r) => {
      const day = DAYS[r.day_of_week] ?? `Día ${r.day_of_week}`;
      if (r.is_closed) return `  • ${day}: Cerrado`;
      return `  • ${day}: ${formatTime(r.open_time)} – ${formatTime(r.close_time)}`;
    });
    return `🕐 *Horarios de atención:*\n${lines.join('\n')}`;
  },

  productos(rows) {
    if (!rows || rows.length === 0) return 'No encontré productos disponibles.';
    const lines = rows.map((r) => {
      const stock = r.stock_quantity != null ? ` (stock: ${r.stock_quantity})` : '';
      const cat = r.category ? ` [${r.category}]` : '';
      return `  • ${r.name}${cat} — $${Number(r.price).toFixed(2)}${stock}`;
    });
    return `📦 *Productos disponibles:*\n${lines.join('\n')}`;
  },

  precios(rows) {
    if (!rows || rows.length === 0) return 'No encontré información de precios.';
    const lines = rows.map((r) => `  • ${r.name}: $${Number(r.price).toFixed(2)}`);
    return `💲 *Lista de precios:*\n${lines.join('\n')}`;
  },

  promociones(rows) {
    if (!rows || rows.length === 0) return 'No hay promociones activas en este momento.';
    const lines = rows.map((r) => {
      const value =
        r.discount_type === 'percentage'
          ? `${r.discount_value}% de descuento`
          : `$${Number(r.discount_value).toFixed(2)} de descuento`;
      const desc = r.description ? `\n    ${r.description}` : '';
      return `  • *${r.title}* — ${value} (hasta ${r.end_date})${desc}`;
    });
    return `🎉 *Promociones activas:*\n${lines.join('\n')}`;
  },

  ubicacion(row) {
    if (!row) return 'No encontré información de ubicación.';
    return `📍 *Ubicación:*\n  • Negocio: ${row.name}\n  • Ciudad: ${row.city}\n  • ${row.description}`;
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

module.exports = { formatIntentResponse };
