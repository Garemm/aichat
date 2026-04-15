import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../services/api';

const ForgotPassword = () => {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Recuperar contraseña</h1>

        {sent ? (
          <>
            <p style={{ textAlign: 'center', color: 'var(--success, #22c55e)', fontWeight: 600 }}>
              ¡Correo enviado!
            </p>
            <p style={{ textAlign: 'center', fontSize: '.875rem', color: 'var(--text-2)' }}>
              Si el correo está registrado recibirás un enlace para restablecer tu contraseña en los
              próximos minutos. Revisa también la carpeta de spam. 
              De lo contrario, por favor revisa que lo hayas escrito correctamente o contacta al soporte. Gracias.
            </p>
            <Link to="/login" className="register-link" style={{ textAlign: 'center', display: 'block' }}>
              Volver al inicio de sesión
            </Link>
          </>
        ) : (
          <>
            <p style={{ fontSize: '.875rem', color: 'var(--text-2)', margin: '0 0 4px' }}>
              Ingresa el correo electrónico de tu negocio y te enviaremos un enlace para
              restablecer tu contraseña.
            </p>

            {error && <p className="form-error">{error}</p>}

            <label>
              Correo electrónico
              <input
                type="email"
                value={email}
                autoComplete="email"
                placeholder="correo@tunegocio.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <button type="submit" disabled={loading || !email}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
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

export default ForgotPassword;
