import { useEffect, useState } from 'react';
import { createPromotion, updatePromotion } from '../../services/api';

const today = () => new Date().toISOString().split('T')[0];

const EMPTY = {
  title: '', description: '', discount_type: 'percentage',
  discount_value: '', start_date: today(), end_date: today(),
};

const PromotionForm = ({ promotion, onSaved, onCancel }) => {
  const [form,   setForm]   = useState(EMPTY);
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!promotion) { setForm(EMPTY); return; }
    setForm({
      title:          promotion.title,
      description:    promotion.description ?? '',
      discount_type:  promotion.discount_type,
      discount_value: promotion.discount_value,
      start_date:     String(promotion.start_date).split('T')[0],
      end_date:       String(promotion.end_date).split('T')[0],
    });
  }, [promotion]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { ...form, discount_value: parseFloat(form.discount_value) };
      const saved = promotion
        ? await updatePromotion(promotion.id, payload)
        : await createPromotion(payload);
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
        Título *
        <input value={form.title} onChange={(e) => set('title', e.target.value)} required />
      </label>

      <label>
        Descripción
        <textarea value={form.description} rows={3} onChange={(e) => set('description', e.target.value)} />
      </label>

      <div className="form-row">
        <label>
          Tipo de descuento
          <select value={form.discount_type} onChange={(e) => set('discount_type', e.target.value)}>
            <option value="percentage">Porcentaje (%)</option>
            <option value="fixed">Monto fijo ($)</option>
          </select>
        </label>
        <label>
          Valor *
          <input type="number" step="0.01" min="0" value={form.discount_value}
            onChange={(e) => set('discount_value', e.target.value)} required />
        </label>
      </div>

      <div className="form-row">
        <label>
          Fecha inicio *
          <input type="date" value={form.start_date}
            onChange={(e) => set('start_date', e.target.value)} required />
        </label>
        <label>
          Fecha fin *
          <input type="date" value={form.end_date}
            onChange={(e) => set('end_date', e.target.value)} required />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
};

export default PromotionForm;
