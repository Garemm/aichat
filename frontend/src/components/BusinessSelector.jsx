import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const BusinessSelector = () => {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/business')
      .then((res) => {
        if (!res.ok) throw new Error('Error al obtener negocios');
        return res.json();
      })
      .then(({ data }) => setBusinesses(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <div className="join-card__logo">
            <div className="join-card__icon">💬</div>
            <span className="join-card__title">Cargando…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <div className="join-card__logo">
            <div className="join-card__icon">⚠️</div>
            <span className="join-card__title">Sin conexión</span>
            <span className="join-card__subtitle">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-card__logo">
          <div className="join-card__icon">💬</div>
          <span className="join-card__title">LLM Chat</span>
          <span className="join-card__subtitle">Elige un negocio para comenzar</span>
        </div>

        <div className="biz-list">
          {businesses.map((biz) => (
            <button
              key={biz.id}
              className="biz-btn"
              onClick={() =>
                navigate(`/chat/${biz.id}`, {
                  state: { name: biz.name, city: biz.city },
                })
              }
            >
              <div className="biz-btn__avatar">{biz.name[0]}</div>
              <div className="biz-btn__info">
                <div className="biz-btn__name">{biz.name}</div>
                {biz.city && <div className="biz-btn__meta">{biz.city}</div>}
              </div>
              <span className="biz-btn__arrow">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BusinessSelector;
