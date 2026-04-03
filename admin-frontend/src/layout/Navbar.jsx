import { useLocation } from 'react-router-dom';

const TITLES = {
  '/dashboard':  'Dashboard',
  '/products':   'Productos',
  '/services':   'Servicios',
  '/promotions': 'Promociones',
  '/hours':      'Horarios',
  '/business':   'Mi Negocio',
};

const Navbar = () => {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Admin';

  return (
    <header className="navbar">
      <h1 className="navbar__title">{title}</h1>
    </header>
  );
};

export default Navbar;
