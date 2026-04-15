import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon        from '../components/ui/Icon';
import Spinner     from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext';
import { getTodaysOrders, setAceptaPedidos, updateOrder } from '../services/api';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── ToggleSwitch ──────────────────────────────────────────────────────────────
const ToggleSwitch = ({ checked, onChange, disabled, label }) => (
  <label className="orders__toggle-wrap" aria-label={label}>
    <span className="orders__toggle-label">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`orders__toggle${checked ? ' orders__toggle--on' : ''}`}
    >
      <motion.span
        className="orders__toggle-thumb"
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      />
    </button>
  </label>
);

// ── StatusBadge ───────────────────────────────────────────────────────────────
const StatusBadge = ({ aceptado, rechazado }) => {
  if (rechazado) return <span className="orders__badge orders__badge--declined">Rechazado</span>;
  if (aceptado)  return <span className="orders__badge orders__badge--accepted">Aceptado</span>;
  return <span className="orders__badge orders__badge--pending">Pendiente</span>;
};

// ── ConfirmModal ──────────────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onCancel, loading, confirmLabel = 'Sí, liberar', loadingLabel = 'Liberando…' }) => (
  <div className="orders__modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
    <motion.div
      className="orders__modal orders__modal--confirm"
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1,    y: 0  }}
      exit={{    opacity: 0, scale: 0.94, y: 12 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="orders__confirm-msg">{message}</p>
      <div className="orders__confirm-btns">
        <button className="btn btn--ghost btn--sm" onClick={onCancel} disabled={loading}>No</button>
        <button className="btn btn--success btn--sm" onClick={onConfirm} disabled={loading}>
          {loading ? <><Spinner size={13} />&nbsp;{loadingLabel}</> : confirmLabel}
        </button>
      </div>
    </motion.div>
  </div>
);

// ── OrderModal ────────────────────────────────────────────────────────────
const OrderModal = ({ order, onClose, onSave, saving }) => {
  const [decision,   setDecision]   = useState(null); // null | 'accept' | 'reject'
  const [notasAdmin, setNotasAdmin] = useState(order.notas_admin || '');
  const isPending = order.aceptado !== true && !order.rechazado;

  return (
    <div className="orders__modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <motion.div
        className="orders__modal"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{    opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="orders__modal-header">
          <h3 className="orders__modal-title">Pedido #{order.id}</h3>
          <button className="orders__modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Info rows */}
        <div className="orders__modal-body">
          <div className="orders__modal-info">
            <div className="orders__modal-field">
              <span className="orders__modal-label">Cliente</span>
              <span className="orders__modal-value">{order.nombre_cliente}</span>
            </div>
            <div className="orders__modal-field">
              <span className="orders__modal-label">Teléfono</span>
              <span className="orders__modal-value">{order.telefono}</span>
            </div>
            <div className="orders__modal-field">
              <span className="orders__modal-label">Hora de recogida</span>
              <span className="orders__modal-value">{order.hora_recogida}</span>
            </div>
            <div className="orders__modal-field">
              <span className="orders__modal-label">Llegada</span>
              <span className="orders__modal-value">{fmtTime(order.created_at)}</span>
            </div>
          </div>

          {/* Read-only detail */}
          <div className="orders__modal-field orders__modal-field--full">
            <span className="orders__modal-label">Detalle del pedido</span>
            <p className="orders__modal-readonly">{order.detalle_pedido || '—'}</p>
          </div>

          {/* Admin notes */}
          <label className="orders__modal-field orders__modal-field--full">
            <span className="orders__modal-label">Notas del administrador</span>
            <textarea
              className="orders__modal-textarea"
              rows={3}
              placeholder="Escribe notas al cliente sobre este pedido (opcional)"
              value={notasAdmin}
              onChange={(e) => setNotasAdmin(e.target.value)}
            />
          </label>

          {/* Status: editable buttons if still pending, read-only badge if already decided */}
          <div className="orders__modal-field orders__modal-field--full">
            <span className="orders__modal-label">Estado</span>
            {isPending ? (
              <div className="orders__modal-state-btns">
                <button
                  className={`orders__modal-state-btn orders__modal-state-btn--accept${decision === 'accept' ? ' orders__modal-state-btn--active' : ''}`}
                  onClick={() => setDecision('accept')}
                >
                  <Icon name="check" size={15} /> Aceptar
                </button>
                <button
                  className={`orders__modal-state-btn orders__modal-state-btn--decline${decision === 'reject' ? ' orders__modal-state-btn--active' : ''}`}
                  onClick={() => setDecision('reject')}
                >
                  <Icon name="x" size={15} /> Rechazar
                </button>
              </div>
            ) : (
              <StatusBadge aceptado={order.aceptado} rechazado={order.rechazado} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="orders__modal-footer">
          <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => {
              if (isPending) {
                if (decision === 'accept') onSave({ aceptado: true, notas_admin: notasAdmin });
                else if (decision === 'reject') onSave({ rechazado: true, notas_admin: notasAdmin });
              } else {
                onSave({ notas_admin: notasAdmin });
              }
            }}
            disabled={saving || (isPending && decision === null)}
            title={isPending && decision === null ? 'Selecciona Aceptar o Rechazar primero' : undefined}
          >
            {saving ? <><Spinner size={13} />&nbsp;Guardando…</> : 'Guardar cambios'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Row variants ──────────────────────────────────────────────────────────────
const rowVariants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.15 } },
};

// ── Component ─────────────────────────────────────────────────────────────────
const REFRESH_INTERVAL = 10_000; // 10 seconds

export default function Pedidos() {
  const { showToast } = useToast();

  const [orders,        setOrders]        = useState([]);
  const [aceptaPedidos, setAceptaPedidosState] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [toggling,      setToggling]      = useState(false);
  const [search,        setSearch]        = useState('');
  const [lastFetched,   setLastFetched]   = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [savingOrder,   setSavingOrder]   = useState(false);
  const [liberarOrder,  setLiberarOrder]  = useState(null);  // order pending confirmation
  const [liberating,    setLiberating]    = useState(false);
  const [listoOrder,    setListoOrder]    = useState(null);  // order pending "pedido listo" confirmation
  const [markingListo,  setMarkingListo]  = useState(false);

  const knownIdsRef     = useRef(new Set());
  // Always points to latest fetch function without recreating interval
  const fetchOrdersRef  = useRef(null);

  // Define as plain function assigned to ref on every render
  fetchOrdersRef.current = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getTodaysOrders();
      const incoming = data.orders ?? [];
      if (silent && knownIdsRef.current.size > 0) {
        const newOnes = incoming.filter((o) => !knownIdsRef.current.has(o.id));
        if (newOnes.length > 0) {
          showToast(
            `¡${newOnes.length} nuevo${newOnes.length > 1 ? 's pedidos' : ' pedido'} recibido!`,
            'success'
          );
        }
      }
      knownIdsRef.current = new Set(incoming.map((o) => o.id));
      setOrders(incoming);
      setAceptaPedidosState(data.acepto_pedidos ?? false);
      setLastFetched(new Date());
    } catch (err) {
      if (!silent) showToast(err.message || 'Error al cargar pedidos', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchOrders = useCallback((silent = false) => fetchOrdersRef.current(silent), []);

  // Start interval exactly once — ref always has latest function so no stale closure
  useEffect(() => {
    fetchOrdersRef.current(false);
    const timer = setInterval(() => fetchOrdersRef.current(true), REFRESH_INTERVAL);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchOrdersRef.current(true); };
    const onFocus   = () => fetchOrdersRef.current(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleAceptaPedidos = async (value) => {
    setToggling(true);
    try {
      await setAceptaPedidos(value);
      setAceptaPedidosState(value);
      showToast(
        value ? 'Ahora estás aceptando pedidos' : 'Ya no estás aceptando pedidos',
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Error al actualizar', 'error');
    } finally {
      setToggling(false);
    }
  };

  const handleSaveOrder = async (changes) => {
    if (!selectedOrder) return;
    setSavingOrder(true);
    try {
      const { order } = await updateOrder(selectedOrder.id, changes);
      setOrders((prev) => prev.map((o) => o.id === order.id ? order : o));
      showToast('Pedido actualizado', 'success');
    } catch (err) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSavingOrder(false);
      setSelectedOrder(null);
    }
  };

  const handleMarkListo = async () => {
    if (!listoOrder) return;
    setMarkingListo(true);
    try {
      const { order } = await updateOrder(listoOrder.id, { pedido_listo: true });
      setOrders((prev) => prev.map((o) => o.id === order.id ? order : o));
      showToast('Pedido marcado como listo', 'success');
    } catch (err) {
      showToast(err.message || 'Error al marcar pedido', 'error');
    } finally {
      setMarkingListo(false);
      setListoOrder(null);
    }
  };

  const handleLiberarOrder = async () => {
    if (!liberarOrder) return;
    setLiberating(true);
    try {
      await updateOrder(liberarOrder.id, { liberado: true });
      setOrders((prev) => prev.filter((o) => o.id !== liberarOrder.id));
      showToast('Pedido liberado', 'success');
    } catch (err) {
      showToast(err.message || 'Error al liberar', 'error');
    } finally {
      setLiberating(false);
      setLiberarOrder(null);
    }
  };

  // ── filtered list ─────────────────────────────────────────────────────────
  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.nombre_cliente || '').toLowerCase().includes(q) ||
      (o.telefono       || '').toLowerCase().includes(q) ||
      (o.detalle_pedido || '').toLowerCase().includes(q)
    );
  });

  // ── stats ─────────────────────────────────────────────────────────────────
  const totalHoy   = orders.length;
  const aceptados  = orders.filter((o) => o.aceptado).length;
  const rechazados = orders.filter((o) => o.rechazado).length;
  const pendientes = totalHoy - aceptados - rechazados;

  return (
    <section className="orders">
      {/* ── Order detail modal ── */}
      <AnimatePresence>
        {selectedOrder && (
          <OrderModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onSave={handleSaveOrder}
            saving={savingOrder}
          />
        )}
      </AnimatePresence>

      {/* ── Pedido listo confirm dialog ── */}
      <AnimatePresence>
        {listoOrder && (
          <ConfirmModal
            message={`¿Marcar el pedido #${listoOrder.id} como listo?`}
            onConfirm={handleMarkListo}
            onCancel={() => setListoOrder(null)}
            loading={markingListo}
            confirmLabel="Sí, está listo"
            loadingLabel="Marcando…"
          />
        )}
      </AnimatePresence>

      {/* ── Liberar confirm dialog ── */}
      <AnimatePresence>
        {liberarOrder && (
          <ConfirmModal
            message={`¿Está seguro que desea liberar el pedido #${liberarOrder.id}?`}
            onConfirm={handleLiberarOrder}
            onCancel={() => setLiberarOrder(null)}
            loading={liberating}
          />
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="orders__header">
        <div className="orders__header-left">
          <h1 className="orders__title">
            <Icon name="orders" size={22} className="orders__title-icon" />
            Pedidos de hoy
          </h1>
          {lastFetched && (
            <span className="orders__last-refresh">
              Actualizado: {fmtTime(lastFetched.toISOString())}
            </span>
          )}
        </div>

        <div className="orders__header-right">
          {/* Acepto pedidos toggle */}
          <ToggleSwitch
            checked={aceptaPedidos}
            onChange={handleToggleAceptaPedidos}
            disabled={toggling || loading}
            label={aceptaPedidos ? 'Acepto pedidos' : 'No acepto pedidos'}
          />

          {/* Manual refresh */}
          <motion.button
            className="orders__refresh-btn"
            onClick={() => fetchOrders()}
            disabled={loading}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
            title="Actualizar"
          >
            <Icon name="download" size={16} />
            Actualizar
          </motion.button>
        </div>
      </div>

      {/* ── Stat chips ── */}
      <div className="orders__stats">
        {[
          { label: 'Total hoy',  value: totalHoy,   color: 'blue'   },
          { label: 'Aceptados',  value: aceptados,  color: 'green'  },
          { label: 'Rechazados', value: rechazados, color: 'red'    },
          { label: 'Pendientes', value: pendientes, color: 'yellow' },
        ].map((s) => (
          <div key={s.label} className={`orders__stat-chip orders__stat-chip--${s.color}`}>
            <span className="orders__stat-value">{s.value}</span>
            <span className="orders__stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Search bar ── */}
      <div className="orders__toolbar">
        <div className="orders__search-wrap">
          <Icon name="search" size={16} className="orders__search-icon" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono o detalle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="orders__search"
          />
          {search && (
            <button className="orders__search-clear" onClick={() => setSearch('')} aria-label="Limpiar">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="orders__loader">
          <Spinner />
        </div>
      ) : (
        <div className="orders__table-wrap">
          {filtered.length === 0 ? (
            <motion.div
              className="orders__empty"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <Icon name="orders" size={40} className="orders__empty-icon" />
              <p className="orders__empty-title">
                {search ? 'Sin resultados para tu búsqueda' : 'No hay pedidos para hoy'}
              </p>
              <p className="orders__empty-sub">
                {search
                  ? 'Prueba con otros términos'
                  : 'Los pedidos aparecerán aquí en cuanto lleguen'}
              </p>
            </motion.div>
          ) : (
            <table className="orders__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Detalle del pedido</th>
                  <th>Hora llegada</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <AnimatePresence mode="popLayout">
                <tbody>
                  {filtered.map((order) => (
                    <motion.tr
                      key={order.id}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                    >
                      <td className="orders__col-id">{order.id}</td>
                      <td className="orders__col-name">{order.nombre_cliente || '—'}</td>
                      <td className="orders__col-phone">{order.telefono || '—'}</td>
                      <td className="orders__col-detail">{order.detalle_pedido || '—'}</td>
                      <td className="orders__col-time">{fmtTime(order.created_at)}</td>
                      <td><StatusBadge aceptado={order.aceptado} rechazado={order.rechazado} /></td>
                      <td>
                        <div className="orders__row-actions">
                          <button
                            className="btn btn--ghost btn--sm orders__action-btn"
                            onClick={() => setSelectedOrder(order)}
                            title="Ver / editar pedido"
                          >
                            <Icon name="edit" size={14} />
                          </button>
                          {order.aceptado === true && !order.pedido_listo && (
                            <button
                              className="btn btn--warning btn--sm orders__action-btn"
                              onClick={() => setListoOrder(order)}
                              title="Marcar como pedido listo"
                            >
                              <Icon name="check" size={14} /> Pedido listo
                            </button>
                          )}
                          {order.aceptado === true && order.pedido_listo && (
                            <span className="orders__listo-badge">
                              <Icon name="check" size={13} /> Listo
                            </span>
                          )}
                          {(order.aceptado || order.rechazado) && (
                            <button
                              className="btn btn--success btn--sm orders__action-btn"
                              onClick={() => setLiberarOrder(order)}
                              title="Liberar pedido"
                            >
                              <Icon name="check" size={14} /> Liberar pedido
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </AnimatePresence>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
