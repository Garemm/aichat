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

export const ChatProvider = ({ children, businessId, businessName = '' }) => {
  const [messages, setMessages]       = useState([]);
  const [roomId, setRoomId]           = useState('general');
  const [username, setUsername]       = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const addMessage = useCallback((message) => {
    setMessages((prev) => [...prev, { ...message, isNew: true }]);
  }, []);

  const setHistory = useCallback((history) => {
    setMessages(history.map((m) => ({ ...m, isNew: false })));
  }, []);

  const addTypingUser = useCallback((sender) => {
    setTypingUsers((prev) => (prev.includes(sender) ? prev : [...prev, sender]));
  }, []);

  const removeTypingUser = useCallback((sender) => {
    setTypingUsers((prev) => prev.filter((u) => u !== sender));
  }, []);

  const toggleVoice = useCallback(() => setVoiceEnabled((v) => !v), []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        roomId,
        username,
        typingUsers,
        businessId,
        businessName,
        voiceEnabled,
        setRoomId,
        setUsername,
        addMessage,
        setHistory,
        addTypingUser,
        removeTypingUser,
        toggleVoice,
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
