import { useEffect, useState } from 'react';
import { getBusinessInfo } from '../services/api';
import { useToast } from '../context/ToastContext';
import BusinessForm from '../components/forms/BusinessForm';
import Spinner from '../components/ui/Spinner';

const BusinessInfo = () => {
  const { addToast } = useToast();
  const [business, setBusiness] = useState(null);
  const [editing,  setEditing]  = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getBusinessInfo()
      .then(setBusiness)
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (updated) => {
    setBusiness(updated);
    setEditing(false);
  };

  if (loading) return <div className="page page--center"><Spinner size={32} /></div>;
  if (!business) return null;

  if (editing) {
    return (
      <div className="page">
        <div className="page__header">
          <h2>Editar información</h2>
          <button className="btn btn--ghost" onClick={() => setEditing(false)}>← Volver</button>
        </div>
        <BusinessForm
          business={business}
          onSaved={handleSaved}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h2>Información del negocio</h2>
        <button className="btn btn--primary" onClick={() => setEditing(true)}>Editar</button>
      </div>
      <div className="info-card">
        <Row label="Nombre"      value={business.name}        />
        <Row label="Categoría"   value={business.category}    />
        <Row label="Ciudad"      value={business.city}        />
        <Row label="Descripción" value={business.description} />
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="info-row">
    <span className="info-row__label">{label}</span>
    <span className="info-row__value">{value ?? '—'}</span>
  </div>
);

export default BusinessInfo;
