import { useEffect, useState } from 'react';
import { updateBusiness } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Spinner from '../ui/Spinner';

const CATEGORIES = ['restaurant', 'hardware', 'stationery', 'pharmacy', 'clothing', 'other'];

const BusinessForm = ({ business, onSaved, onCancel }) => {
  const { addToast } = useToast();
  const [form,   setForm]   = useState({ name: '', category: '', description: '', city: '', email: '', phone: '', webpage_link: '' });
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (business) {
      setForm({
        name:         business.name,
        category:     business.category,
        description:  business.description ?? '',
        city:         business.city ?? '',
        email:        business.email ?? '',
        phone:        business.phone ?? '',
        webpage_link: business.webpage_link ?? '',
      });
    }
  }, [business]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const saved = await updateBusiness(form);
      addToast('Información actualizada correctamente', 'success');
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-group">
        <label className="form-label">Nombre del negocio *</label>
        <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Ej. Ferretería López" />
      </div>

      <div className="form-group">
        <label className="form-label">Categoría *</label>
        <select className="form-input" value={form.category} onChange={(e) => set('category', e.target.value)} required>
          <option value="">Selecciona una categoría</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Ciudad</label>
        <input className="form-input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Ej. Ciudad de México" />
      </div>

      <div className="form-group">
        <label className="form-label">Descripción</label>
        <textarea className="form-input form-textarea" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Breve descripción del negocio…" />
      </div>

      <div className="form-group">
        <label className="form-label">Email</label>
        <input className="form-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Ej. contacto@minegocio.mx" />
      </div>

      <div className="form-group">
        <label className="form-label">Teléfono</label>
        <input className="form-input" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="Ej. +52 55 1234 5678" />
      </div>

      <div className="form-group">
        <label className="form-label">Página web</label>
        <input className="form-input" type="url" value={form.webpage_link} onChange={(e) => set('webpage_link', e.target.value)} placeholder="Ej. https://www.minegocio.mx" />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <Spinner size={16} /> : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
};

export default BusinessForm;
