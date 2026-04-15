import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getTopProducts } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── Custom tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      <p className="chart-tooltip__value">{payload[0].value} consultas</p>
    </div>
  );
};

// ── Truncate long product names for X axis ─────────────────────────────────────
const truncate = (str, n = 14) => (str.length > n ? `${str.slice(0, n)}…` : str);

// ── Gradient bar colours (cycles if > 10 bars) ────────────────────────────────
const COLOURS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#818cf8', '#60a5fa',
  '#34d399', '#f59e0b', '#fb923c', '#f87171', '#e879f9',
];

// ── Polling interval (ms) ─────────────────────────────────────────────────────
const POLL_MS = 10_000; // 10 seconds

// ── Component ──────────────────────────────────────────────────────────────────
const TopProductsChart = () => {
  const { businessId }      = useAuth();
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    try {
      const rows = await getTopProducts(businessId);
      setData(rows);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="top-products-chart top-products-chart--loading">
        <div className="top-products-chart__skeleton" />
      </div>
    );
  }

  return (
    <div className="top-products-chart">
      <div className="top-products-chart__header">
        <h3 className="top-products-chart__title">Productos más consultados</h3>
        <span className="top-products-chart__sub">Top 10 · se actualiza automáticamente</span>
      </div>

      {error ? (
        <p className="top-products-chart__empty">No se pudieron cargar las estadísticas.</p>
      ) : data.length === 0 ? (
        <p className="top-products-chart__empty">
          Aún no hay consultas registradas. Los datos aparecerán aquí cuando los clientes
          empiecen a preguntar por productos.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis
              dataKey="name"
              tickFormatter={(v) => truncate(v)}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={52}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLOURS[i % COLOURS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default TopProductsChart;
