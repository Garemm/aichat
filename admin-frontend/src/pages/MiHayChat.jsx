import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { getBusinessInfo } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

// ── Chat URL helper ──────────────────────────────────────────────────────────
const getChatUrl = (chatUuid, businessId) => {
  const origin =
    import.meta.env.VITE_CHAT_BASE_URL ??
    `${window.location.protocol}//${window.location.hostname}:5173`;
  const slug = chatUuid ?? businessId;
  return `${origin}/chat/${slug}`;
};

// ── Chat link card ───────────────────────────────────────────────────────────
const ChatLinkCard = ({ chatUuid, businessId }) => {
  const { addToast }        = useToast();
  const [copied, setCopied] = useState(false);
  const canvasRef           = useRef(null);
  const chatUrl             = getChatUrl(chatUuid, businessId);
  const isLegacy            = !chatUuid;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chatUrl);
      setCopied(true);
      addToast('Link copiado al portapapeles', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('No se pudo copiar el link', 'error');
    }
  };

  const handleDownloadQR = () => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url  = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href     = url;
    link.download = `chat-qr-${chatUuid ?? businessId}.png`;
    link.click();
  };

  return (
    <div className="chat-link-card">
      <div className="chat-link-card__header">
        <div className="chat-link-card__header-left">
          <div className="chat-link-card__icon-wrap">
            <Icon name="link" size={18} />
          </div>
          <div>
            <h3 className="chat-link-card__title">Link de tu Chat 24/7</h3>
            <p className="chat-link-card__sub">Comparte este enlace o QR con tus clientes</p>
            <p className="chat-link-card__sub">Ellos podrán preguntar a cualquier hora sobre stock, productos, horarios, precios, servicios y todo lo que gustes compartir con ellos.</p>
            {isLegacy && (
              <p className="chat-link-card__sub" style={{ color: 'var(--color-warning, #d97706)', marginTop: 4 }}>
                ⚠ Este negocio fue creado antes de la actualización de chat. El enlace usa el ID interno.
              </p>
            )}
          </div>
        </div>
        <a
          href={chatUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--primary btn--sm chat-link-card__open-btn"
        >
          <Icon name="externallink" size={15} />
          Abrir chat
        </a>
      </div>

      <div className="chat-link-card__body">
        <div className="chat-link-card__url-section">
          <div className="chat-link-card__url-row">
            <span className="chat-link-card__url">{chatUrl}</span>
            <button
              className={`chat-link-card__copy-btn${copied ? ' chat-link-card__copy-btn--copied' : ''}`}
              onClick={handleCopy}
              aria-label="Copiar link"
            >
              <Icon name={copied ? 'check' : 'copy'} size={15} />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="chat-link-card__hint">
            Cualquier cliente puede abrir este link para chatear directamente con tu negocio, no necesita loguearse.
          </p>
        </div>

        <div className="chat-link-card__qr-section">
          <div className="chat-link-card__qr-frame">
            <div ref={canvasRef} style={{ display: 'none' }}>
              <QRCodeCanvas value={chatUrl} size={256} marginSize={2} fgColor="#0f172a" bgColor="#ffffff" />
            </div>
            <QRCodeSVG value={chatUrl} size={148} marginSize={1} fgColor="#0f172a" bgColor="transparent" />
          </div>
          <button className="btn btn--ghost btn--sm chat-link-card__dl-btn" onClick={handleDownloadQR}>
            <Icon name="download" size={14} />
            Descargar QR
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const MiHayChat = () => {
  const { businessId }          = useAuth();
  const { addToast }            = useToast();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getBusinessInfo()
      .then(setBusiness)
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page page--center"><Spinner size={32} /></div>;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h2>Mi hayChat</h2>
          <p className="text-muted">Tu chat de atención al cliente 24/7</p>
        </div>
      </div>
      <ChatLinkCard chatUuid={business?.chat_uuid} businessId={businessId} />
    </div>
  );
};

export default MiHayChat;
