import { useEffect, useState, useMemo } from 'react';
import { getServices, deleteService } from '../services/api';
import { useToast } from '../context/ToastContext';
import ServiceForm from '../components/forms/ServiceForm';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

const Services = () => {
  const { addToast } = useToast();
  const [services, setServices] = useState([]);
  const [editing,  setEditing]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');

  const load = () => {
    setLoading(true);
    return getServices()
      .then(setServices)
      .catch((err) => { setError(err.message); addToast(err.message, 'error'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
  }, [services, search]);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    try {
      await deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      addToast('Servicio eliminado', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleSaved = () => { setEditing(null); load(); addToast('Servicio guardado', 'success'); };

  if (editing !== null) {
    return (
      <div className="page">
        <div className="page__header">
          <h2>{editing === 'new' ? 'Nuevo servicio' : 'Editar servicio'}</h2>
          <button className="btn btn--ghost" onClick={() => setEditing(null)}>← Volver</button>
        </div>
        <ServiceForm
          service={editing === 'new' ? null : editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h2>Servicios</h2>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Nuevo
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar__search">
          <Icon name="search" size={16} className="filter-bar__icon" />
          <input
            className="filter-bar__input"
            placeholder="Buscar por nombre…"
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
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Precio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.description ?? '—'}</td>
                  <td>{s.price != null ? `$${Number(s.price).toFixed(2)}` : 'Consultar'}</td>
                  <td className="table-actions">
                    <button className="btn btn--sm" onClick={() => setEditing(s)}>
                      <Icon name="edit" size={14} /> Editar
                    </button>
                    <button className="btn btn--sm btn--danger" onClick={() => handleDelete(s.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="table-empty">
                  {services.length === 0 ? 'Sin servicios' : 'No hay coincidencias'}
                </td></tr>
              )}
            </tbody>
          </table>
          <p className="table-count">{filtered.length} de {services.length} servicios</p>
        </div>
      )}
    </div>
  );
};

export default Services;
