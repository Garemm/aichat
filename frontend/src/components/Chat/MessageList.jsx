import { useEffect, useRef } from 'react';
import Message from './Message';
import { useChat } from '../../context/ChatContext';

const MessageList = () => {
  const { messages, username, typingUsers } = useChat();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} currentUser={username} />
      ))}

      {typingUsers.length > 0 && (
        <div className="typing-dots">
          <div className="typing-dots__bubble">
            <span /><span /><span />
          </div>
          <span className="typing-dots__label">{typingUsers[0]} está escribiendo…</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;
