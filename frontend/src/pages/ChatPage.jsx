import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { ChatProvider, useChat } from '../context/ChatContext';
import ChatWindow from '../components/Chat/ChatWindow';

const ChatContent = () => {
  const { username, setUsername } = useChat();
  const [name, setName] = useState('');

  if (!username) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <h1>LLM Chat</h1>
          <input
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) setUsername(name.trim());
            }}
          />
          <button
            disabled={!name.trim()}
            onClick={() => setUsername(name.trim())}
          >
            Entrar al chat
          </button>
        </div>
      </div>
    );
  }

  return <ChatWindow />;
};

const ChatPage = () => {
  const { businessId } = useParams();
  const bizId = parseInt(businessId, 10);

  if (!bizId || isNaN(bizId)) return <Navigate to="/" replace />;

  return (
    <ChatProvider businessId={bizId}>
      <ChatContent />
    </ChatProvider>
  );
};

export default ChatPage;
