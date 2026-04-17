import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ALL_LINKS from './navLinks';

/**
 * PermissionRoute — Guards a route by a permission key.
 *
 * If `permissions[permKey]` is not true, the user is redirected to the first
 * route they DO have permission for, or to /change-password as a safe fallback.
 */
const PermissionRoute = ({ permKey, children }) => {
  const { permissions } = useAuth();

  if (permissions[permKey] === true) {
    return children;
  }

  // Find the first accessible route from the shared nav list
  const firstAllowed = ALL_LINKS.find((l) => permissions[l.permKey] === true);
  return <Navigate to={firstAllowed ? firstAllowed.to : 'change-password'} replace />;
};

export default PermissionRoute;
