/**
 * hooks/useSocket.js
 *
 * Manages the socket lifecycle for a component tree.
 * Registers event listeners on mount, cleans them up on unmount.
 *
 * MANEJO DE SESIÓN:
 *   Cada emit de 'send_message' incluye el sessionId de la pestaña actual.
 *   socketService.getSessionId() lo lee desde sessionStorage (o lo genera
 *   si es la primera vez), garantizando una sesión por pestaña del navegador.
 *   El frontend NO almacena ni interpreta el contexto — esa responsabilidad
 *   pertenece exclusivamente al backend (Redis).
 *
 * Exposes:
 *   sendMessage    — emits 'send_message' con { roomId, sender, text, sessionId }
 *   emitTyping     — emits indicador 'typing'
 *   emitStopTyping — emits 'stop_typing'
 */

import { useEffect, useRef } from 'react';
import socketService from '../services/socketService';
import { useChat } from '../context/ChatContext';

const useSocket = () => {
  const {
    roomId,
    username,
    addMessage,
    setHistory,
    addTypingUser,
    removeTypingUser,
  } = useChat();

  const joinedRoom = useRef(null);

  useEffect(() => {
    const socket = socketService.connect();

    if (joinedRoom.current !== roomId) {
      socket.emit('join_room', roomId);
      joinedRoom.current = roomId;
    }

    socket.on('message_history', setHistory);
    socket.on('receive_message', addMessage);
    socket.on('user_typing', ({ sender }) => {
      if (sender !== username) addTypingUser(sender);
    });
    socket.on('user_stop_typing', ({ sender }) => removeTypingUser(sender));

    return () => {
      socket.off('message_history', setHistory);
      socket.off('receive_message', addMessage);
      socket.off('user_typing');
      socket.off('user_stop_typing');
    };
  }, [roomId, username, addMessage, setHistory, addTypingUser, removeTypingUser]);

  /**
   * Envía el mensaje del usuario incluyendo el sessionId de la sesión actual.
   * El backend usa el sessionId para recuperar el contexto de Redis y
   * determinar si el mensaje es una pregunta de seguimiento.
   */
  const sendMessage = (text) => {
    const sessionId = socketService.getSessionId();
    socketService.getSocket().emit('send_message', { roomId, sender: username, text, sessionId });
  };

  const emitTyping = () => {
    socketService.getSocket().emit('typing', { roomId, sender: username });
  };

  const emitStopTyping = () => {
    socketService.getSocket().emit('stop_typing', { roomId, sender: username });
  };

  return { sendMessage, emitTyping, emitStopTyping };
};

export default useSocket;

