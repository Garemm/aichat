import { createContext, useContext, useState } from 'react';
import { login as apiLogin } from '../services/api';

const AuthContext = createContext(null);

const getStoredBizId = () => {
  const v = localStorage.getItem('admin_business_id');
  return v ? parseInt(v, 10) : null;
};

export const AuthProvider = ({ children }) => {
  const [businessId, setBusinessId] = useState(getStoredBizId);

  const signIn = async (username, password) => {
    const result = await apiLogin(username, password);
    const id = result.businessId;
    localStorage.setItem('admin_business_id', String(id));
    setBusinessId(id);
  };

  const signOut = () => {
    localStorage.removeItem('admin_business_id');
    setBusinessId(null);
  };

  return (
    <AuthContext.Provider value={{ businessId, isAuthenticated: !!businessId, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>');
  return ctx;
};
