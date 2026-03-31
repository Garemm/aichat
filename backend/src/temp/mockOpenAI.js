/**
 * src/temp/mockOpenAI.js
 *
 * MOCK OPENAI — Fallback de IA simulado.
 *
 * PROPÓSITO:
 *   Se invoca cuando ninguna regla determinista (NLP entity, intent keywords)
 *   pudo resolver el mensaje del usuario. Actúa como último recurso en el pipeline.
 *
 * USO DEL CONTEXTO:
 *   Recibe el contexto de sesión (lastProduct / lastIntent) para generar
 *   una respuesta más coherente con la conversación previa.
 *   Sin contexto devuelve un mensaje genérico de ayuda.
 *
 * REEMPLAZAR EN PRODUCCIÓN:
 *   Sustituir el cuerpo de getMockOpenAIResponse() por la llamada real a
 *   openai.chat.completions.create() con el historial de la sesión.
 *
 * @param {string} userMessage
 * @param {{ lastProduct?: string|null, lastIntent?: string|null }|null} context
 * @returns {string}
 */
function getMockOpenAIResponse(userMessage, context = null) {
  // Si hay contexto previo, generar una respuesta coherente con él
  if (context?.lastProduct) {
    return (
      `🤖 No entendí bien tu pregunta sobre "*${context.lastProduct}*". ` +
      `¿Quieres saber su precio, disponibilidad o descripción?`
    );
  }

  if (context?.lastIntent) {
    const temas = {
      horarios:    'horarios de atención',
      productos:   'productos disponibles',
      precios:     'precios',
      promociones: 'promociones activas',
      ubicacion:   'ubicación del negocio',
    };
    const tema = temas[context.lastIntent] || context.lastIntent;
    return (
      `🤖 ¿Quieres saber algo más sobre los ${tema}? ` +
      `Puedo ayudarte con horarios, productos, precios, promociones o ubicación.`
    );
  }

  // Sin contexto → respuesta genérica orientada a las capacidades del bot
  return (
    `🤖 No estoy seguro de cómo responder eso. ` +
    `Puedo ayudarte con:\n` +
    `  • Horarios de atención\n` +
    `  • Productos disponibles\n` +
    `  • Precios\n` +
    `  • Promociones\n` +
    `  • Ubicación\n` +
    `¿En qué te puedo ayudar?`
  );
}

module.exports = { getMockOpenAIResponse };

