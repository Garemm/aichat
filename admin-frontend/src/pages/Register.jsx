import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { marked } from 'marked';
import { register, getBusinessTypes, getLegalDocument } from '../services/api';

const INITIAL = {
  name: '', category: '', description: '', city: '', email: '',
  phone: '', webpage_link: '', username: '', password: '', confirmPassword: '',
};

const Register = () => {
  const navigate = useNavigate();
  const [form, setForm]           = useState(INITIAL);
  const [errors, setErrors]       = useState({});
  const [serverErr, setServerErr] = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [categories, setCategories]   = useState([]);
  const [catLoading, setCatLoading]   = useState(true);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedTerms, setAcceptedTerms]     = useState(false);
  const [activeLegal, setActiveLegal] = useState('');
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState('');
  const [legalHtml, setLegalHtml] = useState('');

  useEffect(() => {
    getBusinessTypes()
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCatLoading(false));
  }, []);

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
    if (!acceptedPrivacy)      e.acceptedPrivacy = 'Debes leer y aceptar el aviso de privacidad';
    if (!acceptedTerms)        e.acceptedTerms   = 'Debes aceptar los términos y condiciones';
    return e;
  };

  const openLegalModal = async (type) => {
    setActiveLegal(type);
    setLegalOpen(true);
    setLegalLoading(true);
    setLegalError('');
    setLegalHtml('');

    try {
      const content = await getLegalDocument(type);
      setLegalHtml(marked.parse(content || ''));
    } catch (err) {
      setLegalError(err.message || 'No se pudo cargar el documento');
    } finally {
      setLegalLoading(false);
    }
  };

  const closeLegalModal = () => {
    setLegalOpen(false);
    setLegalError('');
    setLegalLoading(false);
  };

  const isFormValid = acceptedPrivacy && acceptedTerms;

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
          <p>Tu negocio automatizado en tres pasos.</p>
          <p>Registra tu empresa, administra tus productos y activa tu propio chatbot inteligente hoy mismo!</p>
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
                disabled={catLoading}
              >
                <option value="">{catLoading ? 'Cargando…' : 'Seleccionar…'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name.charAt(0).toUpperCase() + c.name.slice(1)}
                  </option>
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

        <div className={`register-consent${errors.acceptedPrivacy || errors.acceptedTerms ? ' register-consent--err' : ''}`}>
          <label className="register-consent__item">
            <input
              type="checkbox"
              checked={acceptedPrivacy}
              onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              required
            />
            <span>
              Leí el{' '}
              <button
                type="button"
                className="register-consent__link"
                onClick={() => openLegalModal('privacy')}
              >
                aviso de privacidad
              </button>
            </span>
          </label>

          <label className="register-consent__item">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
            />
            <span>
              Acepto los{' '}
              <button
                type="button"
                className="register-consent__link"
                onClick={() => openLegalModal('terms')}
              >
                términos y condiciones
              </button>
            </span>
          </label>

          {(errors.acceptedPrivacy || errors.acceptedTerms) && (
            <span className="register-consent__err">
              Debes aceptar ambos documentos para crear tu cuenta.
            </span>
          )}
        </div>

        <button
          type="submit"
          className="btn btn--primary register-submit"
          disabled={loading || !isFormValid}
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

      {legalOpen && (
        <LegalModal
          title={activeLegal === 'privacy' ? 'Aviso de privacidad' : 'Términos y condiciones'}
          loading={legalLoading}
          error={legalError}
          html={legalHtml}
          onClose={closeLegalModal}
        />
      )}
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

const LegalModal = ({ title, loading, error, html, onClose }) => (
  <div className="legal-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div className="legal-modal">
      <div className="legal-modal__head">
        <h3>{title}</h3>
        <button type="button" className="legal-modal__close" onClick={onClose} aria-label="Cerrar">
          Cerrar
        </button>
      </div>

      <div className="legal-modal__body">
        {loading && <p className="legal-modal__state">Cargando documento...</p>}
        {!loading && error && <p className="legal-modal__state legal-modal__state--err">{error}</p>}
        {!loading && !error && (
          <div className="legal-modal__content" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  </div>
);

export default Register;
