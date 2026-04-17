import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '../components/ui/Icon';
import { useAuth } from '../context/AuthContext';
import logo from '../images/hayChat.png';
import ALL_LINKS from '../routes/navLinks';

const bottomLinks = [
  { to: 'change-password', label: 'Cambiar contraseña', icon: 'lock' },
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

const SidebarLink = ({ to, label, icon, onClick, locked }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
    tabIndex={locked ? -1 : undefined}
    aria-disabled={locked || undefined}
  >
    {({ isActive }) => (
      <motion.span
        className="sidebar__link-inner"
        whileHover={locked ? {} : { x: 3, scale: 1.01 }}
        whileTap={locked ? {} : { scale: 0.97 }}
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

        {/* Lock badge when subscription is inactive */}
        {locked && (
          <span className="sidebar__link-lock">
            <Icon name="lock" size={11} />
          </span>
        )}

        {/* Active glow pill */}
        {isActive && !locked && (
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
  const { permissions, isActive } = useAuth();
  const locked = !isActive;
  const handleNav = () => {
    if (window.innerWidth < 900) onClose?.();
  };

  // Only show links whose permission key is TRUE in permissions_types.
  // Falls back to empty list when permissions object is empty (no plan assigned).
  const visibleLinks = ALL_LINKS.filter((l) => permissions[l.permKey] === true);

  return (
    <aside className={`sidebar${locked ? ' sidebar--locked' : ''}`}>
      {/* Brand / Logo */}
      <motion.div
        className="sidebar__brand"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Animated accent line at top */}
        <motion.span
          className="sidebar__brand-line"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
        />

        {/* Logo card */}
        <div className="sidebar__logo-wrap">
          <motion.div
            className="sidebar__logo-glow"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <img src={logo} alt="hayChat Business" className="sidebar__logo-img" />
        </div>

        {/* Close button — mobile only */}
        <motion.button
          className="sidebar__close"
          onClick={onClose}
          aria-label="Cerrar menú"
          whileHover={{ rotate: 90, scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <Icon name="x" size={16} />
        </motion.button>
      </motion.div>

      {/* Nav */}
      <motion.nav
        className="sidebar__nav"
        variants={navContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {visibleLinks.map(({ to, label, icon }) => (
          <motion.div key={to} variants={navItemVariants}>
            <SidebarLink to={to} label={label} icon={icon} onClick={handleNav} locked={locked} />
          </motion.div>
        ))}
      </motion.nav>

      {/* Footer — change password, visually separated */}
      <motion.div
        className="sidebar__footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.3 }}
      >
        <div className="sidebar__divider" />
        {bottomLinks.map(({ to, label, icon }) => (
          <SidebarLink key={to} to={to} label={label} icon={icon} onClick={handleNav} locked={locked} />
        ))}
      </motion.div>
    </aside>
  );
};

export default Sidebar;
