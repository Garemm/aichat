/**
 * context/ChatContext.jsx — Global chat state.
 *
 * Holds: current room, messages, username, and typing indicators.
 *
 * SCALING TIP:
 *   When state grows (multiple rooms, user lists, notifications), replace
 *   useState with useReducer here, or graduate to Zustand for a flat,
 *   selector-friendly store without prop drilling.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const ChatContext = createContext(null);

export const ChatProvider = ({ children, businessId }) => {
  const [messages, setMessages]     = useState([]);
  const [roomId, setRoomId]         = useState('general');
  const [username, setUsername]     = useState('');
  const [typingUsers, setTypingUsers] = useState([]);

  const addMessage = useCallback((message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const setHistory = useCallback((history) => {
    setMessages(history);
  }, []);

  const addTypingUser = useCallback((sender) => {
    setTypingUsers((prev) => (prev.includes(sender) ? prev : [...prev, sender]));
  }, []);

  const removeTypingUser = useCallback((sender) => {
    setTypingUsers((prev) => prev.filter((u) => u !== sender));
  }, []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        roomId,
        username,
        typingUsers,
        businessId,
        setRoomId,
        setUsername,
        addMessage,
        setHistory,
        addTypingUser,
        removeTypingUser,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
};
