import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/ui/Icon';

const TITLES = {
  '/dashboard':       'Dashboard',
  '/products':        'Productos',
  '/orders':        'Pedidos',
  '/categories':      'Categorías',
  '/import':          'Importar',
  '/services':        'Servicios',
  '/promotions':      'Promociones',
  '/hours':           'Horarios',
  '/business':        'Mi Negocio',
  '/subscriptions': 'Suscripciones',
  '/change-password': 'Cambiar Contraseña',
};

const Navbar = ({ onMenuClick }) => {
  const { pathname } = useLocation();
  const { signOut, isActive }  = useAuth();
  const navigate     = useNavigate();
  const title = TITLES[pathname] ?? 'Admin';
  const locked = !isActive;

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className={`navbar${locked ? ' navbar--locked' : ''}`}>
      <div className="navbar__left">
        <motion.button
          className="navbar__hamburger"
          onClick={onMenuClick}
          aria-label="Abrir menú"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.88 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          <Icon name="menu" size={22} />
        </motion.button>

        {/* Title animates out/in when the route changes */}
        <AnimatePresence mode="wait">
          <motion.h1
            key={title}
            className="navbar__title"
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>

      <motion.button
        className="navbar__logout"
        onClick={handleLogout}
        aria-label="Cerrar sesión"
        whileHover={{ scale: 1.04, y: -1 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      >
        <Icon name="logout" size={16} />
        <span>Cerrar sesión</span>
      </motion.button>
    </header>
  );
};

export default Navbar;
