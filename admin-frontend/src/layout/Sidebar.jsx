import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '../components/ui/Icon';

const links = [
  { to: '/dashboard',   label: 'Dashboard',   icon: 'dashboard'   },
  { to: '/products',    label: 'Productos',    icon: 'products'    },
  { to: '/categories',  label: 'Categorías',   icon: 'categories'  },
  { to: '/import',      label: 'Importar Productos',     icon: 'upload'      },
  { to: '/services',    label: 'Servicios',    icon: 'services'    },
  { to: '/promotions',  label: 'Promociones',  icon: 'promotions'  },
  { to: '/hours',       label: 'Horarios',     icon: 'hours'       },
  { to: '/business',    label: 'Mi Negocio',   icon: 'business'    },
];

// Stagger container: each child animates in sequence
const navContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.1 },
  },
};

const navItemVariants = {
  hidden:  { opacity: 0, x: -18 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const SidebarLink = ({ to, label, icon, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
  >
    {({ isActive }) => (
      <motion.span
        className="sidebar__link-inner"
        whileHover={{ x: 3, scale: 1.01 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      >
        <motion.span
          className="sidebar__link-icon-wrap"
          animate={isActive ? { scale: 1.15, rotate: 0 } : { scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Icon name={icon} size={17} className="sidebar__link-icon" />
        </motion.span>
        <span>{label}</span>

        {/* Active glow pill */}
        {isActive && (
          <motion.span
            className="sidebar__active-pill"
            layoutId="sidebar-active-pill"
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
      </motion.span>
    )}
  </NavLink>
);

const Sidebar = ({ onClose }) => {
  const handleNav = () => {
    if (window.innerWidth < 900) onClose?.();
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <motion.div
        className="sidebar__brand"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <motion.span
          className="sidebar__brand-dot"
          animate={{ boxShadow: ['0 0 8px rgba(99,102,241,0.6)', '0 0 18px rgba(99,102,241,0.9)', '0 0 8px rgba(99,102,241,0.6)'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        Admin Panel
        <motion.button
          className="sidebar__close"
          onClick={onClose}
          aria-label="Cerrar menú"
          whileHover={{ rotate: 90, scale: 1.1 }}
          whileTap={{ scale: 0.85 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <Icon name="x" size={18} />
        </motion.button>
      </motion.div>

      {/* Nav */}
      <motion.nav
        className="sidebar__nav"
        variants={navContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {links.map(({ to, label, icon }) => (
          <motion.div key={to} variants={navItemVariants}>
            <SidebarLink to={to} label={label} icon={icon} onClick={handleNav} />
          </motion.div>
        ))}
      </motion.nav>
    </aside>
  );
};

export default Sidebar;
