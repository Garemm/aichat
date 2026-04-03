import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/ui/Icon';

const links = [
  { to: '/dashboard',   label: 'Dashboard',   icon: 'dashboard'   },
  { to: '/products',    label: 'Productos',    icon: 'products'    },
  { to: '/services',    label: 'Servicios',    icon: 'services'    },
  { to: '/promotions',  label: 'Promociones',  icon: 'promotions'  },
  { to: '/hours',       label: 'Horarios',     icon: 'hours'       },
  { to: '/business',    label: 'Mi Negocio',   icon: 'business'    },
];

const Sidebar = () => {
  const { signOut } = useAuth();
  const navigate    = useNavigate();

  const handleLogout = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-dot" />
        Admin Panel
      </div>
      <nav className="sidebar__nav">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
          >
            <Icon name={icon} size={18} className="sidebar__link-icon" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <button className="sidebar__logout" onClick={handleLogout}>
        <Icon name="logout" size={18} className="sidebar__link-icon" />
        <span>Cerrar sesión</span>
      </button>
    </aside>
  );
};

export default Sidebar;
