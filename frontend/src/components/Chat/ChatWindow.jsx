import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useChat } from '../../context/ChatContext';

const ChatWindow = () => {
  const { roomId, username, businessName } = useChat();
  const displayName = businessName || roomId || 'Chat';

  return (
    <div className="chat-window">
      <header className="chat-header">
        <div className="chat-header__avatar">{displayName[0]}</div>
        <div className="chat-header__info">
          <div className="chat-header__name">{displayName}</div>
          <div className="chat-header__status">En línea</div>
        </div>
        <span className="chat-header__user">@{username}</span>
      </header>
      <MessageList />
      <MessageInput />
    </div>
  );
};

export default ChatWindow;
