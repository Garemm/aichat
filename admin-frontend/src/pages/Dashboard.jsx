import { useEffect, useState } from 'react';
import { getDashboard } from '../services/api';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/ui/Spinner';
import Icon from '../components/ui/Icon';
import TopProductsChart from '../components/ui/TopProductsChart';
import TrafficByHourChart from '../components/ui/TrafficByHourChart';

// ── Stat card ────────────────────────────────────────────────────────────────
const STAT_CONFIG = [
  { key: 'products',   label: 'Productos',   icon: 'products',   color: 'indigo'  },
  { key: 'services',   label: 'Servicios',   icon: 'services',   color: 'emerald' },
  { key: 'promotions', label: 'Promociones', icon: 'promotions', color: 'amber'   },
];

const StatCard = ({ label, value, icon, color }) => (
  <div className={`stat-card stat-card--${color}`}>
    <div className="stat-card__icon"><Icon name={icon} size={22} /></div>
    <div className="stat-card__body">
      <span className="stat-card__value">{value ?? '—'}</span>
      <span className="stat-card__label">{label}</span>
    </div>
  </div>
);

// ── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { addToast }      = useToast();
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page page--center"><Spinner size={32} /></div>;
  if (!data)   return null;

  const { business, stats } = data;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h2>{business.name}</h2>
          <p className="text-muted">{business.city} &middot; {business.category_name || business.category}</p>
        </div>
      </div>

      <div className="stats-grid">
        {STAT_CONFIG.map(({ key, label, icon, color }) => (
          <StatCard key={key} label={label} value={stats[key]} icon={icon} color={color} />
        ))}
      </div>

      {business.description && (
        <div className="dashboard__desc">
          <p>{business.description}</p>
        </div>
      )}

      <TopProductsChart />

      <TrafficByHourChart />
    </div>
  );
};

export default Dashboard;

