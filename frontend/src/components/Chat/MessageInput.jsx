import { useState, useCallback, useRef } from 'react';
import useSocket from '../../hooks/useSocket';

const TYPING_TIMEOUT_MS = 1500;

const MessageInput = () => {
  const [text, setText] = useState('');
  // Mirror text in a ref so `send` can always read the latest value
  // without needing `text` in its dependency array (avoids stale-closure
  // issues caused by iOS blur → re-render race condition).
  const textRef = useRef('');

  const { sendMessage, emitTyping, emitStopTyping } = useSocket();
  const typingTimer = useRef(null);

  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setText(val);
      textRef.current = val;           // keep ref in sync
      emitTyping();
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(emitStopTyping, TYPING_TIMEOUT_MS);
    },
    [emitTyping, emitStopTyping]
  );

  // `send` never depends on `text` state — reads from ref instead.
  // This means the function reference is stable and always operates on
  // the latest typed value, regardless of render timing.
  const send = useCallback(() => {
    const trimmed = textRef.current.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setText('');
    textRef.current = '';
    emitStopTyping();
    clearTimeout(typingTimer.current);
  }, [sendMessage, emitStopTyping]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  // onTouchStart fires before the browser has a chance to blur the input
  // or run any scroll logic. preventDefault stops the 300 ms synthetic
  // click from firing afterward, so onClick won't double-fire on mobile.
  const handleTouchStart = useCallback(
    (e) => {
      e.preventDefault();
      send();
    },
    [send]
  );

  return (
    <div className="message-input">
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Escribe un mensaje…"
        autoComplete="off"
        maxLength={2000}
      />
      <button
        className="send-btn"
        type="button"
        aria-label="Enviar"
        aria-disabled={!text.trim()}
        onTouchStart={handleTouchStart}
        onClick={send}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
};

export default MessageInput;
