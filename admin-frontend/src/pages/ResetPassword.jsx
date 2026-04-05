import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../services/api';

const ResetPassword = () => {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const token           = searchParams.get('token') || '';

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      return setError('La contraseña debe tener al menos 8 caracteres');
    }
    if (form.password !== form.confirmPassword) {
      return setError('Las contraseñas no coinciden');
    }

    setLoading(true);
    try {
      await resetPassword(token, form.password, form.confirmPassword);
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Enlace inválido</h1>
          <p style={{ textAlign: 'center', fontSize: '.875rem', color: 'var(--text-2)' }}>
            Este enlace de restablecimiento no es válido o ya fue utilizado.
          </p>
          <Link to="/forgot-password" className="register-link" style={{ textAlign: 'center', display: 'block' }}>
            Solicitar nuevo enlace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Nueva contraseña</h1>

        {success ? (
          <>
            <p style={{ textAlign: 'center', color: 'var(--success, #22c55e)', fontWeight: 600 }}>
              ¡Contraseña actualizada!
            </p>
            <p style={{ textAlign: 'center', fontSize: '.875rem', color: 'var(--text-2)' }}>
              Serás redirigido al inicio de sesión…
            </p>
          </>
        ) : (
          <>
            {error && <p className="form-error">{error}</p>}

            <label>
              Nueva contraseña
              <input
                type="password"
                value={form.password}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>

            <label>
              Confirmar contraseña
              <input
                type="password"
                value={form.confirmPassword}
                autoComplete="new-password"
                placeholder="Repite la contraseña"
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              />
            </label>

            <button
              type="submit"
              disabled={loading || !form.password || !form.confirmPassword}
            >
              {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
            </button>

            <p className="login-card__footer">
              <Link to="/login" className="register-link">Volver al inicio de sesión</Link>
            </p>
          </>
        )}
      </form>
    </div>
  );
};

export default ResetPassword;
