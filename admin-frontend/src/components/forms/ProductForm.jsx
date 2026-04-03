import { useEffect, useState } from 'react';
import { createProduct, updateProduct, getProduct } from '../../services/api';

const EMPTY = {
  name: '', description: '', price: '', category_id: '',
  is_available: true, stock_quantity: 0, attributes: [],
};

const ProductForm = ({ product, categories, onSaved, onCancel }) => {
  const [form,   setForm]   = useState(EMPTY);
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) { setForm(EMPTY); return; }
    // Load full product with attributes from API
    getProduct(product.id).then((full) => {
      setForm({
        name:           full.name,
        description:    full.description ?? '',
        price:          full.price,
        category_id:    full.category_id ?? '',
        is_available:   full.is_available,
        stock_quantity: full.stock_quantity,
        attributes:     full.attributes ?? [],
      });
    });
  }, [product]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // ── Attribute helpers ────────────────────────────────────────────────────
  const addAttr  = () => setForm((f) => ({ ...f, attributes: [...f.attributes, { key: '', value: '' }] }));
  const removeAttr = (i) => setForm((f) => ({
    ...f, attributes: f.attributes.filter((_, idx) => idx !== i),
  }));
  const setAttr = (i, field, val) => setForm((f) => ({
    ...f,
    attributes: f.attributes.map((a, idx) => idx === i ? { ...a, [field]: val } : a),
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        price:          parseFloat(form.price),
        category_id:    form.category_id ? parseInt(form.category_id, 10) : null,
        stock_quantity: parseInt(form.stock_quantity, 10),
      };
      const saved = product
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);
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

      <div className="form-row">
        <label>
          Precio *
          <input type="number" step="0.01" min="0" value={form.price}
            onChange={(e) => set('price', e.target.value)} required />
        </label>
        <label>
          Stock
          <input type="number" min="0" value={form.stock_quantity}
            onChange={(e) => set('stock_quantity', e.target.value)} />
        </label>
      </div>

      <label>
        Categoría
        <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
          <option value="">— Sin categoría —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <label className="form-check">
        <input type="checkbox" checked={form.is_available}
          onChange={(e) => set('is_available', e.target.checked)} />
        Disponible
      </label>

      <fieldset className="attrs-fieldset">
        <legend>Atributos</legend>
        {form.attributes.map((attr, i) => (
          <div className="attr-row" key={i}>
            <input placeholder="Clave" value={attr.key}
              onChange={(e) => setAttr(i, 'key', e.target.value)} />
            <input placeholder="Valor" value={attr.value}
              onChange={(e) => setAttr(i, 'value', e.target.value)} />
            <button type="button" className="btn btn--sm btn--danger" onClick={() => removeAttr(i)}>✕</button>
          </div>
        ))}
        <button type="button" className="btn btn--ghost btn--sm" onClick={addAttr}>+ Atributo</button>
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
};

export default ProductForm;
