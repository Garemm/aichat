/**
 * src/temp/mockOpenAI.js
 *
 * Simula una respuesta de OpenAI. Recibe un mensaje y responde con un texto generado.
 * Puedes mejorar la lógica para simular diferentes tipos de respuestas.
 */

function getMockOpenAIResponse(userMessage) {
  // Simulación simple: responde con eco y un prefijo
  return `🤖 OpenAI dice: sin resultados para "${userMessage}"`;
}

module.exports = { getMockOpenAIResponse };
