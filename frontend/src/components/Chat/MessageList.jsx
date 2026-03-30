import { useEffect, useRef } from 'react';
import Message from './Message';
import { useChat } from '../../context/ChatContext';

const MessageList = () => {
  const { messages, username, typingUsers } = useChat();
  const bottomRef = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} currentUser={username} />
      ))}

      {typingUsers.length > 0 && (
        <p className="typing-indicator">
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </p>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;
