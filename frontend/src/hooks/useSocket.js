/**
 * hooks/useSocket.js
 *
 * Manages the socket lifecycle for a component tree.
 * Registers event listeners on mount, cleans them up on unmount.
 *
 * Exposes:
 *   sendMessage   — emits 'send_message' to the server
 *   emitTyping    — emits 'typing' indicator
 *   emitStopTyping — emits 'stop_typing'
 *
 * TIP: This hook is the single place that knows about socket event names.
 *      If you rename an event, you change it here once — nowhere else.
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

    // Join room only when roomId changes
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

  const sendMessage = (text) => {
    socketService.getSocket().emit('send_message', { roomId, sender: username, text });
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
