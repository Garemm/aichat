import { useState } from 'react';
import { ChatProvider, useChat } from './context/ChatContext';
import ChatWindow from './components/Chat/ChatWindow';

/**
 * AppContent — inner component so it can access ChatContext.
 *
 * This join screen is intentionally simple (no auth).
 * When you add authentication later:
 *   1. Replace this form with a proper Login/Register flow
 *   2. Store the JWT in memory (not localStorage) or an httpOnly cookie
 *   3. Pass the token to socketService.connect({ auth: { token } })
 */
const AppContent = () => {
  const { username, setUsername, setRoomId } = useChat();
  const [form, setForm] = useState({ name: '', room: 'general' });

  if (!username) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <h1>LLM Chat</h1>
          <input
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={30}
          />
          <input
            placeholder="Room (e.g. general)"
            value={form.room}
            onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
            maxLength={50}
          />
          <button
            disabled={!form.name.trim()}
            onClick={() => {
              setUsername(form.name.trim());
              setRoomId(form.room.trim() || 'general');
            }}
          >
            Join Chat
          </button>
        </div>
      </div>
    );
  }

  return <ChatWindow />;
};

const App = () => (
  <ChatProvider>
    <AppContent />
  </ChatProvider>
);

export default App;
