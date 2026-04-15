import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar          from './Sidebar';
import Navbar           from './Navbar';
import SubscriptionGate from '../components/ui/SubscriptionGate';
import { useAuth }      from '../context/AuthContext';

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close  = useCallback(() => setSidebarOpen(false), []);
  const toggle = useCallback(() => setSidebarOpen((o) => !o), []);
  const { isActive } = useAuth();

  return (
    <div className={`admin-layout${sidebarOpen ? ' sidebar-open' : ''}${!isActive ? ' admin-layout--locked' : ''}`}>
      <Sidebar onClose={close} />

      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="sidebar-backdrop"
            onClick={close}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      <div className="admin-layout__main">
        <Navbar onMenuClick={toggle} />
        <main className="admin-layout__content">
          {isActive ? children : <SubscriptionGate />}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
