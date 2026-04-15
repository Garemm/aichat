import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getTrafficByHour } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── Helpers ────────────────────────────────────────────────────────────────────
const padHour = (h) => String(h).padStart(2, '0') + 'h';

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

// ── Polling interval ──────────────────────────────────────────────────────────
const POLL_MS = 10_000; // 10 seconds

// ── Component ──────────────────────────────────────────────────────────────────
const TrafficByHourChart = () => {
  const { businessId }        = useAuth();
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    try {
      const rows = await getTrafficByHour(businessId);
      setData(rows.map((r) => ({ ...r, label: padHour(r.hour) })));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

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

  const hasData = data.some((d) => d.count > 0);

  return (
    <div className="top-products-chart">
      <div className="top-products-chart__header">
        <h3 className="top-products-chart__title">Tráfico de consultas por hora</h3>
        <span className="top-products-chart__sub">Distribución 0–23 h · se actualiza automáticamente</span>
      </div>

      {error ? (
        <p className="top-products-chart__empty">No se pudieron cargar las estadísticas de tráfico.</p>
      ) : !hasData ? (
        <p className="top-products-chart__empty">
          Aún no hay consultas registradas. Los datos aparecerán aquí cuando los clientes
          empiecen a preguntar por productos.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(99,102,241,0.2)', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#trafficGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default TrafficByHourChart;
