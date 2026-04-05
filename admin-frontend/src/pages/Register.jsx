import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/api';

const INITIAL = {
  name: '', category: '', description: '', city: '', email: '',
  phone: '', webpage_link: '', username: '', password: '', confirmPassword: '',
};

const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'hardware',   label: 'Ferretería / Hardware' },
  { value: 'stationery', label: 'Papelería' },
];

const Register = () => {
  const navigate = useNavigate();
  const [form, setForm]       = useState(INITIAL);
  const [errors, setErrors]   = useState({});
  const [serverErr, setServerErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // ── Client-side validation ────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.name.trim())     e.name     = 'Requerido';
    if (!form.category)        e.category = 'Selecciona una categoría';
    if (!form.city.trim())     e.city     = 'Requerido';
    if (!form.email.trim())    e.email    = 'Requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                               e.email    = 'Email inválido';
    if (!form.username.trim()) e.username = 'Requerido';
    if (!form.password)        e.password = 'Requerido';
    else if (form.password.length < 6)
                               e.password = 'Mínimo 6 caracteres';
    if (!form.confirmPassword) e.confirmPassword = 'Requerido';
    else if (form.password !== form.confirmPassword)
                               e.confirmPassword = 'Las contraseñas no coinciden';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerErr('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await register(form);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setServerErr(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="login-screen">
        <div className="register-success">
          <div className="register-success__icon">✓</div>
          <h2>¡Cuenta creada!</h2>
          <p>Tu negocio fue registrado correctamente. Redirigiendo al login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="register-card" onSubmit={handleSubmit} noValidate>
        {/* Header */}
        <div className="register-card__header">
          <h1>Crear cuenta</h1>
          <p>Registra tu negocio y empieza a usar el panel</p>
        </div>

        {serverErr && <div className="register-alert">{serverErr}</div>}

        {/* ── Section: Negocio ─────────────────────────────────────────── */}
        <div className="register-section">
          <div className="register-section__label">Información del negocio</div>

          <div className="register-row register-row--2">
            <Field
              label="Nombre de la empresa *"
              error={errors.name}
            >
              <input
                type="text"
                placeholder="Ej. Tacos El Paisa"
                value={form.name}
                onChange={set('name')}
                className={errors.name ? 'input-error' : ''}
              />
            </Field>
            <Field label="Categoría *" error={errors.category}>
              <select
                value={form.category}
                onChange={set('category')}
                className={errors.category ? 'input-error' : ''}
              >
                <option value="">Seleccionar…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Descripción" error={errors.description}>
            <textarea
              rows={3}
              placeholder="Breve descripción de tu negocio…"
              value={form.description}
              onChange={set('description')}
            />
          </Field>

          <div className="register-row register-row--2">
            <Field label="Ciudad *" error={errors.city}>
              <input
                type="text"
                placeholder="Ej. Guadalajara"
                value={form.city}
                onChange={set('city')}
                className={errors.city ? 'input-error' : ''}
              />
            </Field>
            <Field label="Email *" error={errors.email}>
              <input
                type="email"
                placeholder="contacto@negocio.com"
                value={form.email}
                onChange={set('email')}
                className={errors.email ? 'input-error' : ''}
              />
            </Field>
          </div>

          <div className="register-row register-row--2">
            <Field label="Teléfono" error={errors.phone}>
              <input
                type="tel"
                placeholder="33 1234 5678"
                value={form.phone}
                onChange={set('phone')}
              />
            </Field>
            <Field label="Página web" error={errors.webpage_link}>
              <input
                type="url"
                placeholder="https://mi-negocio.com"
                value={form.webpage_link}
                onChange={set('webpage_link')}
              />
            </Field>
          </div>
        </div>

        {/* ── Section: Cuenta de acceso ────────────────────────────────── */}
        <div className="register-section">
          <div className="register-section__label">Cuenta de acceso</div>

          <Field label="Username *" error={errors.username}>
            <input
              type="text"
              placeholder="mi_negocio_admin"
              autoComplete="username"
              value={form.username}
              onChange={set('username')}
              className={errors.username ? 'input-error' : ''}
            />
          </Field>

          <div className="register-row register-row--2">
            <Field label="Contraseña *" error={errors.password}>
              <input
                type="password"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                className={errors.password ? 'input-error' : ''}
              />
            </Field>
            <Field label="Confirmar contraseña *" error={errors.confirmPassword}>
              <input
                type="password"
                placeholder="Repite la contraseña"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                className={errors.confirmPassword ? 'input-error' : ''}
              />
            </Field>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn--primary register-submit"
          disabled={loading}
        >
          {loading ? (
            <span className="register-spinner" />
          ) : (
            'Crear cuenta'
          )}
        </button>

        <p className="register-card__footer">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="register-link">Iniciar sesión</Link>
        </p>
      </form>
    </div>
  );
};

// ── Small helper component ────────────────────────────────────────────────────
const Field = ({ label, error, children }) => (
  <label className={`register-field${error ? ' register-field--err' : ''}`}>
    <span className="register-field__label">{label}</span>
    {children}
    {error && <span className="register-field__err">{error}</span>}
  </label>
);

export default Register;
