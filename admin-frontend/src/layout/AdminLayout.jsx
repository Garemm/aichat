import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import Navbar  from './Navbar';

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = useCallback(() => setSidebarOpen(false), []);
  const toggle = useCallback(() => setSidebarOpen((o) => !o), []);

  return (
    <div className={`admin-layout${sidebarOpen ? ' sidebar-open' : ''}`}>
      <Sidebar onClose={close} />
      {sidebarOpen && <div className="sidebar-backdrop" onClick={close} aria-hidden="true" />}
      <div className="admin-layout__main">
        <Navbar onMenuClick={toggle} />
        <main className="admin-layout__content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
