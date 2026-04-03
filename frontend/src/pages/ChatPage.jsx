import { useState } from 'react';
import { useParams, Navigate, useLocation } from 'react-router-dom';
import { ChatProvider, useChat } from '../context/ChatContext';
import ChatWindow from '../components/Chat/ChatWindow';

const ChatContent = ({ businessName }) => {
  const { username, setUsername } = useChat();
  const [name, setName] = useState('');

  if (!username) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <div className="join-card__logo">
            <div className="join-card__icon">🤖</div>
            <span className="join-card__title">{businessName || 'Chat'}</span>
            <span className="join-card__subtitle">Ingresa tu nombre para continuar</span>
          </div>
          <input
            className="name-input"
            placeholder="Tu nombre…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) setUsername(name.trim());
            }}
          />
          <button
            className="join-btn"
            disabled={!name.trim()}
            onClick={() => setUsername(name.trim())}
          >
            Entrar al chat →
          </button>
        </div>
      </div>
    );
  }

  return <ChatWindow />;
};

const ChatPage = () => {
  const { businessId } = useParams();
  const { state } = useLocation();
  const bizId = parseInt(businessId, 10);

  if (!bizId || isNaN(bizId)) return <Navigate to="/" replace />;

  const businessName = state?.name || '';

  return (
    <ChatProvider businessId={bizId} businessName={businessName}>
      <ChatContent businessName={businessName} />
    </ChatProvider>
  );
};

export default ChatPage;
