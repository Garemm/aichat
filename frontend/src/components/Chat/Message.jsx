const Message = ({ message, currentUser }) => {
  const isMine = message.sender === currentUser;

  return (
    <div className={`message ${isMine ? 'message--mine' : 'message--theirs'}`}>
      {!isMine && <span className="message__sender">{message.sender}</span>}
      <p className="message__text" style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
      <span className="message__time">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
};

export default Message;
