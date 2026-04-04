import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/ui/Icon';

const TITLES = {
  '/dashboard':  'Dashboard',
  '/products':   'Productos',
  '/import':     'Importar',
  '/services':   'Servicios',
  '/promotions': 'Promociones',
  '/hours':      'Horarios',
  '/business':   'Mi Negocio',
};

const Navbar = ({ onMenuClick }) => {
  const { pathname } = useLocation();
  const { signOut }  = useAuth();
  const navigate     = useNavigate();
  const title = TITLES[pathname] ?? 'Admin';

  const handleLogout = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className="navbar">
      <div className="navbar__left">
        <button className="navbar__hamburger" onClick={onMenuClick} aria-label="Abrir menú">
          <Icon name="menu" size={22} />
        </button>
        <h1 className="navbar__title">{title}</h1>
      </div>
      <button className="navbar__logout" onClick={handleLogout} aria-label="Cerrar sesión">
        <Icon name="logout" size={16} />
        <span>Cerrar sesión</span>
      </button>
    </header>
  );
};

export default Navbar;
