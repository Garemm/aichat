/**
 * src/mockai/keywordResponses.js
 *
 * Respuestas simuladas para palabras/frases clave.
 * Si el mensaje recibido contiene una clave, responde con el valor asociado.
 */

const responses = [
  {
    keywords: ["hola"],
    response: "hola para ti tambien"
  },
  {
    keywords: ["como te llamas", "¿como te llamas?", "cómo te llamas", "¿cómo te llamas?"],
    response: "me llamo LLM inicial"
  }
];

function getKeywordResponse(userMessage) {
  if (!userMessage) return null;
  const normalized = userMessage.toLowerCase();
  for (const { keywords, response } of responses) {
    if (keywords.some(k => normalized.includes(k))) {
      return response;
    }
  }
  return null;
}

module.exports = { getKeywordResponse };
