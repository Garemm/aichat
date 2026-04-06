import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { getDashboard } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';
import TopProductsChart from '../components/ui/TopProductsChart';

// ── Chat URL helper ──────────────────────────────────────────────────────────
// Uses VITE_CHAT_BASE_URL env var if set; otherwise infers from current hostname
// so it works both locally (port 5173) and in production.
const getChatUrl = (businessId) => {
  const origin =
    import.meta.env.VITE_CHAT_BASE_URL ??
`${window.location.protocol}//${window.location.hostname}:5173`;
  return `${origin}/chat/${businessId}`;
};

// ── Stat card ────────────────────────────────────────────────────────────────
const STAT_CONFIG = [
  { key: 'products',   label: 'Productos',   icon: 'products',   color: 'indigo'  },
  { key: 'services',   label: 'Servicios',   icon: 'services',   color: 'emerald' },
  { key: 'promotions', label: 'Promociones', icon: 'promotions', color: 'amber'   },
];

const StatCard = ({ label, value, icon, color }) => (
  <div className={`stat-card stat-card--${color}`}>
    <div className="stat-card__icon"><Icon name={icon} size={22} /></div>
    <div className="stat-card__body">
      <span className="stat-card__value">{value ?? '—'}</span>
      <span className="stat-card__label">{label}</span>
    </div>
  </div>
);

// ── Chat link card ───────────────────────────────────────────────────────────
const ChatLinkCard = ({ businessId }) => {
  const { addToast }    = useToast();
  const [copied, setCopied] = useState(false);
  const canvasRef           = useRef(null);
  const chatUrl             = getChatUrl(businessId);

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
    link.download = `chat-qr-${businessId}.png`;
    link.click();
  };

  return (
    <div className="chat-link-card">
      {/* Header */}
      <div className="chat-link-card__header">
        <div className="chat-link-card__header-left">
          <div className="chat-link-card__icon-wrap">
            <Icon name="link" size={18} />
          </div>
          <div>
            <h3 className="chat-link-card__title">Link de tu Chat 27/7</h3>
            <p className="chat-link-card__sub">Comparte este enlace o QR con tus clientes</p>
            <p className="chat-link-card__sub">Ellos podrán preguntar a cualquier hora sobre stock, productos, horarios, precios, servicios y todo lo que gustes compartir con ellos.</p>
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

      {/* Body */}
      <div className="chat-link-card__body">
        {/* URL row */}
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

        {/* QR code */}
        <div className="chat-link-card__qr-section">
          <div className="chat-link-card__qr-frame">
            {/* Hidden canvas for download */}
            <div ref={canvasRef} style={{ display: 'none' }}>
              <QRCodeCanvas
                value={chatUrl}
                size={256}
                marginSize={2}
                fgColor="#0f172a"
                bgColor="#ffffff"
              />
            </div>
            {/* Visible SVG */}
            <QRCodeSVG
              value={chatUrl}
              size={148}
              marginSize={1}
              fgColor="#0f172a"
              bgColor="transparent"
            />
          </div>
          <button
            className="btn btn--ghost btn--sm chat-link-card__dl-btn"
            onClick={handleDownloadQR}
          >
            <Icon name="download" size={14} />
            Descargar QR
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { businessId } = useAuth();
  const { addToast }   = useToast();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page page--center"><Spinner size={32} /></div>;
  if (!data)   return null;

  const { business, stats } = data;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h2>{business.name}</h2>
          <p className="text-muted">{business.city} &middot; {business.category}</p>
        </div>
      </div>

      <div className="stats-grid">
        {STAT_CONFIG.map(({ key, label, icon, color }) => (
          <StatCard key={key} label={label} value={stats[key]} icon={icon} color={color} />
        ))}
      </div>

      {business.description && (
        <div className="dashboard__desc">
          <p>{business.description}</p>
        </div>
      )}

      <TopProductsChart />

      <ChatLinkCard businessId={businessId} />
    </div>
  );
};

export default Dashboard;

