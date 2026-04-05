import { useEffect, useState, useMemo } from 'react';
import { getProducts, deleteProduct, getCategories } from '../services/api';
import { useToast } from '../context/ToastContext';
import ProductForm from '../components/forms/ProductForm';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

const Products = () => {
  const { addToast }   = useToast();
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing,    setEditing]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');
  const [minPrice,   setMinPrice]   = useState('');
  const [maxPrice,   setMaxPrice]   = useState('');
  const [availFilter,setAvailFilter]= useState('');

  const load = () => {
    setLoading(true);
    return Promise.all([getProducts(), getCategories()])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .catch((err) => { setError(err.message); addToast(err.message, 'error'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (catFilter && p.category_id !== parseInt(catFilter, 10)) return false;
      if (minPrice  && Number(p.price) < parseFloat(minPrice)) return false;
      if (maxPrice  && Number(p.price) > parseFloat(maxPrice)) return false;
      if (availFilter === 'true'  && !p.is_available) return false;
      if (availFilter === 'false' &&  p.is_available) return false;
      return true;
    });
  }, [products, search, catFilter, minPrice, maxPrice, availFilter]);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      addToast('Producto eliminado', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleSaved = () => { setEditing(null); load(); addToast('Producto guardado', 'success'); };

  if (editing !== null) {
    return (
      <div className="page">
        <div className="page__header">
          <h2>{editing === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2>
          <button className="btn btn--ghost" onClick={() => setEditing(null)}>← Volver</button>
        </div>
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h2>Productos</h2>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Nuevo
        </button>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
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
        <select className="filter-bar__select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="number"
          className="filter-bar__input filter-bar__input--short"
          placeholder="Precio min"
          value={minPrice}
          min={0}
          onChange={(e) => setMinPrice(e.target.value)}
        />
        <input
          type="number"
          className="filter-bar__input filter-bar__input--short"
          placeholder="Precio max"
          value={maxPrice}
          min={0}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
        <select className="filter-bar__select" value={availFilter} onChange={(e) => setAvailFilter(e.target.value)}>
          <option value="">Disponibilidad</option>
          <option value="true">Disponible</option>
          <option value="false">No disponible</option>
        </select>
        {(search || catFilter || minPrice || maxPrice || availFilter) && (
          <button className="btn btn--ghost btn--sm" onClick={() => {
            setSearch(''); setCatFilter(''); setMinPrice(''); setMaxPrice(''); setAvailFilter('');
          }}>Limpiar</button>
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
                <th>Código de ítem</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Disponible</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.item_code_empresa ?? '—'}</td>
                  <td>{p.category_name ?? '—'}</td>
                  <td>${Number(p.price).toFixed(2)}</td>
                  <td>{p.stock_quantity}</td>
                  <td>
                    <span className={`badge ${p.is_available ? 'badge--success' : 'badge--muted'}`}>
                      {p.is_available ? 'Disponible' : 'No disponible'}
                    </span>
                  </td>
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
                <tr><td colSpan={7} className="table-empty">
                  {products.length === 0 ? 'Sin productos' : 'No hay coincidencias'}
                </td></tr>
              )}
            </tbody>
          </table>
          <p className="table-count">{filtered.length} de {products.length} productos</p>
        </div>
      )}
    </div>
  );
};

export default Products;
