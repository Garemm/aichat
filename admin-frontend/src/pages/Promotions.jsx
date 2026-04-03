import { useEffect, useState, useMemo } from 'react';
import { getPromotions, deletePromotion } from '../services/api';
import { useToast } from '../context/ToastContext';
import PromotionForm from '../components/forms/PromotionForm';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

const fmt = (d) => new Date(d).toLocaleDateString('es-MX');

const Promotions = () => {
  const { addToast }   = useToast();
  const [promotions, setPromotions] = useState([]);
  const [editing,    setEditing]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');

  const load = () => {
    setLoading(true);
    return getPromotions()
      .then(setPromotions)
      .catch((err) => { setError(err.message); addToast(err.message, 'error'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? promotions.filter((p) => p.title.toLowerCase().includes(q)) : promotions;
  }, [promotions, search]);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta promoción?')) return;
    try {
      await deletePromotion(id);
      setPromotions((prev) => prev.filter((p) => p.id !== id));
      addToast('Promoción eliminada', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleSaved = () => { setEditing(null); load(); addToast('Promoción guardada', 'success'); };

  if (editing !== null) {
    return (
      <div className="page">
        <div className="page__header">
          <h2>{editing === 'new' ? 'Nueva promoción' : 'Editar promoción'}</h2>
          <button className="btn btn--ghost" onClick={() => setEditing(null)}>← Volver</button>
        </div>
        <PromotionForm
          promotion={editing === 'new' ? null : editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h2>Promociones</h2>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Nueva
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar__search">
          <Icon name="search" size={16} className="filter-bar__icon" />
          <input
            className="filter-bar__input"
            placeholder="Buscar por título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button className="btn btn--ghost btn--sm" onClick={() => setSearch('')}>Limpiar</button>
        )}
      </div>

      {error && <p className="page-error">{error}</p>}

      {loading ? (
        <div className="page--center"><Spinner size={28} /></div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Descuento</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.title}</strong></td>
                  <td>
                    <span className="badge badge--primary">
                      {p.discount_type === 'percentage'
                        ? `${p.discount_value}%`
                        : `$${Number(p.discount_value).toFixed(2)}`}
                    </span>
                  </td>
                  <td>{fmt(p.start_date)}</td>
                  <td>{fmt(p.end_date)}</td>
                  <td className="table-actions">
                    <button className="btn btn--sm" onClick={() => setEditing(p)}>
                      <Icon name="edit" size={14} /> Editar
                    </button>
                    <button className="btn btn--sm btn--danger" onClick={() => handleDelete(p.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="table-empty">
                  {promotions.length === 0 ? 'Sin promociones' : 'No hay coincidencias'}
                </td></tr>
              )}
            </tbody>
          </table>
          <p className="table-count">{filtered.length} de {promotions.length} promociones</p>
        </div>
      )}
    </div>
  );
};

export default Promotions;
