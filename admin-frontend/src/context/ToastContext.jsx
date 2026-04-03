import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

// ── Toast item renderer ───────────────────────────────────────────────────────
const Toast = ({ toast, onRemove }) => (
  <div className={`toast toast--${toast.type}`} role="alert">
    <span className="toast__msg">{toast.message}</span>
    <button className="toast__close" onClick={() => onRemove(toast.id)} aria-label="Cerrar">×</button>
  </div>
);

// ── Provider ──────────────────────────────────────────────────────────────────
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};
