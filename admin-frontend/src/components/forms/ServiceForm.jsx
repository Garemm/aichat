import { useEffect, useState } from 'react';
import { createService, updateService } from '../../services/api';

const EMPTY = { name: '', description: '', price: '' };

const ServiceForm = ({ service, onSaved, onCancel }) => {
  const [form,   setForm]   = useState(EMPTY);
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(service
      ? { name: service.name, description: service.description ?? '', price: service.price ?? '' }
      : EMPTY
    );
  }, [service]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: form.price !== '' ? parseFloat(form.price) : null,
      };
      const saved = service
        ? await updateService(service.id, payload)
        : await createService(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <label>
        Nombre *
        <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
      </label>

      <label>
        Descripción
        <textarea value={form.description} rows={3} onChange={(e) => set('description', e.target.value)} />
      </label>

      <label>
        Precio (dejar vacío = "Consultar")
        <input type="number" step="0.01" min="0" value={form.price}
          onChange={(e) => set('price', e.target.value)} />
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
};

export default ServiceForm;
