import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { signIn } = useAuth();
  const navigate   = useNavigate();
  const [form, setForm]   = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(form.username, form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Admin Panel</h1>
        {error && <p className="form-error">{error}</p>}
        <label>
          Usuario
          <input
            type="text"
            value={form.username}
            autoComplete="username"
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={form.password}
            autoComplete="current-password"
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={loading || !form.username || !form.password}>
          {loading ? 'Entrando…' : 'Iniciar sesión'}
        </button>

        <p className="login-card__footer">
          <Link to="/forgot-password" className="register-link">¿Olvidaste tu contraseña?</Link>
        </p>

        <p className="login-card__footer">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="register-link">Crear cuenta</Link>
        </p>
      </form>
    </div>
  );
};

export default Login;
