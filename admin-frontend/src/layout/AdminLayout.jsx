import Sidebar from './Sidebar';
import Navbar  from './Navbar';

const AdminLayout = ({ children }) => (
  <div className="admin-layout">
    <Sidebar />
    <div className="admin-layout__main">
      <Navbar />
      <main className="admin-layout__content">
        {children}
      </main>
    </div>
  </div>
);

export default AdminLayout;
