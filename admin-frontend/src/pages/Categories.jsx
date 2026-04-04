import { useEffect, useState, useMemo } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/api';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

// ── Inline form (create or edit) ─────────────────────────────────────────────
const CategoryForm = ({ initial, allCategories, onSave, onCancel, saving }) => {
  const [name,     setName]     = useState(initial?.name     ?? '');
  const [parentId, setParentId] = useState(initial?.parent_id ?? '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), parent_id: parentId !== '' ? Number(parentId) : null });
  };

  // Exclude self from parent options when editing
  const parentOptions = allCategories.filter((c) => !initial || c.id !== initial.id);

  return (
    <form className="cat-form" onSubmit={handleSubmit}>
      <div className="cat-form__fields">
        <div className="form-group">
          <label className="form-label">Nombre <span className="form-required">*</span></label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Bebidas, Herramientas, Papelería…"
            autoFocus
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Categoría padre <span className="form-hint">(opcional)</span></label>
          <select
            className="form-input"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">— Sin categoría padre —</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || !name.trim()}>
          {saving ? <><Spinner size={14} />&nbsp;Guardando…</> : <><Icon name="save" size={14} /> Guardar</>}
        </button>
      </div>
    </form>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────
const Categories = () => {
  const { addToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(null); // null | 'new' | { id, name, parent_id }
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');

  const load = () => {
    setLoading(true);
    return getCategories()
      .then(setCategories)
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Build quick lookup: id → name
  const nameById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, search]);

  const handleSave = async (data) => {
    setSaving(true);
    try {
      if (editing === 'new') {
        const created = await createCategory(data);
        setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        addToast('Categoría creada', 'success');
      } else {
        const updated = await updateCategory(editing.id, data);
        setCategories((prev) => prev.map((c) => c.id === updated.id ? updated : c));
        addToast('Categoría actualizada', 'success');
      }
      setEditing(null);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat) => {
    if (!confirm(`¿Eliminar "${cat.name}"?\n\nLos productos asignados a esta categoría quedarán sin categoría.`)) return;
    try {
      await deleteCategory(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      addToast('Categoría eliminada', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // ── Edit view ──────────────────────────────────────────────────────────────
  if (editing !== null) {
    return (
      <div className="page">
        <div className="page__header">
          <h2>{editing === 'new' ? 'Nueva categoría' : `Editar: ${editing.name}`}</h2>
          <button className="btn btn--ghost" onClick={() => setEditing(null)}>← Volver</button>
        </div>
        <CategoryForm
          initial={editing === 'new' ? null : editing}
          allCategories={categories}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page__header">
        <h2>Categorías</h2>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Nueva
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

      {loading ? (
        <div className="page--center"><Spinner size={28} /></div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría padre</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cat) => (
                <tr key={cat.id}>
                  <td><strong>{cat.name}</strong></td>
                  <td>
                    {cat.parent_id
                      ? <span className="cat-badge">{nameById[cat.parent_id] ?? `#${cat.parent_id}`}</span>
                      : <span className="text-muted">—</span>
                    }
                  </td>
                  <td className="table-actions">
                    <button className="btn btn--sm" onClick={() => setEditing(cat)}>
                      <Icon name="edit" size={14} /> Editar
                    </button>
                    <button className="btn btn--sm btn--danger" onClick={() => handleDelete(cat)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={3} className="table-empty">
                  {categories.length === 0 ? 'Sin categorías. Crea la primera.' : 'No hay coincidencias'}
                </td></tr>
              )}
            </tbody>
          </table>
          <p className="table-count">{filtered.length} de {categories.length} categorías</p>
        </div>
      )}
    </div>
  );
};

export default Categories;
