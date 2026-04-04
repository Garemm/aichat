import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute  from './routes/ProtectedRoute';
import AdminLayout     from './layout/AdminLayout';
import PageTransition  from './components/ui/PageTransition';

import Login        from './pages/Login';
import Dashboard    from './pages/Dashboard';
import Products     from './pages/Products';
import Categories   from './pages/Categories';
import Services     from './pages/Services';
import Promotions   from './pages/Promotions';
import BusinessInfo from './pages/BusinessInfo';
import Hours        from './pages/Hours';
import Import       from './pages/Import';

// Inner component so we can use useLocation inside BrowserRouter
const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Login />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Routes>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard"  element={<PageTransition><Dashboard /></PageTransition>}    />
                  <Route path="products"   element={<PageTransition><Products /></PageTransition>}     />
                  <Route path="categories" element={<PageTransition><Categories /></PageTransition>}   />
                  <Route path="services"   element={<PageTransition><Services /></PageTransition>}     />
                  <Route path="promotions" element={<PageTransition><Promotions /></PageTransition>}   />
                  <Route path="hours"      element={<PageTransition><Hours /></PageTransition>}        />
                  <Route path="business"   element={<PageTransition><BusinessInfo /></PageTransition>} />
                  <Route path="import"     element={<PageTransition><Import /></PageTransition>}       />
                </Routes>
              </AdminLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>
);

export default App;
