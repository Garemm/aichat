import { useState, useCallback, useRef } from 'react';
import useSocket from '../../hooks/useSocket';

const TYPING_TIMEOUT_MS = 1500;

const MessageInput = () => {
  const [text, setText] = useState('');
  const { sendMessage, emitTyping, emitStopTyping } = useSocket();
  const typingTimer = useRef(null);

  const handleChange = useCallback(
    (e) => {
      setText(e.target.value);
      emitTyping();
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(emitStopTyping, TYPING_TIMEOUT_MS);
    },
    [emitTyping, emitStopTyping]
  );

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      sendMessage(trimmed);
      setText('');
      emitStopTyping();
      clearTimeout(typingTimer.current);
    },
    [text, sendMessage, emitStopTyping]
  );

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={handleChange}
        placeholder="Type a message..."
        autoComplete="off"
        maxLength={2000}
      />
      <button type="submit" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
};

export default MessageInput;
