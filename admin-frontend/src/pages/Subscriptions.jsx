import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSubscriptions, toggleSubscription, setSubscriptionPlan } from '../services/api';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';

// ── Helpers ───────────────────────────────────────────────────────────────────
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });

// ── Toggle Switch ─────────────────────────────────────────────────────────────
const ToggleSwitch = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`sub__toggle${checked ? ' sub__toggle--on' : ''}${disabled ? ' sub__toggle--disabled' : ''}`}
  >
    <span className="sub__toggle-thumb" />
  </button>
);

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ active }) => (
  <span className={`sub__badge${active ? ' sub__badge--active' : ' sub__badge--inactive'}`}>
    <span className="sub__badge-dot" />
    {active ? 'Activa' : 'Inactiva'}
  </span>
);

// ── Search bar ────────────────────────────────────────────────────────────────
const SearchBar = ({ value, onChange }) => (
  <div className="sub__search-wrap">
    <Icon name="search" size={16} className="sub__search-icon" />
    <input
      type="text"
      placeholder="Buscar empresa..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sub__search"
    />
    {value && (
      <button className="sub__search-clear" onClick={() => onChange('')} aria-label="Limpiar búsqueda">
        <Icon name="x" size={14} />
      </button>
    )}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const Subscriptions = () => {
  const { showToast } = useToast();
  const [businesses,    setBusinesses]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [toggling,      setToggling]      = useState(null);
  const [savingPlan,    setSavingPlan]    = useState(null);   // id being saved
  const [pendingPlans,  setPendingPlans]  = useState({});     // { [bizId]: inputValue }
  const [query,         setQuery]         = useState('');
  const [filter,        setFilter]        = useState('all');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSubscriptions();
      setBusinesses(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message || 'Error al cargar empresas', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadBusinesses(); }, [loadBusinesses]);

  // ── Plan handlers ─────────────────────────────────────────────────────────
  const handlePlanInput = (bizId, value) => {
    setPendingPlans((prev) => ({ ...prev, [bizId]: value }));
  };

  const handleSavePlan = async (biz) => {
    setSavingPlan(biz.id);
    try {
      const raw = pendingPlans[biz.id];
      const newPlanId = raw === '' ? null : parseInt(raw, 10);
      if (raw !== '' && (isNaN(newPlanId) || newPlanId < 1)) {
        showToast('Ingresa un ID válido (número entero positivo) o deja el campo vacío', 'error');
        return;
      }
      await setSubscriptionPlan(biz.id, newPlanId);
      setBusinesses((prev) =>
        prev.map((b) => b.id === biz.id ? { ...b, subscription_id: newPlanId } : b)
      );
      setPendingPlans((prev) => { const n = { ...prev }; delete n[biz.id]; return n; });
      showToast('Plan actualizado', 'success');
    } catch (err) {
      showToast(err.message || 'Error al actualizar plan', 'error');
    } finally {
      setSavingPlan(null);
    }
  };

  // ── Toggle handler ────────────────────────────────────────────────────────
  const handleToggle = async (id, newValue) => {
    setToggling(id);
    try {
      const updated = await toggleSubscription(id, newValue);
      setBusinesses((prev) =>
        prev.map((b) => (b.id === id ? { ...b, is_active: updated.is_active } : b))
      );
      showToast(
        newValue ? 'Suscripción activada correctamente' : 'Suscripción desactivada',
        newValue ? 'success' : 'info'
      );
    } catch (err) {
      showToast(err.message || 'Error al actualizar', 'error');
    } finally {
      setToggling(null);
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = businesses.filter((b) => {
    const matchesQuery =
      b.name.toLowerCase().includes(query.toLowerCase()) ||
      b.email?.toLowerCase().includes(query.toLowerCase()) ||
      b.city?.toLowerCase().includes(query.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'active'   && b.is_active) ||
      (filter === 'inactive' && !b.is_active);

    return matchesQuery && matchesFilter;
  });

  const activeCount   = businesses.filter((b) =>  b.is_active).length;
  const inactiveCount = businesses.filter((b) => !b.is_active).length;

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="sub__loading">
        <Spinner size={36} />
        <p className="sub__loading-text">Cargando empresas...</p>
      </div>
    );
  }

  return (
    <div className="sub">
      {/* ── Header ── */}
      <div className="sub__header">
        <div>
          <h1 className="sub__title">Gestión de Suscripciones</h1>
          <p className="sub__subtitle">
            Activa o desactiva el acceso de las empresas registradas en la plataforma.
          </p>
        </div>

        {/* Summary chips */}
        <div className="sub__stats">
          <div className="sub__stat sub__stat--active">
            <span className="sub__stat-num">{activeCount}</span>
            <span className="sub__stat-label">Activas</span>
          </div>
          <div className="sub__stat sub__stat--inactive">
            <span className="sub__stat-num">{inactiveCount}</span>
            <span className="sub__stat-label">Inactivas</span>
          </div>
          <div className="sub__stat">
            <span className="sub__stat-num">{businesses.length}</span>
            <span className="sub__stat-label">Total</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="sub__toolbar">
        <SearchBar value={query} onChange={setQuery} />

        <div className="sub__filters">
          {['all', 'active', 'inactive'].map((f) => (
            <button
              key={f}
              className={`sub__filter-btn${filter === f ? ' sub__filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : 'Inactivas'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="sub__empty">
          <Icon name="search" size={40} className="sub__empty-icon" />
          <p className="sub__empty-title">Sin resultados</p>
          <p className="sub__empty-desc">
            {query ? `No se encontraron empresas con "${query}".` : 'No hay empresas para mostrar.'}
          </p>
        </div>
      ) : (
        <div className="sub__card">
          <div className="sub__table-wrap">
            <table className="sub__table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Categoría</th>
                  <th>Ciudad</th>
                  <th>Registro</th>
                  <th>Plan (ID)</th>
                  <th>Estado</th>
                  <th className="sub__th-center">Acceso</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((biz) => (
                    <motion.tr
                      key={biz.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className={`sub__row${biz.is_active ? '' : ' sub__row--inactive'}`}
                    >
                      <td className="sub__td-name">
                        <div className="sub__biz-name">{biz.name}</div>
                        {biz.email && <div className="sub__biz-email">{biz.email}</div>}
                      </td>
                      <td>
                        <span className="sub__category">{capitalize(biz.category_name)}</span>
                      </td>
                      <td className="sub__td-city">{biz.city || '—'}</td>
                      <td className="sub__td-date">{formatDate(biz.created_at)}</td>
                      <td className="sub__td-plan">
                        <div className="sub__plan-wrap">
                          <input
                            type="number"
                            min="1"
                            className="sub__plan-input"
                            placeholder="—"
                            value={pendingPlans[biz.id] !== undefined
                              ? pendingPlans[biz.id]
                              : (biz.subscription_id ?? '')}
                            onChange={(e) => handlePlanInput(biz.id, e.target.value)}
                            disabled={savingPlan === biz.id}
                          />
                          {pendingPlans[biz.id] !== undefined &&
                           pendingPlans[biz.id] !== String(biz.subscription_id ?? '') && (
                            <button
                              className="btn btn--primary btn--sm sub__plan-save"
                              onClick={() => handleSavePlan(biz)}
                              disabled={savingPlan === biz.id}
                            >
                              {savingPlan === biz.id ? <Spinner size={13} /> : 'Guardar'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadge active={biz.is_active} />
                      </td>
                      <td className="sub__td-toggle">
                        <ToggleSwitch
                          checked={biz.is_active}
                          onChange={(val) => handleToggle(biz.id, val)}
                          disabled={toggling === biz.id}
                        />
                        {toggling === biz.id && (
                          <span className="sub__toggle-spinner"><Spinner size={14} /></span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <div className="sub__table-footer">
            Mostrando {filtered.length} de {businesses.length} empresas
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
