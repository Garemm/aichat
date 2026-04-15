import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute    from './routes/ProtectedRoute';
import PermissionRoute   from './routes/PermissionRoute';
import ALL_LINKS         from './routes/navLinks';
import AdminLayout       from './layout/AdminLayout';
import PageTransition    from './components/ui/PageTransition';
import { useAuth }       from './context/AuthContext';

import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import Dashboard      from './pages/Dashboard';
import Products       from './pages/Products';
import Categories     from './pages/Categories';
import Services       from './pages/Services';
import Promotions     from './pages/Promotions';
import BusinessInfo   from './pages/BusinessInfo';
import Hours          from './pages/Hours';
import Import         from './pages/Import';
import ChangePassword from './pages/ChangePassword';
import Subscriptions from './pages/Subscriptions';
import Pedidos       from './pages/Pedidos';
import MiHayChat    from './pages/MiHayChat';

// Redirects to the first route the user has permission for
const SmartRedirect = () => {
  const { permissions } = useAuth();
  const firstAllowed = ALL_LINKS.find((l) => permissions[l.permKey] === true);
  return <Navigate to={firstAllowed ? firstAllowed.to : '/change-password'} replace />;
};

// Inner component so we can use useLocation inside BrowserRouter
const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Routes>
                  <Route index element={<SmartRedirect />} />
                  <Route path="dashboard"       element={<PermissionRoute permKey="dashboard">        <PageTransition><Dashboard /></PageTransition>       </PermissionRoute>} />
                  <Route path="orders"          element={<PermissionRoute permKey="pedidos">          <PageTransition><Pedidos /></PageTransition>          </PermissionRoute>} />
                  <Route path="products"        element={<PermissionRoute permKey="productos">        <PageTransition><Products /></PageTransition>         </PermissionRoute>} />
                  <Route path="categories"      element={<PermissionRoute permKey="categorias">       <PageTransition><Categories /></PageTransition>       </PermissionRoute>} />
                  <Route path="import"          element={<PermissionRoute permKey="importar_productos"><PageTransition><Import /></PageTransition>          </PermissionRoute>} />
                  <Route path="services"        element={<PermissionRoute permKey="servicios">        <PageTransition><Services /></PageTransition>         </PermissionRoute>} />
                  <Route path="promotions"      element={<PermissionRoute permKey="promociones">      <PageTransition><Promotions /></PageTransition>       </PermissionRoute>} />
                  <Route path="hours"           element={<PermissionRoute permKey="horarios">         <PageTransition><Hours /></PageTransition>            </PermissionRoute>} />
                  <Route path="mi-haychat"      element={<PermissionRoute permKey="mi_haychat">       <PageTransition><MiHayChat /></PageTransition>        </PermissionRoute>} />
                  <Route path="business"        element={<PermissionRoute permKey="mi_negocio">       <PageTransition><BusinessInfo /></PageTransition>     </PermissionRoute>} />
                  <Route path="subscriptions"   element={<PermissionRoute permKey="suscripciones">    <PageTransition><Subscriptions /></PageTransition>    </PermissionRoute>} />
                  <Route path="change-password" element={<PageTransition><ChangePassword /></PageTransition>} />
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
