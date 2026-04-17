import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { changePassword } from '../services/api';

const ChangePassword = () => {
  const { addToast } = useToast();
  const navigate     = useNavigate();

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.newPassword.length < 8) {
      return setError('La nueva contraseña debe tener al menos 8 caracteres');
    }
    if (form.newPassword !== form.confirmPassword) {
      return setError('Las contraseñas nuevas no coinciden');
    }

    setLoading(true);
    try {
      await changePassword(form.currentPassword, form.newPassword, form.confirmPassword);
      addToast('Contraseña actualizada correctamente', 'success');
      navigate('../dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h2>Cambiar contraseña</h2>
          <p className="text-muted">Actualiza la contraseña de tu cuenta de administrador</p>
        </div>
      </div>

      <div style={{ maxWidth: 480 }}>
        <form className="form-card" onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}

          <div className="form-group">
            <label className="form-label">Contraseña actual</label>
            <input
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
              placeholder="Tu contraseña actual"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nueva contraseña</label>
            <input
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar nueva contraseña</label>
            <input
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              placeholder="Repite la nueva contraseña"
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={
                loading ||
                !form.currentPassword ||
                !form.newPassword ||
                !form.confirmPassword
              }
            >
              {loading ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
