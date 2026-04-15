import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Eye icon SVGs (inline, no extra dependency) ── */
const EyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOff = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const Login = () => {
  const { signIn } = useAuth();
  const navigate   = useNavigate();
  const [form,    setForm]    = useState({ username: '', password: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(form.username, form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit} noValidate>

        {/* Logo / brand */}
        <div className="login-card__brand">
          <div className="login-card__logo-ring">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4"/>
              <path d="M9 9h6M9 12h6M9 15h4"/>
            </svg>
          </div>
          <h1 className="login-card__title">hayChat Panel</h1>
          <p className="login-card__sub">Ingresa tus credenciales para continuar</p>
        </div>

        {/* Error */}
        {error && (
          <div className="login-card__error" role="alert">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Fields */}
        <div className="login-card__fields">
          <div className="lc-field">
            <label className="lc-field__label" htmlFor="lc-username">Usuario</label>
            <div className="lc-field__wrap">
              <span className="lc-field__icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                id="lc-username"
                type="text"
                className="lc-field__input"
                placeholder="Tu nombre de usuario"
                value={form.username}
                autoComplete="username"
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
          </div>

          <div className="lc-field">
            <label className="lc-field__label" htmlFor="lc-password">Contraseña</label>
            <div className="lc-field__wrap">
              <span className="lc-field__icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                id="lc-password"
                type={showPwd ? 'text' : 'password'}
                className="lc-field__input"
                placeholder="Tu contraseña"
                value={form.password}
                autoComplete="current-password"
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              <button
                type="button"
                className="lc-field__eye"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                {showPwd ? <EyeOff /> : <EyeOpen />}
              </button>
            </div>
          </div>
        </div>

        {/* Forgot password */}
        <div className="login-card__forgot">
          <Link to="/forgot-password" className="register-link">¿Olvidaste tu contraseña?</Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="login-card__submit"
          disabled={loading || !form.username || !form.password}
        >
          {loading
            ? <><span className="login-card__spinner" /> Entrando…</>
            : 'Iniciar sesión'}
        </button>

        {/* Register */}
        <p className="login-card__footer">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="register-link">Crear cuenta</Link>
        </p>
      </form>

    </div>
  );
};

export default Login;
