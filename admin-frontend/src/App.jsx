import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute  from './routes/ProtectedRoute';
import AdminLayout     from './layout/AdminLayout';

import Login        from './pages/Login';
import Dashboard    from './pages/Dashboard';
import Products     from './pages/Products';
import Categories   from './pages/Categories';
import Services     from './pages/Services';
import Promotions   from './pages/Promotions';
import BusinessInfo from './pages/BusinessInfo';
import Hours        from './pages/Hours';
import Import       from './pages/Import';

const App = () => (
  <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Routes>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard"  element={<Dashboard />}    />
                    <Route path="products"   element={<Products />}     />
                    <Route path="categories" element={<Categories />}   />
                    <Route path="services"   element={<Services />}     />
                    <Route path="promotions" element={<Promotions />}   />
                    <Route path="hours"      element={<Hours />}        />
                    <Route path="business"   element={<BusinessInfo />} />
                    <Route path="import"     element={<Import />}       />
                  </Routes>
                </AdminLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>
);

export default App;
