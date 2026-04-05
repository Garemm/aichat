import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { login as apiLogin, apiRefresh, apiLogout, setAccessToken, setRefreshCallback } from '../services/api';
import Spinner from '../components/ui/Spinner';

const AuthContext = createContext(null);

/**
 * AuthProvider — JWT-based session management.
 *
 * Security model:
 *   • Access token (15 min)  → stored in React state ONLY (memory, not localStorage).
 *     Never touches the DOM or a cookie — immune to XSS attacks.
 *   • Refresh token (7 days) → HTTP-only cookie set by the server.
 *     Invisible to JavaScript — immune to XSS.
 *
 * Session persistence:
 *   On every page load the provider attempts a silent refresh via POST /admin/refresh.
 *   If the HTTP-only cookie is still valid, the session is restored transparently.
 *   If not, the user is shown the login screen.
 *
 * Auto-refresh:
 *   A timer fires 1 minute before the access token expires (at 14 min) so the
 *   user never experiences an expired-token interruption during active use.
 */
export const AuthProvider = ({ children }) => {
  const [businessId, setBusinessId] = useState(null);
  const [isReady,    setIsReady]    = useState(false); // false while checking cookie on boot
  const refreshTimerRef = useRef(null);

  // ── Core refresh logic ───────────────────────────────────────────────────
  const silentRefresh = useCallback(async () => {
    try {
      const { accessToken, businessId: bizId } = await apiRefresh();
      setAccessToken(accessToken);   // push token into api.js module scope
      setBusinessId(bizId);

      // Re-arm timer for 14 minutes (fires 1 min before 15 min access token expires)
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(silentRefresh, 14 * 60 * 1000);

      return accessToken;
    } catch {
      // Cookie invalid/expired — user must log in
      setAccessToken(null);
      setBusinessId(null);
      return null;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register silentRefresh as the 401-recovery callback for api.js
  useEffect(() => {
    setRefreshCallback(silentRefresh);
    return () => setRefreshCallback(null);
  }, [silentRefresh]);

  // On mount: silently restore session from the HTTP-only cookie
  useEffect(() => {
    silentRefresh().finally(() => setIsReady(true));
    return () => clearTimeout(refreshTimerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API ───────────────────────────────────────────────────────────
  const signIn = async (username, password) => {
    const { accessToken, businessId: bizId } = await apiLogin(username, password);
    setAccessToken(accessToken);
    setBusinessId(bizId);

    // Arm auto-refresh timer
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(silentRefresh, 14 * 60 * 1000);
  };

  const signOut = async () => {
    clearTimeout(refreshTimerRef.current);
    await apiLogout(); // best-effort: clears server cookie
    setAccessToken(null);
    setBusinessId(null);
  };

  // Show a centered spinner while checking the cookie on first load
  if (!isReady) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={32} />
      </div>
    );
  }

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

