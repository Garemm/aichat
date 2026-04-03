import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const BusinessSelector = () => {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/api/business`)
      .then((res) => {
        if (!res.ok) throw new Error('Error al obtener negocios');
        return res.json();
      })
      .then(({ data }) => setBusinesses(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="join-screen"><p>Cargando negocios…</p></div>;
  if (error)   return <div className="join-screen"><p>Error: {error}</p></div>;

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1>Selecciona un negocio</h1>
        {businesses.map((biz) => (
          <button
            key={biz.id}
            onClick={() => navigate(`/chat/${biz.id}`)}
          >
            {biz.name}
            {biz.city ? ` — ${biz.city}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
};

export default BusinessSelector;
