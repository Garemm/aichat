import { useLocation } from 'react-router-dom';
import Icon from '../components/ui/Icon';

const TITLES = {
  '/dashboard':  'Dashboard',
  '/products':   'Productos',
  '/services':   'Servicios',
  '/promotions': 'Promociones',
  '/hours':      'Horarios',
  '/business':   'Mi Negocio',
};

const Navbar = ({ onMenuClick }) => {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Admin';

  return (
    <header className="navbar">
      <button className="navbar__hamburger" onClick={onMenuClick} aria-label="Abrir menú">
        <Icon name="menu" size={22} />
      </button>
      <h1 className="navbar__title">{title}</h1>
    </header>
  );
};

export default Navbar;
