import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useChat } from '../../context/ChatContext';

const ChatWindow = () => {
  const { roomId, username } = useChat();

  return (
    <div className="chat-window">
      <header className="chat-header">
        <h2># {roomId}</h2>
        <span className="chat-header__user">@{username}</span>
      </header>
      <MessageList />
      <MessageInput />
    </div>
  );
};

export default ChatWindow;
